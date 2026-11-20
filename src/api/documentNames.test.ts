import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import { PaperlessAPI } from "./PaperlessAPI";
import { convertDocsWithNames } from "./documentEnhancer";
import { createDocument } from "../test/mocks/paperlessApi";

for (const { scenario, laterPageFails } of [
  { scenario: "resolves names from later metadata pages", laterPageFails: false },
  { scenario: "retains available names when a later page fails", laterPageFails: true },
]) {
  test(scenario, async () => {
    const http = createServer((req, res) => {
      const url = new URL(req.url!, "http://localhost");
      const page = Number(url.searchParams.get("page") || 1);
      const secondPage = page === 2;
      res.setHeader("Content-Type", "application/json");
      if (page === 3 && laterPageFails) {
        res.writeHead(503).end(JSON.stringify({ detail: "Unavailable" }));
        return;
      }
      const collection = url.pathname.split("/")[2];
      res.end(JSON.stringify({ count: laterPageFails ? 3 : 2, previous: null,
        next: page === 1 || laterPageFails ? `http://localhost/api/${collection}/?page=${page + 1}` : null,
        results: [{ id: secondPage ? 2 : 1, name: `${collection} ${secondPage ? "later" : "first"}` }] }));
    });
    await new Promise<void>(resolve => http.listen(0, "127.0.0.1", resolve));
    try {
      const address = http.address();
      if (!address || typeof address === "string") throw new Error("Missing port");
      const api = new PaperlessAPI(`http://127.0.0.1:${address.port}`, "test");
      const response = await convertDocsWithNames(createDocument({
        correspondent: 2, document_type: 2, tags: [1, 2, 99],
        custom_fields: [{ field: 2, value: "value" }]
      }), api);
      const text = response.content[0];
      if (text.type !== "text") throw new Error("Expected text");
      const doc = JSON.parse(text.text);
      assert.equal(doc.correspondent.name, "correspondents later");
      assert.equal(doc.document_type.name, "document_types later");
      assert.deepEqual(doc.tags, [{ id: 1, name: "tags first" }, { id: 2, name: "tags later" }, { id: 99, name: "99" }]);
      assert.deepEqual(doc.custom_fields, [{ field: 2, name: "custom_fields later", value: "value" }]);
    } finally {
      await new Promise<void>((resolve, reject) => http.close(error => error ? reject(error) : resolve()));
    }
  });
}
