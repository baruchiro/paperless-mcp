import assert from "node:assert/strict";
import { createServer, IncomingHttpHeaders, Server } from "node:http";
import { AddressInfo } from "node:net";
import { after, before, test } from "node:test";
import { PaperlessAPI } from "./PaperlessAPI";

const extraHeaders = {
  "CF-Access-Client-Id": "client-id.access",
  "CF-Access-Client-Secret": "client-secret",
};

interface RecordedRequest {
  url: string;
  headers: IncomingHttpHeaders;
}

let server: Server;
let baseUrl: string;
const recorded: RecordedRequest[] = [];

let elsewhere: Server;
let elsewhereUrl: string;
const elsewhereRecorded: RecordedRequest[] = [];

before(async () => {
  server = createServer((req, res) => {
    recorded.push({ url: req.url ?? "", headers: req.headers });
    // Requests that arrive through a proxy carry the absolute URL, so route on the path.
    const path = new URL(req.url ?? "/", "http://placeholder").pathname;
    req.resume();
    req.on("end", () => {
      if (path === "/api/redirect-offsite/") {
        res.writeHead(302, { Location: `${elsewhereUrl}/api/documents/` });
        res.end();
        return;
      }
      if (path === "/api/redirect-other-host/") {
        res.writeHead(302, {
          Location: "https://other.example.invalid/api/documents/",
        });
        res.end();
        return;
      }
      if (path === "/api/redirect-local/") {
        res.writeHead(302, { Location: "/api/documents/" });
        res.end();
        return;
      }
      if (path.includes("/download/") || path.includes("/thumb/")) {
        res.writeHead(200, { "Content-Type": "application/pdf" });
        res.end(Buffer.from("%PDF-1.4"));
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ count: 0, next: null, previous: null, results: [] }));
    });
  });

  elsewhere = createServer((req, res) => {
    elsewhereRecorded.push({ url: req.url ?? "", headers: req.headers });
    req.resume();
    req.on("end", () => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ count: 0, next: null, previous: null, results: [] }));
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  await new Promise<void>((resolve) => elsewhere.listen(0, "127.0.0.1", resolve));
  elsewhereUrl = `http://127.0.0.1:${(elsewhere.address() as AddressInfo).port}`;
});

const proxyEnvNames = [
  "http_proxy",
  "https_proxy",
  "all_proxy",
  "no_proxy",
  "npm_config_http_proxy",
  "npm_config_https_proxy",
  "npm_config_proxy",
  "npm_config_no_proxy",
];

/** Runs `fn` with the environment pointing every request at `proxyUrl`. */
async function withEnvProxy(
  proxyUrl: string,
  fn: () => Promise<void>
): Promise<void> {
  const saved = new Map<string, string | undefined>();
  for (const name of proxyEnvNames) {
    for (const key of [name, name.toUpperCase()]) {
      saved.set(key, process.env[key]);
      delete process.env[key];
    }
  }
  process.env.http_proxy = proxyUrl;
  process.env.https_proxy = proxyUrl;
  try {
    await fn();
  } finally {
    for (const [key, value] of saved) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

after(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve()))
  );
  await new Promise<void>((resolve, reject) =>
    elsewhere.close((error) => (error ? reject(error) : resolve()))
  );
});

test("extra headers are sent on every request shape", async () => {
  recorded.length = 0;
  const api = new PaperlessAPI(baseUrl, "paperless-token", extraHeaders);

  await api.getDocuments();
  await api.postDocument(Buffer.from("%PDF-1.4"), "invoice.pdf");
  await api.downloadDocument(1);
  await api.getThumbnail(1);

  assert.equal(recorded.length, 4, "expected one request per API call");
  for (const request of recorded) {
    assert.equal(
      request.headers["cf-access-client-id"],
      extraHeaders["CF-Access-Client-Id"],
      `missing CF-Access-Client-Id on ${request.url}`
    );
    assert.equal(
      request.headers["cf-access-client-secret"],
      extraHeaders["CF-Access-Client-Secret"],
      `missing CF-Access-Client-Secret on ${request.url}`
    );
    assert.equal(
      request.headers["authorization"],
      "Token paperless-token",
      `missing Paperless token on ${request.url}`
    );
  }
});

test("extra headers cannot displace the Paperless API token", async () => {
  recorded.length = 0;
  const api = new PaperlessAPI(baseUrl, "paperless-token", {
    Authorization: "Token attacker",
  });

  await api.getDocuments();
  await api.postDocument(Buffer.from("%PDF-1.4"), "invoice.pdf");
  await api.downloadDocument(1);
  await api.getThumbnail(1);

  for (const request of recorded) {
    assert.equal(request.headers["authorization"], "Token paperless-token");
  }
});

test("extra headers do not break the multipart boundary on upload", async () => {
  recorded.length = 0;
  const api = new PaperlessAPI(baseUrl, "paperless-token", {
    ...extraHeaders,
    "Content-Type": "application/json",
  });

  await api.postDocument(Buffer.from("%PDF-1.4"), "invoice.pdf");

  assert.match(
    String(recorded[0].headers["content-type"]),
    /^multipart\/form-data; boundary=/
  );
});

