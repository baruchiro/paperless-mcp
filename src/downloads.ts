import { randomBytes } from "node:crypto";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import express from "express";
import { fileName } from "./uploads";

const TTL_MS = 15 * 60_000;
const NOT_FOUND_TEXT = "The document does not exist any more.\n";
const BAD_GATEWAY_TEXT = "The server could not get the file from Paperless.\n";

export interface DownloadsOptions {
  /** The base URL of Paperless, for example https://paperless.example.com */
  paperlessUrl: string;
  /** The public base URL of the download route, for example https://paperless-download.example.com */
  publicUrl: string;
  now?: () => number;
}

interface Entry {
  id: string;
  documentId: number;
  original: boolean;
  callerToken: string;
  expiresAt: number;
}

/**
 * Single-use download links. A link lets a person (a phone browser) get the
 * file of one document with the caller's own Paperless token, so claude.ai
 * on the phone never needs a Paperless token of its own.
 */
export class Downloads {
  private readonly paperlessUrl: string;
  private readonly publicUrl: string;
  private readonly now: () => number;
  // shortcut: the entries are in memory, so a restart loses the open links. Persist them if the server runs more than one pod.
  private readonly byToken = new Map<string, Entry>();

  constructor(options: DownloadsOptions) {
    this.paperlessUrl = options.paperlessUrl.replace(/\/+$/, "");
    this.publicUrl = options.publicUrl.replace(/\/+$/, "");
    this.now = options.now ?? Date.now;
  }

  request(documentId: number, callerToken: string, original: boolean) {
    this.purge();
    const id = randomBytes(12).toString("base64url");
    const token = randomBytes(32).toString("base64url");
    const expiresAt = this.now() + TTL_MS;
    this.byToken.set(token, {
      id,
      documentId,
      original,
      callerToken,
      expiresAt,
    });
    return {
      download_id: id,
      url: `${this.publicUrl}/download/${token}`,
      expires_at: new Date(expiresAt).toISOString(),
    };
  }

  router(): express.Router {
    const router = express.Router();

    // The token is in the path: keep it out of Referer headers and caches.
    router.use("/download", (_req, res, next) => {
      res.set({
        "Referrer-Policy": "no-referrer",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
      next();
    });

    router.get("/download/:token", async (req, res) => {
      // The first try uses the link, also when Paperless then fails.
      const entry = this.take(req.params.token);
      if (!entry) {
        res.status(404).type("text").send(NOT_FOUND_TEXT);
        return;
      }
      await this.stream(entry, res);
    });

    return router;
  }

  private async stream(entry: Entry, res: express.Response): Promise<void> {
    const query = entry.original ? "?original=true" : "";
    let upstream: Response;
    try {
      upstream = await fetch(
        `${this.paperlessUrl}/api/documents/${entry.documentId}/download/${query}`,
        { headers: { Authorization: `Token ${entry.callerToken}` } }
      );
    } catch (err) {
      this.failed(entry.id, "could not reach Paperless", err);
      res.status(502).type("text").send(BAD_GATEWAY_TEXT);
      return;
    }

    if (upstream.status === 404) {
      res.status(404).type("text").send(NOT_FOUND_TEXT);
      return;
    }
    if (!upstream.ok || !upstream.body) {
      this.failed(entry.id, `Paperless answered ${upstream.status}`);
      res.status(502).type("text").send(BAD_GATEWAY_TEXT);
      return;
    }

    const contentType =
      upstream.headers.get("content-type") ?? "application/octet-stream";
    const length = upstream.headers.get("content-length");
    res.set("Content-Type", contentType);
    res.set(
      "Content-Disposition",
      `attachment; filename="${downloadName(
        upstream.headers.get("content-disposition"),
        entry.documentId,
        contentType
      )}"`
    );
    if (length) res.set("Content-Length", length);

    try {
      await pipeline(Readable.fromWeb(upstream.body as never), res);
    } catch (err) {
      this.failed(entry.id, "failed while streaming", err);
      res.destroy();
    }
  }

  private failed(id: string, reason: string, err?: unknown) {
    const detail = err instanceof Error ? err.message : err ? String(err) : "";
    console.error(
      `[paperless-mcp] download ${id} ${reason}${detail ? `: ${detail}` : ""}`
    );
  }

  private take(token: string): Entry | undefined {
    const entry = this.byToken.get(token);
    this.byToken.delete(token);
    if (!entry || this.now() > entry.expiresAt) return undefined;
    return entry;
  }

  private purge() {
    const limit = this.now();
    this.byToken.forEach((entry, token) => {
      if (entry.expiresAt < limit) this.byToken.delete(token);
    });
  }
}

// The extension of the fallback name, one for each type the upload links
// accept (ruling R6 of task-7-brief.md); any other type gets none.
const EXTENSIONS: Record<string, string> = {
  "application/pdf": ".pdf",
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/tiff": ".tiff",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "image/heic": ".heic",
  "image/heif": ".heic",
};

// Paperless gives the name as `filename="..."` or `filename*=UTF-8''...`;
// only the plain form is parsed (ruling of task-7-brief.md).
function downloadName(
  disposition: string | null,
  documentId: number,
  contentType: string
): string {
  const match = disposition ? /filename="([^"]*)"/.exec(disposition) : null;
  if (match) return fileName(match[1]);
  const type = contentType.split(";")[0].trim();
  const ext = EXTENSIONS[type] ?? "";
  return fileName(`document-${documentId}${ext}`);
}
