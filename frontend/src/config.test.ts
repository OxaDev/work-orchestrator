import { describe, expect, it } from "vitest";

import { normalizeBase } from "../vite.config";
import { apiBaseUrl, routerBasename } from "./config";

describe("base path helpers (ADR-0011)", () => {
  it.each([
    ["/work-orchestrator/", "/work-orchestrator"],
    ["/", "/"],
  ])("routerBasename(%s) = %s", (base, expected) => {
    expect(routerBasename(base)).toBe(expected);
  });

  it.each([
    ["/work-orchestrator/", "http://h", "http://h/work-orchestrator"],
    ["/", "http://h", "http://h"],
  ])("apiBaseUrl(%s, %s) = %s", (base, origin, expected) => {
    expect(apiBaseUrl(base, origin)).toBe(expected);
  });

  it.each([
    [undefined, "/work-orchestrator/"],
    ["/work-orchestrator", "/work-orchestrator/"],
    ["work-orchestrator/", "/work-orchestrator/"],
    ["", "/"],
    ["/", "/"],
  ])("normalizeBase(%s) = %s", (raw, expected) => {
    expect(normalizeBase(raw)).toBe(expected);
  });
});
