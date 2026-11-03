import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { PaperlessAPI } from "./PaperlessAPI";

test("a request with an abort signal stops when the signal fires", { timeout: 5000 }, async () => {
  // The server takes the request and never answers.
  const server = createServer(() => {});
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const api = new PaperlessAPI(
    `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    "token"
  );
  const original = console.error;
  console.error = () => {};
  try {
    await assert.rejects(() =>
      api.request("/documents/", { signal: AbortSignal.timeout(50) })
    );
  } finally {
    console.error = original;
    server.closeAllConnections();
    server.close();
  }
});
