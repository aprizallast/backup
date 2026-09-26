import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildLocalDevOrigins } from "./local-dev-origins.ts";

describe("buildLocalDevOrigins", () => {
  it("includes the current localhost dev ports used by the app", () => {
    const origins = buildLocalDevOrigins();
    assert.ok(origins.includes("http://localhost:8080"));
    assert.ok(origins.includes("http://localhost:8082"));
    assert.ok(origins.includes("http://127.0.0.1:8082"));
    assert.ok(origins.includes("http://[::1]:8082"));
  });
});
