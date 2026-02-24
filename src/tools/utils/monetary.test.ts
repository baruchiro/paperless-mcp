import { test } from "node:test";
import assert from "node:assert/strict";
import { getMonetaryValidationError } from "./monetary";

test("returns null for non-monetary strings", () => {
  assert.equal(getMonetaryValidationError("hello"), null);
  assert.equal(getMonetaryValidationError("some text"), null);
  assert.equal(getMonetaryValidationError(""), null);
});

test("returns null for valid monetary prefix format", () => {
  assert.equal(getMonetaryValidationError("USD10.00"), null);
  assert.equal(getMonetaryValidationError("GBP123.45"), null);
  assert.equal(getMonetaryValidationError("EUR9.99"), null);
  assert.equal(getMonetaryValidationError("ILS50.00"), null);
});

test("returns error for trailing currency symbol", () => {
  const err = getMonetaryValidationError("10.00$");
  assert.ok(err);
  assert.match(err, /USD10\.00/);
  assert.match(err, /currency code as a prefix/);
});
