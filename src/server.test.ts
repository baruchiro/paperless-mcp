import { test } from "node:test";
import assert from "node:assert/strict";
import type express from "express";
import { getBearerToken } from "./server";

function reqWith(authorization?: string): express.Request {
  return {
    headers: authorization ? { authorization } : {},
  } as unknown as express.Request;
}

test("client Bearer token takes precedence over the server token", () => {
  const token = getBearerToken(reqWith("Bearer client-token"), {
    fallbackToken: "server-token",
    allowAnonymous: true,
  });
  assert.equal(token, "client-token");
});

test("client Bearer token is used even when anonymous access is disabled", () => {
  const token = getBearerToken(reqWith("Bearer client-token"), {
    fallbackToken: "server-token",
    allowAnonymous: false,
  });
  assert.equal(token, "client-token");
});

test("falls back to the server token only when anonymous access is allowed", () => {
  const token = getBearerToken(reqWith(), {
    fallbackToken: "server-token",
    allowAnonymous: true,
  });
  assert.equal(token, "server-token");
});

test("no header without anonymous access yields no token (request is rejected)", () => {
  const token = getBearerToken(reqWith(), {
    fallbackToken: "server-token",
    allowAnonymous: false,
  });
  assert.equal(token, undefined);
});

test("non-Bearer Authorization scheme never leaks the server token by default", () => {
  const token = getBearerToken(reqWith("Token server-token"), {
    fallbackToken: "server-token",
    allowAnonymous: false,
  });
  assert.equal(token, undefined);
});

test("anonymous access with no configured server token yields no token", () => {
  const token = getBearerToken(reqWith(), {
    allowAnonymous: true,
  });
  assert.equal(token, undefined);
});
