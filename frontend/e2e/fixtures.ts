import { expect, test as base } from "@playwright/test";

/**
 * Every spec runs behind the production nginx and its Content-Security-Policy (ADR-0041): a
 * page that trips the policy fails its test, whatever the test asserts.
 */
export const test = base.extend({
  page: async ({ page }, provide) => {
    const violations: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error" && /Content Security Policy/i.test(message.text())) {
        violations.push(message.text());
      }
    });
    await provide(page);
    expect(violations, "Content-Security-Policy violations").toEqual([]);
  },
});

export { expect };
export type { Page } from "@playwright/test";
