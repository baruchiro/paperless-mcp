import { test } from "node:test";
import assert from "node:assert/strict";
import type express from "express";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { PaperlessAPI } from "./api/PaperlessAPI";
import { createMcpServer, getBearerToken } from "./server";
import { Downloads } from "./downloads";
import type { SearchDependencies } from "./tools/search";
import { Uploads } from "./uploads";

function reqWith(authorization?: string): express.Request {
  return {
    headers: authorization ? { authorization } : {},
  } as unknown as express.Request;
}

test("client Bearer token takes precedence over the server token", () => {
  const token = getBearerToken(reqWith("Bearer client-token"), {
    fallbackToken: "server-token",
    allowAnonymous: true,
  });
  assert.equal(token, "client-token");
});

test("client Bearer token is used even when anonymous access is disabled", () => {
  const token = getBearerToken(reqWith("Bearer client-token"), {
    fallbackToken: "server-token",
    allowAnonymous: false,
  });
  assert.equal(token, "client-token");
});

test("falls back to the server token only when anonymous access is allowed", () => {
  const token = getBearerToken(reqWith(), {
    fallbackToken: "server-token",
    allowAnonymous: true,
  });
  assert.equal(token, "server-token");
});

test("no header without anonymous access yields no token (request is rejected)", () => {
  const token = getBearerToken(reqWith(), {
    fallbackToken: "server-token",
    allowAnonymous: false,
  });
  assert.equal(token, undefined);
});

test("non-Bearer Authorization scheme never leaks the server token by default", () => {
  const token = getBearerToken(reqWith("Token server-token"), {
    fallbackToken: "server-token",
    allowAnonymous: false,
  });
  assert.equal(token, undefined);
});

test("anonymous access with no configured server token yields no token", () => {
  const token = getBearerToken(reqWith(), {
    allowAnonymous: true,
  });
  assert.equal(token, undefined);
});

async function toolNames(server: McpServer) {
  const client = new Client({ name: "server-test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    return (await client.listTools()).tools.map((tool) => tool.name);
  } finally {
    await client.close();
    await server.close();
  }
}

test("the upload tools are registered only when uploads are configured", async () => {
  const options = { baseUrl: "http://p", token: "t", version: "1", publicUrl: "http://p" };

  const plain = await toolNames(createMcpServer(options));
  assert.ok(plain.includes("list_documents"));
  assert.ok(!plain.includes("request_upload"));
  assert.ok(!plain.includes("check_upload"));

  const uploads = new Uploads({ api: {} as PaperlessAPI, publicUrl: "https://u" });
  const withUploads = await toolNames(createMcpServer({ ...options, uploads }));
  assert.ok(withUploads.includes("request_upload"));
  assert.ok(withUploads.includes("check_upload"));
});

test("semantic_search is registered only when search is given", async () => {
  const options = { baseUrl: "http://p", token: "t", version: "1", publicUrl: "http://p" };

  const plain = await toolNames(createMcpServer(options));
  assert.ok(!plain.includes("semantic_search"));

  const search = { publicUrl: "http://p" } as SearchDependencies;
  const withSearch = await toolNames(createMcpServer({ ...options, search }));
  assert.ok(withSearch.includes("semantic_search"));
});

test("request_download is registered only when downloads are given", async () => {
  const options = { baseUrl: "http://p", token: "t", version: "1", publicUrl: "http://p" };

  const plain = await toolNames(createMcpServer(options));
  assert.ok(!plain.includes("request_download"));

  const downloads = new Downloads({ paperlessUrl: "http://p", publicUrl: "https://d" });
  const withDownloads = await toolNames(createMcpServer({ ...options, downloads }));
  assert.ok(withDownloads.includes("request_download"));
});
