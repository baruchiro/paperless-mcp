import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { PaperlessAPI } from "../../api/PaperlessAPI";
import { CustomField } from "../../api/types";
import {
  resolveSelectCustomFieldValue,
  resolveSelectCustomFieldValues,
} from "./selectFields";

const LEGACY_SELECT_FIELD: CustomField = {
  id: 2,
  name: "Retention period",
  data_type: "select",
  extra_data: { select_options: ["1 year", "7 years", "2 years"], default_currency: null },
  document_count: 10,
};

const OBJECT_SELECT_FIELD: CustomField = {
  id: 3,
  name: "Priority",
  data_type: "select",
  extra_data: {
    select_options: [
      { id: "abc123", label: "Low" },
      { id: "def456", label: "High" },
    ],
  },
  document_count: 5,
};

const STRING_FIELD: CustomField = {
  id: 4,
  name: "Reference",
  data_type: "string",
  document_count: 1,
};

describe("resolveSelectCustomFieldValue", () => {
  test("translates a label to its zero-based index (pre-2.17 string options)", () => {
    assert.equal(resolveSelectCustomFieldValue(LEGACY_SELECT_FIELD, "1 year"), 0);
    assert.equal(resolveSelectCustomFieldValue(LEGACY_SELECT_FIELD, "7 years"), 1);
    assert.equal(resolveSelectCustomFieldValue(LEGACY_SELECT_FIELD, "2 years"), 2);
  });

  test("translates a label to its zero-based index (2.17+ object options)", () => {
    assert.equal(resolveSelectCustomFieldValue(OBJECT_SELECT_FIELD, "Low"), 0);
    assert.equal(resolveSelectCustomFieldValue(OBJECT_SELECT_FIELD, "High"), 1);
  });

  test("passes through an already-encoded index (pre-2.17)", () => {
    assert.equal(resolveSelectCustomFieldValue(LEGACY_SELECT_FIELD, 1), 1);
  });

  test("maps an option id back to its zero-based index (2.17+ round-trip)", () => {
    assert.equal(resolveSelectCustomFieldValue(OBJECT_SELECT_FIELD, "def456"), 1);
  });

  test("resolves both the label and the option id to the same index", () => {
    assert.equal(resolveSelectCustomFieldValue(OBJECT_SELECT_FIELD, "Low"), 0);
    assert.equal(resolveSelectCustomFieldValue(OBJECT_SELECT_FIELD, "abc123"), 0);
  });

  test("returns null unchanged so the field can be cleared", () => {
    assert.equal(resolveSelectCustomFieldValue(LEGACY_SELECT_FIELD, null), null);
  });

  test("leaves non-select field values untouched", () => {
    assert.equal(resolveSelectCustomFieldValue(STRING_FIELD, "1 year"), "1 year");
  });

  test("throws an actionable error listing valid options for an unknown value", () => {
    assert.throws(
      () => resolveSelectCustomFieldValue(LEGACY_SELECT_FIELD, "forever"),
      (err: Error) => {
        assert.match(err.message, /forever/);
        assert.match(err.message, /Retention period/);
        assert.match(err.message, /1 year/);
        assert.match(err.message, /7 years/);
        return true;
      }
    );
  });

  test("rejects an out-of-range index rather than forwarding it", () => {
    assert.throws(() => resolveSelectCustomFieldValue(LEGACY_SELECT_FIELD, 9));
  });

  test("throws on a value that matches one option's label and another's id", () => {
    const collidingField: CustomField = {
      id: 5,
      name: "Collision",
      data_type: "select",
      extra_data: {
        select_options: [
          { id: "High", label: "Low" },
          { id: "xyz789", label: "High" },
        ],
      },
      document_count: 0,
    };
    assert.throws(
      () => resolveSelectCustomFieldValue(collidingField, "High"),
      /Ambiguous/
    );
  });
});

describe("resolveSelectCustomFieldValue with stored encoding (bulk_edit path)", () => {
  test("translates a label to the option id on 2.17+ object options", () => {
    assert.equal(
      resolveSelectCustomFieldValue(OBJECT_SELECT_FIELD, "Low", "stored"),
      "abc123"
    );
    assert.equal(
      resolveSelectCustomFieldValue(OBJECT_SELECT_FIELD, "High", "stored"),
      "def456"
    );
  });

  test("translates a label to the index on pre-2.17 string options (no id to store)", () => {
    assert.equal(
      resolveSelectCustomFieldValue(LEGACY_SELECT_FIELD, "7 years", "stored"),
      1
    );
  });

  test("passes an already-stored option id through unchanged", () => {
    assert.equal(
      resolveSelectCustomFieldValue(OBJECT_SELECT_FIELD, "def456", "stored"),
      "def456"
    );
  });

  test("maps an option index to its stored id (2.17+)", () => {
    assert.equal(
      resolveSelectCustomFieldValue(OBJECT_SELECT_FIELD, 1, "stored"),
      "def456"
    );
  });
});

function apiReturning(fields: CustomField[]) {
  const requestedIds: number[] = [];
  const fieldMap = new Map(fields.map((field) => [field.id, field]));
  const api = {
    getCustomField: async (id: number) => {
      requestedIds.push(id);
      const field = fieldMap.get(id);
      if (!field) throw new Error(`custom field ${id} not found`);
      return field;
    },
  } as unknown as PaperlessAPI;
  return { api, requestedIds };
}

describe("resolveSelectCustomFieldValues", () => {
  test("returns undefined/empty input unchanged without fetching definitions", async () => {
    const { api, requestedIds } = apiReturning([]);
    assert.equal(await resolveSelectCustomFieldValues(api, undefined), undefined);
    assert.deepEqual(await resolveSelectCustomFieldValues(api, []), []);
    assert.deepEqual(requestedIds, []);
  });

  test("resolves select labels and leaves other fields untouched", async () => {
    const { api } = apiReturning([LEGACY_SELECT_FIELD, STRING_FIELD]);

    const resolved = await resolveSelectCustomFieldValues(api, [
      { field: 2, value: "2 years" },
      { field: 4, value: "INV-001" },
    ]);

    assert.deepEqual(resolved, [
      { field: 2, value: 2 },
      { field: 4, value: "INV-001" },
    ]);
  });

  test("applies the stored encoding (option id) when requested", async () => {
    const { api } = apiReturning([OBJECT_SELECT_FIELD]);

    const resolved = await resolveSelectCustomFieldValues(
      api,
      [{ field: 3, value: "High" }],
      "stored"
    );

    assert.deepEqual(resolved, [{ field: 3, value: "def456" }]);
  });

  test("fetches each referenced field definition only once", async () => {
    const { api, requestedIds } = apiReturning([LEGACY_SELECT_FIELD]);

    await resolveSelectCustomFieldValues(api, [
      { field: 2, value: "1 year" },
      { field: 2, value: "7 years" },
    ]);

    assert.deepEqual(requestedIds, [2]);
  });

  test("passes the value through when the field definition cannot be fetched", async () => {
    const { api } = apiReturning([]);

    const resolved = await resolveSelectCustomFieldValues(api, [
      { field: 99, value: "whatever" },
    ]);

    assert.deepEqual(resolved, [{ field: 99, value: "whatever" }]);
  });
});
