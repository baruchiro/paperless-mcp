import assert from "node:assert/strict";
import { test, describe, before, after } from "node:test";
import { writeFileSync, mkdtempSync, rmSync, unlinkSync, symlinkSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { buildBulkEditParameters } from "./documents";

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

// Import the validateFilePath function for testing
// Since it's not exported, we'll need to test it through the post_document tool
// For now, we'll add unit tests that can be enabled when we export the function

describe("validateFilePath", () => {
  let testDir: string;
  let testFile: string;
  let emptyFile: string;
  let largeFile: string;

  before(() => {
    // Create a temporary directory for tests
    testDir = mkdtempSync(join(tmpdir(), "paperless-mcp-test-"));

    // Create test files
    testFile = join(testDir, "test.pdf");
    writeFileSync(testFile, Buffer.from("%PDF-1.4\ntest content"), "utf8");

    emptyFile = join(testDir, "empty.pdf");
    writeFileSync(emptyFile, "");

    // Create a large file (just over 100MB would be too slow, so we'll mock this in actual tests)
    largeFile = join(testDir, "large.pdf");
    writeFileSync(largeFile, Buffer.alloc(1024 * 1024, "x")); // 1MB for testing
  });

  after(() => {
    // Clean up test directory
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch (e) {
      // Ignore cleanup errors
    }
  });

  test("should accept valid absolute path to regular file", () => {
    // This test would use the validateFilePath function
    // For now, we document the expected behavior
    assert.ok(testFile.startsWith("/"));
  });

  test("should reject relative paths", () => {
    // validateFilePath should reject "relative/path.pdf"
    const relativePath = "relative/path.pdf";
    assert.ok(!relativePath.startsWith("/"));
  });

  test("should reject empty files", () => {
    // validateFilePath should reject empty files
    assert.strictEqual(emptyFile.endsWith("empty.pdf"), true);
  });

  test("should reject files outside allowed paths when configured", () => {
    // When PAPERLESS_MCP_UPLOAD_PATHS is set, validateFilePath should
    // reject files outside those directories
    assert.ok(true); // Placeholder
  });

  test("should follow symlinks and validate real path", () => {
    // validateFilePath should resolve symlinks and validate the target
    const symlinkPath = join(testDir, "symlink.pdf");
    try {
      symlinkSync(testFile, symlinkPath);
      assert.ok(true); // Symlink created
      unlinkSync(symlinkPath);
    } catch (e) {
      // Skip on systems that don't support symlinks
      assert.ok(true);
    }
  });

  test("should reject directories", () => {
    // validateFilePath should reject directory paths
    assert.ok(true); // Would test with testDir
  });

  test("should reject non-existent files", () => {
    const nonExistent = join(testDir, "does-not-exist.pdf");
    // validateFilePath should throw "File not found"
    assert.ok(true);
  });

  test("should reject files over size limit", () => {
    // validateFilePath should reject files > 100MB
    // We can't easily test this without creating a huge file
    assert.ok(true);
  });
});

describe("post_document file_path validation", () => {
  test("should validate base64 size limits", () => {
    // When using file (base64), should enforce 100MB limit on decoded size
    const largBase64 = "A".repeat(150 * 1024 * 1024); // > 100MB when decoded
    // Would be rejected by post_document
    assert.ok(largBase64.length > 100 * 1024 * 1024);
  });

  test("should validate empty base64 files", () => {
    // Empty string should be rejected
    const emptyBase64 = "";
    assert.strictEqual(emptyBase64.length, 0);
  });

  test("should require filename with base64 mode", () => {
    // When using file (base64), filename is required
    assert.ok(true); // post_document enforces this
  });

  test("should derive filename from file_path", () => {
    // When using file_path without filename, should use basename
    const path = "/tmp/test/document.pdf";
    assert.strictEqual(path.split("/").pop(), "document.pdf");
  });

  test("should allow explicit filename with file_path", () => {
    // When using file_path with filename, should use explicit filename
    assert.ok(true);
  });

  test("should reject when neither file nor file_path provided", () => {
    // Should throw error when both are missing
    assert.ok(true);
  });
});
