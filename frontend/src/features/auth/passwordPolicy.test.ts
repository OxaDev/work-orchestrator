import { describe, expect, it } from "vitest";

import { passwordViolations } from "./passwordPolicy";

// Same cases as backend tests/unit/test_password_policy.py (ADR-0008).
describe("passwordViolations", () => {
  it.each([
    "Correct-Horse-42",
    "Abcdefghij1!",
    "Abcdefghij1-",
    "Ébène-Forêt-2026",
    "Abcdefghij1 ",
    "Abcdefghij1^",
  ])("accepts %s", (password) => {
    expect(passwordViolations(password)).toEqual([]);
  });

  it.each([
    ["Abcdefgh1!", ["PASSWORD_TOO_SHORT"]],
    ["abcdefghij1!", ["PASSWORD_MISSING_UPPERCASE"]],
    ["ABCDEFGHIJ1!", ["PASSWORD_MISSING_LOWERCASE"]],
    ["Abcdefghijk!", ["PASSWORD_MISSING_DIGIT"]],
    ["Abcdefghijk1", ["PASSWORD_MISSING_SYMBOL"]],
    [`A1!${"a".repeat(126)}`, ["PASSWORD_TOO_LONG"]],
    [
      "",
      [
        "PASSWORD_TOO_SHORT",
        "PASSWORD_MISSING_UPPERCASE",
        "PASSWORD_MISSING_LOWERCASE",
        "PASSWORD_MISSING_DIGIT",
        "PASSWORD_MISSING_SYMBOL",
      ],
    ],
  ])("rejects %s", (password, expected) => {
    expect(passwordViolations(password)).toEqual(expected);
  });
});
