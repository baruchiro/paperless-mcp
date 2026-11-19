import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { waitForDocumentTag } from "./waitForDocumentTag";

function stub(results: unknown[]) {
  let calls = 0;
  const options: unknown[] = [];
  const client = { callTool: async (_request: unknown, _schema: unknown, opts: unknown) => {
    options.push(opts);
    const value = results[Math.min(calls++, results.length - 1)];
    if (value instanceof Error) throw value;
    return value;
  }} as unknown as Pick<Client, "callTool">;
  return { client, count: () => calls, options };
}
const doc = (tags: unknown) => ({ content: [{ type: "text", text: JSON.stringify({ tags }) }] });

test("waits for stale add-tag readback and supports object tags", async () => {
  const s = stub([doc([]), doc([{ id: 7 }])]);
  await waitForDocumentTag(s.client, 1, 7, true, 100, 1);
  assert.equal(s.count(), 2);
  for (const option of s.options) assert.ok((option as { timeout: number }).timeout <= 100);
});
test("waits for stale remove-tag readback", async () => {
  const s = stub([doc([7]), doc([])]);
  await waitForDocumentTag(s.client, 1, 7, false, 100, 1);
  assert.equal(s.count(), 2);
});
test("returns immediately when already updated", async () => {
  const s = stub([doc([7])]);
  await waitForDocumentTag(s.client, 1, 7, true, 100, 1);
  assert.equal(s.count(), 1);
});
test("still fails on bounded timeout with last state", async () => {
  const s = stub([doc([])]);
  await assert.rejects(waitForDocumentTag(s.client, 1, 7, true, 15, 2), /Timed out.*last tags=\[\]/);
  assert.ok(s.count() < 20);
});
test("tool and transport errors fail immediately without retries", async () => {
  for (const error of [{ isError: true, content: [{type: "text", text: "server failed"}] }, new Error("transport failed")]) {
    const s = stub([error]);
    await assert.rejects(waitForDocumentTag(s.client, 1, 7, true, 100, 1), /failed/);
    assert.equal(s.count(), 1);
  }
});
test("malformed readback is not mistaken for successful removal", async () => {
  for (const value of [doc(undefined), doc([{}]), {content:[{type:"text",text:"invalid json"}]}]) {
    const s = stub([value]);
    await assert.rejects(waitForDocumentTag(s.client, 1, 7, false, 100, 1));
    assert.equal(s.count(), 1);
  }
});
