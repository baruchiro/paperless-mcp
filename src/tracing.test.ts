import assert from "node:assert";
import { describe, it } from "node:test";
import { tracer } from "./tracing";

describe("OpenTelemetry tracing", () => {
  it("creates and ends a span without error", (ctx: any, done: Function) => {
    const span = tracer.startSpan("test-span");
    span.setAttribute("test", true);
    span.addEvent("probe");
    span.end();
    const span2 = tracer.startSpan("test-child");
    span2.end();
    done();
  });

  it("active span runs a callback", () => {
    tracer.startActiveSpan("active-test", (span) => {
      span.setAttribute("key", "value");
      span.end();
    });
  });
});
