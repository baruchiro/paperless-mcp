import assert from "node:assert/strict";
import { test } from "node:test";
import {
  canSendCredentials,
  omitHeaders,
  parseExtraHeaders,
  reservedHeaderNames,
} from "./utils";

test("parseExtraHeaders returns an empty object when nothing is configured", () => {
  assert.deepEqual(parseExtraHeaders(undefined, []), {});
  assert.deepEqual(parseExtraHeaders("   ", []), {});
});

test("parseExtraHeaders reads a JSON object from the environment", () => {
  const headers = parseExtraHeaders(
    '{"CF-Access-Client-Id":"id.access","CF-Access-Client-Secret":"secret"}'
  );

  assert.deepEqual(headers, {
    "CF-Access-Client-Id": "id.access",
    "CF-Access-Client-Secret": "secret",
  });
});

test("parseExtraHeaders parses repeated --header flags and trims around the colon", () => {
  const headers = parseExtraHeaders(undefined, [
    "CF-Access-Client-Id:  id.access ",
    "X-Custom: value: with colons",
  ]);

  assert.deepEqual(headers, {
    "CF-Access-Client-Id": "id.access",
    "X-Custom": "value: with colons",
  });
});

test("parseExtraHeaders lets --header override the environment variable", () => {
  const headers = parseExtraHeaders('{"X-Env":"from-env"}', ["X-Env: from-cli"]);

  assert.deepEqual(headers, { "X-Env": "from-cli" });
});

test("parseExtraHeaders rejects headers the client controls itself", () => {
  assert.throws(() => parseExtraHeaders('{"Authorization":"Token other"}'), {
    message: /must not set the "Authorization" header/,
  });
  assert.throws(() => parseExtraHeaders(undefined, ["authorization: Token other"]), {
    message: /must not set the "authorization" header/,
  });
  assert.throws(() => parseExtraHeaders('{"Accept":"text/html"}'), {
    message: /must not set the "Accept" header/,
  });
  assert.throws(() => parseExtraHeaders(undefined, ["Content-Type: text/plain"]), {
    message: /must not set the "Content-Type" header/,
  });
});

test("parseExtraHeaders rejects malformed input", () => {
  assert.throws(() => parseExtraHeaders("not json"), {
    message: /not valid JSON/,
  });
  assert.throws(() => parseExtraHeaders('["X-Custom"]'), {
    message: /must be a JSON object/,
  });
  assert.throws(() => parseExtraHeaders('{"X-Custom":42}'), {
    message: /value for "X-Custom" must be a string/,
  });
  assert.throws(() => parseExtraHeaders(undefined, ["X-Custom value"]), {
    message: /without a colon/,
  });
  assert.throws(() => parseExtraHeaders(undefined, ["   : value"]), {
    message: /empty name/,
  });
});

test("parseExtraHeaders never echoes a header value in its error messages", () => {
  const secret = "super-secret-service-token";

  for (const call of [
    () => parseExtraHeaders(`{"Authorization":"${secret}"}`),
    () => parseExtraHeaders(`{"X-Custom":{"nested":"${secret}"}}`),
    () => parseExtraHeaders(`{"X-Custom":"${secret}"`),
    () => parseExtraHeaders(undefined, [`: ${secret}`]),
  ]) {
    assert.throws(call, (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.ok(
        !error.message.includes(secret),
        `error message leaked the header value: ${error.message}`
      );
      return true;
    });
  }
});

test("parseExtraHeaders compares header names case-insensitively", () => {
  const headers = parseExtraHeaders('{"X-Proxy":"from-env"}', ["x-proxy: from-cli"]);

  assert.deepEqual(headers, { "x-proxy": "from-cli" });
});

test("parseExtraHeaders rejects a header named __proto__", () => {
  assert.throws(() => parseExtraHeaders('{"__proto__":"value"}'), {
    message: /cannot set a header named "__proto__"/,
  });
  assert.throws(() => parseExtraHeaders(undefined, ["__proto__: value"]), {
    message: /cannot set a header named "__proto__"/,
  });
});

test("parseExtraHeaders rejects header names that are not valid HTTP tokens", () => {
  assert.throws(() => parseExtraHeaders('{"Bad Name":"value"}'), {
    message: /invalid header name: "Bad Name"/,
  });
  assert.throws(() => parseExtraHeaders(undefined, ["Bad Name: value"]), {
    message: /invalid header name: "Bad Name"/,
  });
});

test("parseExtraHeaders rejects header values containing control characters", () => {
  assert.throws(
    () => parseExtraHeaders('{"X-Test":"value\\r\\nInjected: yes"}'),
    { message: /invalid value for header "X-Test"/ }
  );
  assert.throws(
    () => parseExtraHeaders(undefined, ["X-Test: value\r\nInjected: yes"]),
    { message: /invalid value for header "X-Test"/ }
  );
});

test("parseExtraHeaders never echoes an invalid value in its error message", () => {
  const secret = "super-secret-service-token";

  assert.throws(
    () => parseExtraHeaders(`{"X-Test":"${secret}\\u0000"}`),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.ok(
        !error.message.includes(secret),
        `error message leaked the header value: ${error.message}`
      );
      return true;
    }
  );
});

test("omitHeaders drops the named headers in any casing", () => {
  assert.deepEqual(
    omitHeaders(
      {
        authorization: "Token a",
        Authorization: "Token b",
        ACCEPT: "text/html",
        "Content-Type": "text/plain",
        "X-Keep": "kept",
      },
      reservedHeaderNames
    ),
    { "X-Keep": "kept" }
  );

  assert.deepEqual(
    omitHeaders({ Authorization: "Token a", Accept: "text/html" }, [
      "authorization",
    ]),
    { Accept: "text/html" }
  );
});

test("canSendCredentials allows https and loopback, refuses cleartext elsewhere", () => {
  assert.equal(canSendCredentials("https://paperless.example.com"), true);
  assert.equal(canSendCredentials("http://localhost:8000"), true);
  assert.equal(canSendCredentials("http://127.0.0.1:8000"), true);
  assert.equal(canSendCredentials("http://[::1]:8000"), true);
  assert.equal(canSendCredentials("http://127.0.0.2:8000"), true);
  assert.equal(canSendCredentials("http://localhost.:8000"), true);
  assert.equal(canSendCredentials("http://paperless.example.com"), false);
  assert.equal(canSendCredentials("http://192.168.1.10:8000"), false);
  assert.equal(canSendCredentials("http://127.0.0.1.example.com"), false);
  assert.equal(canSendCredentials("ftp://localhost/paperless"), false);
  assert.equal(canSendCredentials("not a url"), false);
});
