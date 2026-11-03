import busboy from "busboy";
import { randomBytes } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import express from "express";
import { PaperlessAPI } from "./api/PaperlessAPI";

const TTL_MS = 15 * 60_000;
// The status of an upload stays available for a day after the link expires.
const KEEP_MS = 24 * 60 * 60_000;
const DEFAULT_MAX_BYTES = 50 * 1024 * 1024;
// The multipart envelope adds a little to the size of the file.
const ENVELOPE_BYTES = 64 * 1024;
// Each upload gets this tag, so the person can find what agents added.
const UPLOAD_TAG = "via-mcp";
const INVALID_LINK =
  "This upload link is not valid: a person used it, it expired, or it does not exist.\n";
const PNG = Buffer.from("89504e470d0a1a0a", "hex");
const HEIF_BRANDS = ["heic", "heix", "heim", "heis", "hevc", "mif1"];

export interface UploadMetadata {
  title?: string;
  tags?: number[];
  correspondent?: number;
  document_type?: number;
}

export interface UploadsOptions {
  /** A PaperlessAPI with the token of the upload user. This user can only add documents, and view tags, correspondents, document types and tasks. */
  api: PaperlessAPI;
  /** The public base URL of the upload route, for example https://paperless-upload.example.com */
  publicUrl: string;
  maxBytes?: number;
  now?: () => number;
}

/**
 * The upload links need a token of their own: the browser or curl that sends
 * the file has no Paperless token. They need an HTTP route, so stdio mode has none.
 */
export function uploadConfig(
  env: Record<string, string | undefined>,
  useHttp: boolean
): { token: string; publicUrl: string } | undefined {
  const token = env.PAPERLESS_UPLOAD_API_KEY;
  const publicUrl = env.PAPERLESS_UPLOAD_PUBLIC_URL;
  if (Boolean(token) !== Boolean(publicUrl)) {
    throw new Error(
      "Set both PAPERLESS_UPLOAD_API_KEY and PAPERLESS_UPLOAD_PUBLIC_URL to enable upload links, or neither."
    );
  }
  if (!token || !publicUrl) return undefined;
  if (!useHttp) {
    console.warn(
      "[paperless-mcp] Upload links work only in HTTP mode (--http)."
    );
    return undefined;
  }
  return { token, publicUrl };
}

interface Entry {
  id: string;
  token: string;
  metadata: UploadMetadata;
  expiresAt: number;
  used: boolean;
  taskId?: string;
  error?: string;
}

interface ReceivedFile {
  name: string;
  head: Buffer;
  tooLarge: boolean;
}

/**
 * Single-use upload links. A link lets a person (a browser form) or an agent
 * (curl) send one file to Paperless without a Paperless token, so the file
 * never goes through the conversation.
 */
export class Uploads {
  private readonly api: PaperlessAPI;
  private readonly publicUrl: string;
  private readonly maxBytes: number;
  private readonly now: () => number;
  // shortcut: the entries are in memory, so a restart loses the open links. Persist them if the server runs more than one pod.
  private readonly byId = new Map<string, Entry>();
  private readonly byToken = new Map<string, Entry>();

  constructor(options: UploadsOptions) {
    this.api = options.api;
    this.publicUrl = options.publicUrl.replace(/\/+$/, "");
    this.maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
    this.now = options.now ?? Date.now;
  }

  request(metadata: UploadMetadata) {
    this.purge();
    const entry: Entry = {
      id: randomBytes(12).toString("base64url"),
      token: randomBytes(32).toString("base64url"),
      metadata,
      expiresAt: this.now() + TTL_MS,
      used: false,
    };
    this.byId.set(entry.id, entry);
    this.byToken.set(entry.token, entry);
    return {
      upload_id: entry.id,
      url: `${this.publicUrl}/upload/${entry.token}`,
      expires_at: new Date(entry.expiresAt).toISOString(),
      max_megabytes: Math.floor(this.maxBytes / (1024 * 1024)),
    };
  }

