import { describe, expect, it } from "vitest";

import i18n, { isLocale, resources, setLocale } from ".";

function flattenKeys(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null) return [prefix];
  return Object.entries(value).flatMap(([key, child]) =>
    flattenKeys(child, prefix ? `${prefix}.${key}` : key),
  );
}

describe("translations (ADR-0013)", () => {
  it.each(Object.keys(resources.en))("namespace %s has the same keys in EN and FR", (ns) => {
    const en = flattenKeys(resources.en[ns as keyof typeof resources.en]).sort();
    const fr = flattenKeys(resources.fr[ns as keyof typeof resources.fr]).sort();
    expect(fr).toEqual(en);
  });

  it("has no empty translation", () => {
    for (const locale of Object.values(resources)) {
      for (const ns of Object.values(locale)) {
        for (const key of flattenKeys(ns)) {
          const text = key.split(".").reduce<unknown>((node, part) => {
            return (node as Record<string, unknown>)[part];
          }, ns);
          expect(text, key).not.toBe("");
        }
      }
    }
  });
});

describe("locale handling", () => {
  it("validates locales", () => {
    expect(isLocale("fr")).toBe(true);
    expect(isLocale("de")).toBe(false);
  });

  it("switches language, updates <html lang> and remembers the choice", async () => {
    await setLocale("en");
    expect(i18n.language).toBe("en");
    expect(document.documentElement.lang).toBe("en");
    expect(window.localStorage.getItem("wo.locale")).toBe("en");
  });
});
