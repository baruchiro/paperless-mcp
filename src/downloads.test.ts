import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, test } from "node:test";
import express from "express";
import { Downloads } from "./downloads";

const PDF = Buffer.from("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n");

interface FakeOptions {
  status?: number;
  headers?: Record<string, string>;
  body?: Buffer;
  refuse?: boolean;
}

function fakePaperless(opts: FakeOptions = {}) {
  const requests: Array<{ path: string; token: string | undefined }> = [];
  const server = createServer((req, res) => {
    requests.push({ path: req.url ?? "", token: req.headers.authorization });
    res.writeHead(
      opts.status ?? 200,
      opts.headers ?? { "content-type": "application/pdf" }
    );
    res.end(opts.body ?? PDF);
  });
  return { server, requests };
}

async function withDownloads(
  fakeOpts: FakeOptions,
  run: (s: {
    downloads: Downloads;
    requests: Array<{ path: string; token: string | undefined }>;
    local: (url: string) => string;
    advance: (ms: number) => void;
  }) => Promise<void>
) {
  const { server: fake, requests } = fakePaperless(fakeOpts);
  await new Promise<void>((resolve) => fake.listen(0, resolve));
  const paperlessUrl = `http://127.0.0.1:${
    (fake.address() as AddressInfo).port
  }`;
  if (fakeOpts.refuse) {
    // A closed port on a real listener: the connection is refused.
    await new Promise<void>((resolve) => fake.close(() => resolve()));
  }
  let now = 1_000_000;
  const downloads = new Downloads({
    paperlessUrl,
    publicUrl: "https://download.example.test/",
    now: () => now,
  });
  const app = express();
  app.use(downloads.router());
  const server = app.listen(0);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    await run({
      downloads,
      requests,
      local: (url: string) => base + new URL(url).pathname,
      advance: (ms: number) => {
        now += ms;
      },
    });
  } finally {
    server.close();
    if (!fakeOpts.refuse) fake.close();
  }
}

