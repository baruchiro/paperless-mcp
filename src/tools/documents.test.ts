import assert from "node:assert/strict";
import { test } from "node:test";
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

// --- includeTagDefaults (new in this PR) ---

test("buildBulkEditParameters includes empty tag arrays when includeTagDefaults=true", () => {
  const parameters = buildBulkEditParameters({}, undefined, false, true);

  assert.deepEqual((parameters as Record<string, unknown>).add_tags, []);
  assert.deepEqual((parameters as Record<string, unknown>).remove_tags, []);
});

test("buildBulkEditParameters does not set tag arrays when includeTagDefaults=false", () => {
  const parameters = buildBulkEditParameters({}, undefined, false, false);

  assert.ok(!("add_tags" in parameters), "add_tags should not be present when includeTagDefaults=false");
  assert.ok(!("remove_tags" in parameters), "remove_tags should not be present when includeTagDefaults=false");
});

test("buildBulkEditParameters does not set tag arrays by default (includeTagDefaults omitted)", () => {
  const parameters = buildBulkEditParameters({});

  assert.ok(!("add_tags" in parameters));
  assert.ok(!("remove_tags" in parameters));
});

test("buildBulkEditParameters does not overwrite existing add_tags when includeTagDefaults=true", () => {
  const parameters = buildBulkEditParameters(
    { add_tags: [5, 6] },
    undefined,
    false,
    true
  );

  assert.deepEqual((parameters as Record<string, unknown>).add_tags, [5, 6]);
  assert.deepEqual((parameters as Record<string, unknown>).remove_tags, []);
});

test("buildBulkEditParameters does not overwrite existing remove_tags when includeTagDefaults=true", () => {
  const parameters = buildBulkEditParameters(
    { remove_tags: [7] },
    undefined,
    false,
    true
  );

  assert.deepEqual((parameters as Record<string, unknown>).add_tags, []);
  assert.deepEqual((parameters as Record<string, unknown>).remove_tags, [7]);
});

test("buildBulkEditParameters applies both includeCustomFieldDefaults and includeTagDefaults", () => {
  const parameters = buildBulkEditParameters({}, undefined, true, true);

  assert.deepEqual(parameters.add_custom_fields, {});
  assert.deepEqual(parameters.remove_custom_fields, []);
  assert.deepEqual((parameters as Record<string, unknown>).add_tags, []);
  assert.deepEqual((parameters as Record<string, unknown>).remove_tags, []);
});

test("buildBulkEditParameters tag defaults do not overwrite custom field values when both flags are true", () => {
  const parameters = buildBulkEditParameters(
    { add_tags: [1], remove_tags: [2] },
    [{ field: 3, value: "yes" }],
    true,
    true
  );

  assert.deepEqual((parameters as Record<string, unknown>).add_tags, [1]);
  assert.deepEqual((parameters as Record<string, unknown>).remove_tags, [2]);
  assert.deepEqual(parameters.add_custom_fields, { "3": "yes" });
  assert.deepEqual(parameters.remove_custom_fields, []);
});
