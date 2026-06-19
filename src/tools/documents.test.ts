import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  truncateSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import { buildBulkEditParameters, validateFilePath } from "./documents";
import {
  buildDocumentQueryString,
  customFieldQuerySchema,
  CustomFieldQuery,
  DOCUMENT_QUERY_PAPERLESS_FILTER_KEYS,
} from "./utils/documentQuery";

function getQueryParams(queryString: string) {
  return new URLSearchParams(queryString.replace(/^\?/, ""));
}

function getDocumentQueryParamsFromOpenApi() {
  const openApiPath = join(process.cwd(), "Paperless_ngx_REST_API.yaml");
  const text = readFileSync(openApiPath, "utf8");
  const start = text.indexOf("  /api/documents/:");
  const end = text.indexOf("  /api/documents/{id}/:");
  assert.ok(start >= 0, "OpenAPI docs marker '/api/documents/' not found");
  assert.ok(
    end > start,
    "OpenAPI docs marker '/api/documents/{id}/' not found or out of order"
  );
  const section = text.slice(start, end);

  return Array.from(
    section.matchAll(/^\s*-?\s*name:\s+(.+)$/gm),
    (match) => match[1]
  ).sort();
}

// ALLOWED_UPLOAD_PATHS is read from the environment at module load, so the
// allowlist can only be exercised by re-importing the module with the env set.
function validateFilePathWithAllowlist(
  allowedPaths: string
): typeof validateFilePath {
  const modulePath = require.resolve("./documents");
  const previous = process.env.PAPERLESS_MCP_UPLOAD_PATHS;
  process.env.PAPERLESS_MCP_UPLOAD_PATHS = allowedPaths;
  delete require.cache[modulePath];
  try {
    return require("./documents").validateFilePath;
  } finally {
    delete require.cache[modulePath];
    if (previous === undefined) {
      delete process.env.PAPERLESS_MCP_UPLOAD_PATHS;
    } else {
      process.env.PAPERLESS_MCP_UPLOAD_PATHS = previous;
    }
  }
}

test("buildBulkEditParameters sends Paperless bulk custom fields as id:value map", () => {
  const parameters = buildBulkEditParameters(
    { remove_custom_fields: [] },
    [
      { field: 9, value: "" },
      { field: 10, value: "2026-05-14" },
    ]
  );

  assert.deepEqual(parameters, {
    remove_custom_fields: [],
    add_custom_fields: {
      "9": "",
      "10": "2026-05-14",
    },
  });
  assert.ok(!("assign_custom_fields" in parameters));
  assert.ok(!("assign_custom_fields_values" in parameters));
});

test("buildBulkEditParameters preserves null custom field values", () => {
  const parameters = buildBulkEditParameters({}, [{ field: 9, value: null }]);

  assert.deepEqual(parameters, {
    add_custom_fields: {
      "9": null,
    },
  });
});

test("buildBulkEditParameters includes Paperless-required empty custom field keys", () => {
  const parameters = buildBulkEditParameters({}, undefined, true);

  assert.deepEqual(parameters, {
    add_custom_fields: {},
    remove_custom_fields: [],
  });
});

test("buildBulkEditParameters preserves an empty custom fields array", () => {
  const parameters = buildBulkEditParameters({}, []);

  assert.deepEqual(parameters, {
    add_custom_fields: {},
  });
  assert.ok(!("remove_custom_fields" in parameters));
});

test("buildBulkEditParameters preserves an empty custom fields array with defaults", () => {
  const parameters = buildBulkEditParameters({}, [], true);

  assert.deepEqual(parameters, {
    add_custom_fields: {},
    remove_custom_fields: [],
  });
});

test("buildBulkEditParameters combines base parameters with custom fields", () => {
  const parameters = buildBulkEditParameters(
    { add_tags: [3], remove_tags: [1, 2] },
    [{ field: 9, value: "pending" }]
  );

  assert.deepEqual(parameters, {
    add_tags: [3],
    remove_tags: [1, 2],
    add_custom_fields: {
      "9": "pending",
    },
  });
});

