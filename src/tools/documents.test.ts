import assert from "node:assert/strict";
import { test, describe, before, after } from "node:test";
import { writeFileSync, mkdtempSync, rmSync, symlinkSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { buildBulkEditParameters, validateFilePath } from "./documents";

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
    try { symlinkSync(testFile, symlinkPath); } catch { /* skip if unsupported */ }
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
      // Skip on systems without symlink support
    }
  });
});