  async status(id: string): Promise<Record<string, unknown>> {
    const entry = this.byId.get(id);
    if (!entry) return { status: "unknown" };
    if (entry.error) return { status: "failed", error: entry.error };
    if (entry.taskId) {
      // Paperless shows the tasks of a user only to that user, so ask as the upload user.
      const tasks = await this.api.request(
        `/tasks/?task_id=${encodeURIComponent(entry.taskId)}`
      );
      const task = Array.isArray(tasks) ? tasks[0] : undefined;
      if (!task) return { status: "submitted", task_id: entry.taskId };
      return {
        status: task.status,
        task_id: entry.taskId,
        document_id: task.related_document
          ? Number(task.related_document)
          : null,
        result: task.result,
      };
    }
    const expires_at = new Date(entry.expiresAt).toISOString();
    if (entry.used) return { status: "receiving" };
    if (this.now() > entry.expiresAt) return { status: "expired", expires_at };
    return { status: "pending", expires_at };
  }

  router(): express.Router {
    const router = express.Router();

    // The token is in the path: keep it out of Referer headers and caches.
    router.use("/upload", (_req, res, next) => {
      res.set({
        "Referrer-Policy": "no-referrer",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
      next();
    });

    router.get("/upload/:token", (req, res) => {
      if (!this.live(req.params.token)) {
        res.status(404).type("text").send(INVALID_LINK);
        return;
      }
      res
        .set(
          "Content-Security-Policy",
          "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'"
        )
        .type("html")
        .send(FORM);
    });

    router.post("/upload/:token", async (req, res) => {
      // The first try uses the link, also when it fails later.
      const entry = this.take(req.params.token);
      if (!entry) {
        res.status(404).type("text").send(INVALID_LINK);
        return;
      }
      const fail = (code: number, message: string, detail = message) => {
        entry.error ??= detail;
        console.error(`[paperless-mcp] upload ${entry.id} failed: ${detail}`);
        res.status(code).type("text").send(`${message}\n`);
      };

      // Refuse a body that says it is too large before the server reads it. The
      // header is only advisory: busboy enforces the real limit (limits.fileSize).
      if (
        Number(req.get("content-length") ?? 0) >
        this.maxBytes + ENVELOPE_BYTES
      ) {
        res.set("Connection", "close");
        fail(413, this.tooLarge());
        return;
      }

      // The file goes to a file on disk, not to memory: the pod has little memory.
      const path = join(tmpdir(), `paperless-upload-${entry.id}`);
      try {
        let file: ReceivedFile | undefined;
        try {
          file = await receiveFile(req, path, this.maxBytes);
        } catch (err) {
          const detail = err instanceof Error ? err.message : String(err);
          fail(
            400,
            "The upload did not complete.",
            `The upload did not complete: ${detail}`
          );
          return;
        }
        if (!file) {
          fail(400, "Send the file as multipart/form-data in the field file.");
          return;
        }
        if (file.tooLarge) {
          fail(413, this.tooLarge());
          return;
        }
        if (!isPermittedType(file.head)) {
          fail(415, "Only PDF files and images are permitted.");
          return;
        }

        try {
          const tagId = await this.uploadTagId();
          entry.taskId = await this.api.postDocument(
            createReadStream(path),
            fileName(file.name),
            metadataFields(entry.metadata, tagId)
          );
        } catch (err) {
          const detail = err instanceof Error ? err.message : String(err);
          // Keep the details for check_upload, not for the uploader.
          fail(
            502,
            "The server could not send the file to Paperless.",
            `The server could not send the file to Paperless: ${detail}`
          );
          return;
        }
        res.type("text").send("Paperless received the file.\n");
      } finally {
        await rm(path, { force: true });
      }
    });

    return router;
  }

  private live(token: string): Entry | undefined {
    const entry = this.byToken.get(token);
    if (!entry || entry.used || this.now() > entry.expiresAt) return undefined;
    return entry;
  }

  private take(token: string): Entry | undefined {
    const entry = this.live(token);
    if (!entry) return undefined;
    entry.used = true;
    this.byToken.delete(token);
    return entry;
  }

  private purge() {
    const limit = this.now() - KEEP_MS;
    this.byId.forEach((entry, id) => {
      if (entry.expiresAt < limit) {
        this.byId.delete(id);
        this.byToken.delete(entry.token);
      }
    });
  }

  private async uploadTagId(): Promise<number> {
    const response = await this.api.request(
      `/tags/?name__iexact=${encodeURIComponent(UPLOAD_TAG)}`
    );
    const id = response?.results?.[0]?.id;
    if (!id) {
      throw new Error(
        `The tag ${UPLOAD_TAG} does not exist, or the upload user cannot see it.`
      );
    }
    return id;
  }

  private tooLarge() {
    return `The file is larger than ${Math.floor(
      this.maxBytes / (1024 * 1024)
    )} MB.`;
  }
}

/**
 * Streams the field "file" of a multipart body to `path`. It gives undefined
 * when the body has no such field, and it stops writing at `maxBytes`.
 */
function receiveFile(
  req: express.Request,
  path: string,
  maxBytes: number
): Promise<ReceivedFile | undefined> {
  return new Promise((resolve, reject) => {
    let parser: busboy.Busboy;
    try {
      parser = busboy({
        headers: req.headers,
        defParamCharset: "utf8",
        limits: { files: 1, fileSize: maxBytes },
      });
    } catch (err) {
      req.resume();
      reject(err);
      return;
    }
    let file: ReceivedFile | undefined;
    let written: Promise<void> = Promise.resolve();
    parser.on("file", (field, stream, info) => {
      if (field !== "file" || file) {
        stream.resume();
        return;
      }
      const received: ReceivedFile = {
        name: info.filename ?? "upload",
        head: Buffer.alloc(0),
        tooLarge: false,
      };
      file = received;
      // The first bytes tell the type of the file.
      stream.on("data", (chunk: Buffer) => {
        if (received.head.length < 16) {
          received.head = Buffer.concat([received.head, chunk]).subarray(0, 16);
        }
      });
      stream.on("limit", () => {
        received.tooLarge = true;
      });
      written = pipeline(
        stream,
        createWriteStream(path, { flags: "wx", mode: 0o600 })
      );
    });
    parser.on("error", reject);
    parser.on("close", () => written.then(() => resolve(file), reject));
    req.on("close", () => {
      if (!req.complete) reject(new Error("the client closed the connection"));
    });
    req.pipe(parser);
  });
}

function metadataFields(metadata: UploadMetadata, tagId: number) {
  const fields: Record<string, string | string[]> = {
    tags: [...(metadata.tags ?? []), tagId].map(String),
  };
  if (metadata.title) fields.title = metadata.title;
  if (metadata.correspondent)
    fields.correspondent = String(metadata.correspondent);
  if (metadata.document_type)
    fields.document_type = String(metadata.document_type);
  return fields;
}

// The name goes unescaped into the multipart request to Paperless: a quote or
// a line break there would change the headers of the part. Downloads reuses
// this to clean the file name Paperless sends back (src/downloads.ts).
export function fileName(name: string) {
  const base = name.split(/[\\/]/).pop() || "upload";
  return base.replace(/[\x00-\x1f\x7f"]/g, "_").slice(-200);
}

// The check examines the bytes, not the type that the client sends.
function isPermittedType(b: Buffer) {
  const text = (start: number, end: number) =>
    b.subarray(start, end).toString("latin1");
  return (
    text(0, 5) === "%PDF-" ||
    b.subarray(0, 8).equals(PNG) ||
    (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) ||
    text(0, 4) === "II*\0" ||
    text(0, 4) === "MM\0*" ||
    text(0, 4) === "GIF8" ||
    (text(0, 4) === "RIFF" && text(8, 12) === "WEBP") ||
    (text(4, 8) === "ftyp" && HEIF_BRANDS.includes(text(8, 12)))
  );
}

const FORM = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Upload to Paperless</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 32rem; margin: 2rem auto; padding: 0 1rem; }
  input, button { font: inherit; display: block; margin-top: 1rem; }
</style>
</head>
<body>
<h1>Upload to Paperless</h1>
<p>Select one PDF file or image. This link works one time only.</p>
<form method="post" enctype="multipart/form-data">
  <label for="file">File</label>
  <input id="file" type="file" name="file" accept="application/pdf,image/*" required>
  <button type="submit">Upload</button>
</form>
</body>
</html>
`;