test("buildBulkEditParameters preserves supported custom field value types", () => {
  const parameters = buildBulkEditParameters({}, [
    { field: 1, value: 42 },
    { field: 2, value: true },
    { field: 3, value: "" },
    { field: 4, value: null },
    { field: 5, value: [123, 456] },
  ]);

  assert.deepEqual(parameters.add_custom_fields, {
    "1": 42,
    "2": true,
    "3": "",
    "4": null,
    "5": [123, 456],
  });
});

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

test("serializes first-class document filters using Paperless parameter names", () => {
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
      archive_serial_number: 99,
      archive_serial_number__isnull: false,
      custom_fields__icontains: "invoice",
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
  assert.equal(query.get("archive_serial_number"), "99");
  assert.equal(query.get("archive_serial_number__isnull"), "false");
  assert.equal(query.get("custom_fields__icontains"), "invoice");
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

test("serializes raw list custom_field_query strings without JSON encoding", () => {
  const rawCustomFieldQuery = '[7, "icontains", "value"]';
  const query = getQueryParams(
    buildDocumentQueryString({
      custom_field_query: rawCustomFieldQuery,
    })
  );

  assert.equal(query.get("custom_field_query"), rawCustomFieldQuery);
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

test("serializes numeric custom_field_query field IDs as JSON", () => {
  const query = getQueryParams(
    buildDocumentQueryString({
      custom_field_query: [7, "exact", "12345"],
    })
  );

  assert.equal(
    query.get("custom_field_query"),
    JSON.stringify([7, "exact", "12345"])
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
  assert.equal(
    customFieldQuerySchema.safeParse(["AND", "iexact", "foo"]).success,
    false
  );
});

describe("validateFilePath", () => {
  let testDir: string;
  let testFile: string;
  let emptyFile: string;
  let symlinkPath: string;

  before(() => {
    testDir = mkdtempSync(join(tmpdir(), "paperless-mcp-test-"));
    testFile = join(testDir, "test.pdf");
    writeFileSync(testFile, "%PDF-1.4\ntest content");
    emptyFile = join(testDir, "empty.pdf");
    writeFileSync(emptyFile, "");
    symlinkPath = join(testDir, "link.pdf");
    try {
      symlinkSync(testFile, symlinkPath);
    } catch {
      // Skip if unsupported.
    }
  });

  after(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  test("accepts a valid absolute file path", async () => {
    await assert.doesNotReject(() => validateFilePath(testFile));
  });

  test("rejects relative paths", async () => {
    await assert.rejects(() => validateFilePath("relative/path.pdf"), {
      message: "file_path must be an absolute path",
    });
  });

  test("rejects non-existent files", async () => {
    await assert.rejects(
      () => validateFilePath(join(testDir, "missing.pdf")),
      { message: "File not found" }
    );
  });

  test("rejects directories", async () => {
    await assert.rejects(() => validateFilePath(testDir), {
      message: "Path must point to a regular file",
    });
  });

  test("rejects empty files", async () => {
    await assert.rejects(() => validateFilePath(emptyFile), {
      message: "File is empty",
    });
  });

  test("resolves symlinks to the real file", async () => {
    try {
      await assert.doesNotReject(() => validateFilePath(symlinkPath));
    } catch {
      // Skip on systems without symlink support.
    }
  });

  test("rejects files exceeding the maximum size", async () => {
    const largeFile = join(testDir, "large.pdf");
    writeFileSync(largeFile, "%PDF-1.4\n");
    truncateSync(largeFile, 101 * 1024 * 1024);
    await assert.rejects(() => validateFilePath(largeFile), {
      message: /exceeds maximum allowed size/,
    });
  });

  test("accepts files within allowed upload paths", async () => {
    const validate = validateFilePathWithAllowlist(realpathSync(testDir));
    await assert.doesNotReject(() => validate(testFile));
  });

  test("rejects files outside allowed upload paths", async () => {
    const validate = validateFilePathWithAllowlist("/some/other/path");
    await assert.rejects(() => validate(testFile), {
      message: /outside allowed upload directories/,
    });
  });
});
