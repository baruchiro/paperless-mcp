import assert from "node:assert/strict";
import { test } from "node:test";
import { collapseNullableTypes } from "./nullableSchema";

test("collapses ['T','null'] to a scalar type", () => {
  assert.deepEqual(collapseNullableTypes({ type: ["string", "null"] }), {
    type: "string",
  });
  assert.deepEqual(collapseNullableTypes({ type: ["number", "null"] }), {
    type: "number",
  });
});

test("collapses nullable types nested in object properties", () => {
  const input = {
    type: "object",
    properties: {
      filter_from: { type: ["string", "null"] },
      name: { type: "string" },
      owner: { type: ["number", "null"] },
    },
  };
  assert.deepEqual(collapseNullableTypes(input), {
    type: "object",
    properties: {
      filter_from: { type: "string" },
      name: { type: "string" },
      owner: { type: "number" },
    },
  });
});

test("collapses nullable types inside array item schemas", () => {
  const input = {
    type: "array",
    items: { type: ["number", "null"] },
  };
  assert.deepEqual(collapseNullableTypes(input), {
    type: "array",
    items: { type: "number" },
  });
});

test("preserves genuine multi-type unions that do not include null", () => {
  const input = { type: ["string", "number"] };
  assert.deepEqual(collapseNullableTypes(input), { type: ["string", "number"] });
});

test("strips 'null' from a multi-type union but keeps the remaining union", () => {
  const input = { type: ["string", "number", "null"] };
  assert.deepEqual(collapseNullableTypes(input), { type: ["string", "number"] });
});

test("leaves anyOf-style nullable unions untouched", () => {
  const input = {
    anyOf: [{ type: "string" }, { type: "null" }],
  };
  assert.deepEqual(collapseNullableTypes(input), {
    anyOf: [{ type: "string" }, { type: "null" }],
  });
});

test("does not mutate the input schema", () => {
  const input = { type: ["string", "null"] as (string | null)[] };
  const snapshot = JSON.parse(JSON.stringify(input));
  collapseNullableTypes(input);
  assert.deepEqual(input, snapshot);
});

test("passes through primitives and null", () => {
  assert.equal(collapseNullableTypes("string"), "string");
  assert.equal(collapseNullableTypes(42), 42);
  assert.equal(collapseNullableTypes(null), null);
});
