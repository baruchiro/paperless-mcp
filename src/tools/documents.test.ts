import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { PaperlessAPI } from "../api/PaperlessAPI";
import { registerDocumentTools } from "./documents";
import { zodToJsonSchema } from "zod-to-json-schema";
import {
  buildDocumentQueryString,
  customFieldQuerySchema,
  CustomFieldQuery,
  DOCUMENT_QUERY_PAPERLESS_FILTER_KEYS,
} from "./utils/documentQuery";

type RegisteredTool = {
  description: string;
  handler: (args: any, extra: any) => Promise<any>;
  name: string;
  schema: Record<string, unknown>;
};

class FakeServer {
  tools: RegisteredTool[] = [];

  tool(
    name: string,
    description: string,
    schema: Record<string, unknown>,
    handler: (args: any, extra: any) => Promise<any>
  ) {
    this.tools.push({ name, description, schema, handler });
  }
}

function getEmptyPaginatedResponse() {
  return {
    count: 0,
    next: null,
    previous: null,
    all: [],
    results: [],
  };
}

function createApiStub() {
  const queries: string[] = [];

  const api = {
    getCorrespondents: async () => getEmptyPaginatedResponse(),
    getCustomFields: async () => getEmptyPaginatedResponse(),
    getDocumentTypes: async () => getEmptyPaginatedResponse(),
    getDocuments: async (query = "") => {
      queries.push(query);
      return getEmptyPaginatedResponse();
    },
    getTags: async () => getEmptyPaginatedResponse(),
  } as unknown as PaperlessAPI;

  return { api, queries };
}

function getTool(server: FakeServer, name: string): RegisteredTool {
  const tool = server.tools.find((registeredTool) => registeredTool.name === name);
  assert.ok(tool, `Expected tool '${name}' to be registered`);
  return tool;
}

function getQueryParams(queryString: string) {
  return new URLSearchParams(queryString.replace(/^\?/, ""));
}

function getDocumentQueryParamsFromOpenApi() {
  const openApiPath = path.join(process.cwd(), "Paperless_ngx_REST_API.yaml");
  const text = fs.readFileSync(openApiPath, "utf8");
  const start = text.indexOf("  /api/documents/:");
  const end = text.indexOf("  /api/documents/{id}/:");
  const section = text.slice(start, end);

  return Array.from(
    section.matchAll(/^\s*-?\s*name:\s+(.+)$/gm),
    (match) => match[1]
  ).sort();
}

test("paperless filter allowlist stays in sync with the document OpenAPI section", () => {
  const documentedParams = getDocumentQueryParamsFromOpenApi();
  const allowedParams = [...DOCUMENT_QUERY_PAPERLESS_FILTER_KEYS].sort();

  assert.deepEqual(allowedParams, documentedParams);
});

test("serializes full-text query_documents arguments", () => {
  const query = getQueryParams(
    buildDocumentQueryString({
      query: "invoice 2024",
      search: "jan",
      more_like_id: 42,
    })
  );

  assert.equal(query.get("query"), "invoice 2024");
  assert.equal(query.get("search"), "jan");
  assert.equal(query.get("more_like_id"), "42");
});

test("serializes first-class list filters using Paperless parameter names", () => {
  const query = getQueryParams(
    buildDocumentQueryString({
      page: 2,
      page_size: 50,
      ordering: "-created",
      correspondent: 3,
      document_type: 4,
      tag: 5,
      storage_path: 6,
      created__date__gte: "2024-01-01",
      created__date__lte: "2024-12-31",
    })
  );

  assert.equal(query.get("page"), "2");
  assert.equal(query.get("page_size"), "50");
  assert.equal(query.get("ordering"), "-created");
  assert.equal(query.get("correspondent__id"), "3");
  assert.equal(query.get("document_type__id"), "4");
  assert.equal(query.get("tags__id"), "5");
  assert.equal(query.get("storage_path__id"), "6");
  assert.equal(query.get("created__date__gte"), "2024-01-01");
  assert.equal(query.get("created__date__lte"), "2024-12-31");
});

test("serializes paperless_filters arrays as comma-separated values", () => {
  const query = getQueryParams(
    buildDocumentQueryString({
      paperless_filters: {
        fields: ["title", "tags"],
        id__in: [1, 2, 3],
      },
    })
  );

  assert.equal(query.get("fields"), "title,tags");
  assert.equal(query.get("id__in"), "1,2,3");
});

test("serializes leaf custom_field_query values as JSON", () => {
  const query = getQueryParams(
    buildDocumentQueryString({
      custom_field_query: ["Invoice Number", "exact", "12345"],
    })
  );

  assert.equal(
    query.get("custom_field_query"),
    JSON.stringify(["Invoice Number", "exact", "12345"])
  );
});

