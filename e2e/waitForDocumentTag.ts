import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { parseToolText, ToolResult } from "./client";

// Paperless 3.5 queues bulk edits. Submission success does not mean the
// document has changed yet. Retry only stale readback, never tool/API errors.
export const waitForDocumentTag = async (
  client: Pick<Client, "callTool">,
  documentId: number,
  tagId: number,
  present: boolean,
  timeoutMs = 15000,
  intervalMs = 250
): Promise<void> => {
  const deadline = performance.now() + timeoutMs;
  let tagIds: number[] = [];
  while (performance.now() < deadline) {
    const remaining = Math.max(1, Math.ceil(deadline - performance.now()));
    const result = await client.callTool(
      { name: "get_document", arguments: { id: documentId } },
      undefined,
      { timeout: remaining, maxTotalTimeout: remaining }
    ) as ToolResult;
    const data = parseToolText(result) as { tags?: unknown };
    assert.ok(Array.isArray(data.tags), "get_document tags must be an array");
    tagIds = data.tags.map((tag: unknown) => {
      const id = typeof tag === "number" ? tag : (tag as { id?: unknown } | null)?.id;
      assert.ok(typeof id === "number" && Number.isInteger(id), "get_document returned an invalid tag id");
      return id as number;
    });
    if (performance.now() <= deadline && tagIds.includes(tagId) === present) return;
    const delay = Math.min(intervalMs, deadline - performance.now());
    if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay));
  }
  assert.fail(`Timed out after ${timeoutMs}ms waiting for tag ${tagId} to be ${present ? "present" : "absent"} on document ${documentId}; last tags=${JSON.stringify(tagIds)}`);
};