describe("download links", () => {
  test(
    "a link streams the bytes with attachment, no-store and no-referrer, and sends the caller's token",
    { timeout: 5000 },
    () =>
      withDownloads(
        {
          headers: {
            "content-type": "application/pdf",
            "content-disposition": 'attachment; filename="Invoice.pdf"',
          },
        },
        async ({ downloads, requests, local }) => {
          const link = downloads.request(42, "caller-token-abc", false);
          const res = await fetch(local(link.url));
          assert.equal(res.status, 200);
          assert.equal(
            res.headers.get("content-disposition"),
            'attachment; filename="Invoice.pdf"'
          );
          assert.equal(res.headers.get("content-type"), "application/pdf");
          assert.equal(res.headers.get("cache-control"), "no-store");
          assert.equal(res.headers.get("referrer-policy"), "no-referrer");
          assert.deepEqual(Buffer.from(await res.arrayBuffer()), PDF);
          assert.equal(requests.length, 1);
          assert.equal(requests[0].path, "/api/documents/42/download/");
          assert.equal(requests[0].token, "Token caller-token-abc");
        }
      )
  );

  test("original asks Paperless for the original file", { timeout: 5000 }, () =>
    withDownloads({}, async ({ downloads, requests, local }) => {
      const link = downloads.request(7, "tok", true);
      await fetch(local(link.url));
      assert.equal(
        requests[0].path,
        "/api/documents/7/download/?original=true"
      );
    })
  );

  test("a link works one time only", { timeout: 5000 }, () =>
    withDownloads({}, async ({ downloads, requests, local }) => {
      const link = downloads.request(1, "tok", false);
      assert.equal((await fetch(local(link.url))).status, 200);

      const again = await fetch(local(link.url));
      assert.equal(again.status, 404);
      assert.equal(requests.length, 1);
    })
  );

  test("an expired link gives 404", { timeout: 5000 }, () =>
    withDownloads({}, async ({ downloads, requests, local, advance }) => {
      const link = downloads.request(1, "tok", false);
      advance(15 * 60_000 + 1);

      assert.equal((await fetch(local(link.url))).status, 404);
      assert.equal(requests.length, 0);
    })
  );

  test(
    "an unknown token gives 404 with the fixed text and strict headers",
    { timeout: 5000 },
    () =>
      withDownloads({}, async ({ local }) => {
        const res = await fetch(local("https://x/download/nope"));
        assert.equal(res.status, 404);
        assert.equal(
          await res.text(),
          "The document does not exist any more.\n"
        );
        assert.equal(res.headers.get("cache-control"), "no-store");
      })
  );

  test(
    "a 404 from Paperless gives 404 with the fixed text",
    { timeout: 5000 },
    () =>
      withDownloads(
        { status: 404, body: Buffer.from("Not found.") },
        async ({ downloads, local }) => {
          const link = downloads.request(999, "tok", false);
          const res = await fetch(local(link.url));
          assert.equal(res.status, 404);
          assert.equal(
            await res.text(),
            "The document does not exist any more.\n"
          );
        }
      )
  );

  test(
    "another Paperless error gives 502 with no detail",
    { timeout: 5000 },
    () =>
      withDownloads(
        { status: 500, body: Buffer.from("secret stack trace") },
        async ({ downloads, local }) => {
          const link = downloads.request(1, "tok", false);
          const res = await fetch(local(link.url));
          assert.equal(res.status, 502);
          assert.doesNotMatch(await res.text(), /secret stack trace/);
        }
      )
  );

  test(
    "a Paperless the server cannot reach gives 502 with no detail",
    { timeout: 5000 },
    () =>
      withDownloads({ refuse: true }, async ({ downloads, local }) => {
        const link = downloads.request(1, "tok", false);
        const res = await fetch(local(link.url));
        assert.equal(res.status, 502);
        assert.doesNotMatch(await res.text(), /ECONNREFUSED/);
      })
  );

  test(
    "with no filename header, the name is document-<id> plus the extension of a PDF",
    { timeout: 5000 },
    () =>
      withDownloads(
        { headers: { "content-type": "application/pdf" } },
        async ({ downloads, local }) => {
          const link = downloads.request(55, "tok", false);
          const res = await fetch(local(link.url));
          assert.equal(
            res.headers.get("content-disposition"),
            'attachment; filename="document-55.pdf"'
          );
        }
      )
  );

  test(
    "with no filename header and a non-PDF content type, the name has no extension",
    { timeout: 5000 },
    () =>
      withDownloads(
        { headers: { "content-type": "image/jpeg" } },
        async ({ downloads, local }) => {
          const link = downloads.request(55, "tok", false);
          const res = await fetch(local(link.url));
          assert.equal(
            res.headers.get("content-disposition"),
            'attachment; filename="document-55"'
          );
        }
      )
  );

  test(
    "the filename*=UTF-8'' form is not parsed: the fallback name is used",
    { timeout: 5000 },
    () =>
      withDownloads(
        {
          headers: {
            "content-type": "application/pdf",
            "content-disposition": "attachment; filename*=UTF-8''Rechnung.pdf",
          },
        },
        async ({ downloads, local }) => {
          const link = downloads.request(55, "tok", false);
          const res = await fetch(local(link.url));
          assert.equal(
            res.headers.get("content-disposition"),
            'attachment; filename="document-55.pdf"'
          );
        }
      )
  );

  test(
    "the file name of Paperless is cleaned the same way as an upload's name",
    { timeout: 5000 },
    () =>
      withDownloads(
        {
          headers: {
            "content-type": "application/pdf",
            "content-disposition":
              'attachment; filename="../../etc/passwd.pdf"',
          },
        },
        async ({ downloads, local }) => {
          const link = downloads.request(1, "tok", false);
          const res = await fetch(local(link.url));
          assert.equal(
            res.headers.get("content-disposition"),
            'attachment; filename="passwd.pdf"'
          );
        }
      )
  );

  test("the Content-Length of Paperless is copied", { timeout: 5000 }, () =>
    withDownloads(
      {
        headers: {
          "content-type": "application/pdf",
          "content-length": String(PDF.length),
        },
      },
      async ({ downloads, local }) => {
        const link = downloads.request(1, "tok", false);
        const res = await fetch(local(link.url));
        assert.equal(res.headers.get("content-length"), String(PDF.length));
      }
    )
  );

  test(
    "the caller's token is not kept after the link is used",
    { timeout: 5000 },
    () =>
      withDownloads({}, async ({ downloads, local }) => {
        const link = downloads.request(1, "caller-secret", false);
        await fetch(local(link.url));
        // White-box: nothing should still hold the caller's token in memory.
        const byToken = (
          downloads as unknown as { byToken: Map<string, unknown> }
        ).byToken;
        assert.equal(byToken.size, 0);
      })
  );

  test(
    "the caller's token is not kept after the link expires",
    { timeout: 5000 },
    () =>
      withDownloads({}, async ({ downloads, local, advance }) => {
        const link = downloads.request(1, "caller-secret", false);
        advance(15 * 60_000 + 1);
        await fetch(local(link.url));
        const byToken = (
          downloads as unknown as { byToken: Map<string, unknown> }
        ).byToken;
        assert.equal(byToken.size, 0);
      })
  );
});