test("serializes grouped custom_field_query values as JSON", () => {
  const groupedQuery: CustomFieldQuery = [
    "OR",
    [
      ["Invoice Number", "isnull", true],
      ["Invoice Number", "exact", ""],
    ],
  ];

  const query = getQueryParams(
    buildDocumentQueryString({
      custom_field_query: groupedQuery,
    })
  );

  assert.equal(query.get("custom_field_query"), JSON.stringify(groupedQuery));
});

test("rejects unsupported paperless_filters keys", () => {
  assert.throws(
    () =>
      buildDocumentQueryString({
        paperless_filters: {
          not_a_real_filter: "value",
        },
      }),
    /Unsupported paperless_filters key/
  );
});

test("rejects duplicate first-class and paperless_filters definitions", () => {
  assert.throws(
    () =>
      buildDocumentQueryString({
        correspondent: 7,
        paperless_filters: {
          correspondent__id: 7,
        },
      }),
    /Duplicate filter 'correspondent__id'/
  );
});

test("rejects invalid custom_field_query shapes", () => {
  assert.equal(customFieldQuerySchema.safeParse(["field", "exact"]).success, false);
  assert.equal(customFieldQuerySchema.safeParse(["AND", []]).success, false);
  assert.equal(
    customFieldQuerySchema.safeParse(["AND", [["field"]]]).success,
    false
  );
});

test("custom_field_query JSON schema avoids tuple-style items arrays", () => {
  const jsonSchema = zodToJsonSchema(customFieldQuerySchema) as {
    items?: unknown;
    type?: string;
  };
  assert.equal(jsonSchema.type, "array");
  assert.equal(Array.isArray(jsonSchema.items), false);
});

test("list_documents keeps existing simple query behavior", async () => {
  const server = new FakeServer();
  const { api, queries } = createApiStub();

  registerDocumentTools(server as unknown as any, api);

  const listDocumentsTool = getTool(server, "list_documents");
  await listDocumentsTool.handler(
    {
      page: 1,
      page_size: 25,
      search: "invoice",
      correspondent: 2,
      document_type: 3,
      tag: 4,
      storage_path: 5,
      created__date__gte: "2024-01-01",
      created__date__lte: "2024-12-31",
      ordering: "-created",
    },
    {}
  );

  const query = getQueryParams(queries[0]);
  assert.equal(query.get("page"), "1");
  assert.equal(query.get("page_size"), "25");
  assert.equal(query.get("search"), "invoice");
  assert.equal(query.get("correspondent__id"), "2");
  assert.equal(query.get("document_type__id"), "3");
  assert.equal(query.get("tags__id"), "4");
  assert.equal(query.get("storage_path__id"), "5");
  assert.equal(query.get("created__date__gte"), "2024-01-01");
  assert.equal(query.get("created__date__lte"), "2024-12-31");
  assert.equal(query.get("ordering"), "-created");
});

test("query_documents exposes advanced query fields and uses shared execution", async () => {
  const server = new FakeServer();
  const { api, queries } = createApiStub();

  registerDocumentTools(server as unknown as any, api);

  const queryDocumentsTool = getTool(server, "query_documents");
  assert.ok("custom_field_query" in queryDocumentsTool.schema);
  assert.ok("paperless_filters" in queryDocumentsTool.schema);
  assert.match(queryDocumentsTool.description, /custom field/i);

  await queryDocumentsTool.handler(
    {
      query: "invoice",
      tag: 9,
      custom_field_query: ["Invoice Number", "exists", true],
      paperless_filters: {
        id__in: [1, 2, 3],
      },
    },
    {}
  );

  const query = getQueryParams(queries[0]);
  assert.equal(query.get("query"), "invoice");
  assert.equal(query.get("tags__id"), "9");
  assert.equal(
    query.get("custom_field_query"),
    JSON.stringify(["Invoice Number", "exists", true])
  );
  assert.equal(query.get("id__in"), "1,2,3");
});

test("search_documents remains a query-only compatibility wrapper", async () => {
  const server = new FakeServer();
  const { api, queries } = createApiStub();

  registerDocumentTools(server as unknown as any, api);

  const searchDocumentsTool = getTool(server, "search_documents");
  assert.deepEqual(Object.keys(searchDocumentsTool.schema), ["query"]);
  assert.match(searchDocumentsTool.description, /Deprecated compatibility wrapper/);

  await searchDocumentsTool.handler(
    {
      query: "invoice 2024",
    },
    {}
  );

  const query = getQueryParams(queries[0]);
  assert.equal(query.get("query"), "invoice 2024");
});