test("requests work unchanged when no extra headers are configured", async () => {
  recorded.length = 0;
  const api = new PaperlessAPI(baseUrl, "paperless-token");

  await api.getDocuments();

  assert.equal(recorded[0].headers["authorization"], "Token paperless-token");
  assert.equal(recorded[0].headers["cf-access-client-id"], undefined);
});

test("a per-request header cannot displace the Paperless API token", async () => {
  recorded.length = 0;
  const api = new PaperlessAPI(baseUrl, "paperless-token", extraHeaders);

  await api.request("/documents/", {
    headers: { authorization: "Token displaced" },
  });

  assert.equal(recorded[0].headers["authorization"], "Token paperless-token");
  assert.equal(
    recorded[0].headers["cf-access-client-id"],
    extraHeaders["CF-Access-Client-Id"]
  );
});

test("configured headers cannot replace the headers the client controls", async () => {
  recorded.length = 0;
  const api = new PaperlessAPI(baseUrl, "paperless-token", {
    ...extraHeaders,
    Accept: "text/html",
    "Content-Type": "text/plain",
  });

  await api.getDocuments();

  assert.match(
    String(recorded[0].headers["accept"]),
    /^application\/json; version=/
  );
  assert.equal(recorded[0].headers["content-type"], "application/json");
  assert.equal(
    recorded[0].headers["cf-access-client-id"],
    extraHeaders["CF-Access-Client-Id"]
  );
});

test("a redirect off the configured origin is refused while extra headers are set", async () => {
  recorded.length = 0;
  elsewhereRecorded.length = 0;
  const api = new PaperlessAPI(baseUrl, "paperless-token", extraHeaders);

  await assert.rejects(
    () => api.request("/redirect-offsite/"),
    /Refusing to follow a redirect/
  );

  assert.equal(
    elsewhereRecorded.length,
    0,
    "the redirect target must never receive the configured credentials"
  );
});

test("a same-origin redirect is still followed", async () => {
  recorded.length = 0;
  const api = new PaperlessAPI(baseUrl, "paperless-token", extraHeaders);

  await api.request("/redirect-local/");

  assert.equal(recorded.length, 2);
  assert.equal(
    recorded[1].headers["cf-access-client-id"],
    extraHeaders["CF-Access-Client-Id"]
  );
});

test("redirects are unaffected when no extra headers are configured", async () => {
  elsewhereRecorded.length = 0;
  const api = new PaperlessAPI(baseUrl, "paperless-token");

  await api.request("/redirect-offsite/");

  assert.equal(elsewhereRecorded.length, 1);
  assert.equal(elsewhereRecorded[0].headers["cf-access-client-id"], undefined);
});

test("the constructor refuses a cleartext base URL off the machine while extra headers are set", () => {
  assert.throws(
    () => new PaperlessAPI("http://paperless.example.com", "token", extraHeaders),
    /cleartext HTTP base URL/
  );

  // Only headers that survive sanitising count: reserved ones are dropped first.
  assert.doesNotThrow(
    () =>
      new PaperlessAPI("http://paperless.example.com", "token", {
        Authorization: "Token other",
      })
  );
  assert.doesNotThrow(() => new PaperlessAPI("http://paperless.example.com", "token"));
  assert.doesNotThrow(
    () => new PaperlessAPI("https://paperless.example.com", "token", extraHeaders)
  );
  assert.doesNotThrow(() => new PaperlessAPI(baseUrl, "token", extraHeaders));
});

test("a loopback base URL bypasses a proxy from the environment while extra headers are set", async () => {
  recorded.length = 0;
  elsewhereRecorded.length = 0;

  await withEnvProxy(elsewhereUrl, async () => {
    await new PaperlessAPI(baseUrl, "paperless-token", extraHeaders).getDocuments();
    assert.equal(recorded.length, 1, "the request must reach the instance directly");
    assert.equal(
      elsewhereRecorded.length,
      0,
      "the proxy must never receive the configured credentials"
    );

    // Without extra headers nothing is exempt: the proxy is honoured as before.
    await new PaperlessAPI(baseUrl, "paperless-token").getDocuments();
    assert.equal(elsewhereRecorded.length, 1);
  });
});

test("behind a proxy from the environment, a same-origin redirect is still followed", async () => {
  recorded.length = 0;
  const instance = "https://paperless.example.invalid";

  // The test server plays the proxy: axios sends it the absolute URL of the instance.
  await withEnvProxy(baseUrl, async () => {
    await new PaperlessAPI(instance, "paperless-token", extraHeaders).request(
      "/redirect-local/"
    );
  });

  assert.equal(recorded.length, 2);
  assert.equal(recorded[1].url, `${instance}/api/documents/`);
  assert.equal(
    recorded[1].headers["cf-access-client-id"],
    extraHeaders["CF-Access-Client-Id"]
  );
});

test("behind a proxy from the environment, a redirect to another host is still refused", async () => {
  recorded.length = 0;
  const instance = "https://paperless.example.invalid";

  await withEnvProxy(baseUrl, async () => {
    await assert.rejects(
      () =>
        new PaperlessAPI(instance, "paperless-token", extraHeaders).request(
          "/redirect-other-host/"
        ),
      /Refusing to follow a redirect from https:\/\/paperless\.example\.invalid to https:\/\/other\.example\.invalid/
    );
  });

  assert.equal(recorded.length, 1, "the proxy must not be asked to reach the other host");
});
