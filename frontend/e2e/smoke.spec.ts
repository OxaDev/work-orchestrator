import { expect, test } from "./fixtures";
import { signIn } from "./helpers";

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

test("home page loads assets and reaches the API through the base path", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "Work Orchestrator", level: 2 })).toBeVisible();
  await expect(page.getByText("API et base de données opérationnelles")).toBeVisible();
});

test("deep link survives a full page reload", async ({ page }) => {
  await page.goto("./documents/templates");
  await expect(page.getByRole("heading", { name: "Modèles de documents" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Modèles de documents" })).toBeVisible();
});

test("pages and API answers carry the security headers (P12-1, ADR-0041)", async ({ page }) => {
  for (const url of ["./", "./api/v1/health"]) {
    const response = await page.request.get(url);
    const headers = response.headers();
    expect(headers["content-security-policy"]).toContain("default-src 'self'");
    expect(headers["content-security-policy"]).toContain("script-src 'self'");
    expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["referrer-policy"]).toBe("same-origin");
    expect(headers["permissions-policy"]).toContain("camera=()");
  }
});
