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

test("returns error for trailing dollar sign", () => {
  const err = getMonetaryValidationError("10.00$");
  assert.ok(err);
  assert.match(err, /USD10\.00/);
  assert.match(err, /currency code as a prefix/);
});

test("returns error for trailing euro sign", () => {
  const err = getMonetaryValidationError("123€");
  assert.ok(err);
  assert.match(err, /EUR123\.00/);
});

test("returns error for trailing pound sign", () => {
  const err = getMonetaryValidationError("50£");
  assert.ok(err);
  assert.match(err, /GBP50\.00/);
});

test("returns error for trailing shekel sign", () => {
  const err = getMonetaryValidationError("100₪");
  assert.ok(err);
  assert.match(err, /ILS100\.00/);
});

test("returns error for trailing rupee sign", () => {
  const err = getMonetaryValidationError("200₹");
  assert.ok(err);
  assert.match(err, /INR200\.00/);
});

test("returns error for trailing yen sign", () => {
  const err = getMonetaryValidationError("500¥");
  assert.ok(err);
  assert.match(err, /JPY500\.00/);
});
