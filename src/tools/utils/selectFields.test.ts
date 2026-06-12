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
  name: "כמה זמן לשמור",
  data_type: "select",
  extra_data: { select_options: ["שנה", "7 שנים", "שנתיים"], default_currency: null },
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
    assert.equal(resolveSelectCustomFieldValue(LEGACY_SELECT_FIELD, "שנה"), 0);
    assert.equal(resolveSelectCustomFieldValue(LEGACY_SELECT_FIELD, "7 שנים"), 1);
    assert.equal(resolveSelectCustomFieldValue(LEGACY_SELECT_FIELD, "שנתיים"), 2);
  });

  test("translates a label to its zero-based index (2.17+ object options)", () => {
    assert.equal(resolveSelectCustomFieldValue(OBJECT_SELECT_FIELD, "Low"), 0);
    assert.equal(resolveSelectCustomFieldValue(OBJECT_SELECT_FIELD, "High"), 1);
  });

  test("passes through an already-encoded index (pre-2.17)", () => {
    assert.equal(resolveSelectCustomFieldValue(LEGACY_SELECT_FIELD, 1), 1);
  });

  test("maps an option id back to its zero-based index (2.17+ round-trip)", () => {
    // A value read from a document comes back as the stored option id; it must
    // resolve to the index Paperless expects on the next write.
    assert.equal(resolveSelectCustomFieldValue(OBJECT_SELECT_FIELD, "def456"), 1);
  });

  test("resolves both the label and the option id to the same index", () => {
    // Paperless indexes select_options by the submitted value, so the input is
    // always the index regardless of whether the agent passed a label or an id.
    assert.equal(resolveSelectCustomFieldValue(OBJECT_SELECT_FIELD, "Low"), 0);
    assert.equal(resolveSelectCustomFieldValue(OBJECT_SELECT_FIELD, "abc123"), 0);
  });

  test("returns null unchanged so the field can be cleared", () => {
    assert.equal(resolveSelectCustomFieldValue(LEGACY_SELECT_FIELD, null), null);
  });

  test("leaves non-select field values untouched", () => {
    assert.equal(resolveSelectCustomFieldValue(STRING_FIELD, "שנה"), "שנה");
  });

  test("throws an actionable error listing valid options for an unknown value", () => {
    assert.throws(
      () => resolveSelectCustomFieldValue(LEGACY_SELECT_FIELD, "forever"),
      (err: Error) => {
        assert.match(err.message, /forever/);
        assert.match(err.message, /כמה זמן לשמור/);
        assert.match(err.message, /שנה/);
        assert.match(err.message, /7 שנים/);
        return true;
      }
    );
  });

  test("rejects an out-of-range index rather than forwarding it", () => {
    assert.throws(() => resolveSelectCustomFieldValue(LEGACY_SELECT_FIELD, 9));
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
      { field: 2, value: "שנתיים" },
      { field: 4, value: "INV-001" },
    ]);

    assert.deepEqual(resolved, [
      { field: 2, value: 2 },
      { field: 4, value: "INV-001" },
    ]);
  });

  test("fetches each referenced field definition only once", async () => {
    const { api, requestedIds } = apiReturning([LEGACY_SELECT_FIELD]);

    await resolveSelectCustomFieldValues(api, [
      { field: 2, value: "שנה" },
      { field: 2, value: "7 שנים" },
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
