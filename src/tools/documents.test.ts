import assert from "node:assert/strict";
import { test } from "node:test";
import { buildBulkEditParameters } from "./documents";

test("buildBulkEditParameters sends Paperless bulk custom fields as id:value map", () => {
  const parameters = buildBulkEditParameters(
    { remove_custom_fields: [] as number[] },
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
