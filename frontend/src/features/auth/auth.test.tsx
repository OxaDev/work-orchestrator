import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { renderApp } from "../../test/render";
import { adminUser, backend, PASSWORD, regularUser, server } from "../../test/server";
import { safeNextPath } from "./nextPath";

async function signIn(email: string, password = PASSWORD) {
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText("E-mail"), email);
  await user.type(screen.getByLabelText("Mot de passe"), password);
  await user.click(screen.getByRole("button", { name: "Se connecter" }));
  return user;
}

describe("route guard", () => {
  it("sends anonymous visitors to the login page and keeps the requested path", async () => {
    const { router } = renderApp("/settings/password", { user: null });
    expect(await screen.findByRole("button", { name: "Se connecter" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/login");
    expect(router.state.location.search).toBe("?next=%2Fsettings%2Fpassword");
  });

  it("returns to the requested page after signing in", async () => {
    const { router } = renderApp("/settings/password", { user: null });
    await signIn("user@example.com");
    await waitFor(() => expect(router.state.location.pathname).toBe("/settings/password"));
    expect(await screen.findByLabelText("Mot de passe actuel")).toBeInTheDocument();
  });

  it("redirects a signed-in user away from the login page", async () => {
    const { router } = renderApp("/login?next=/agenda");
    await waitFor(() => expect(router.state.location.pathname).toBe("/agenda"));
  });

  it.each([
    [null, "/"],
    ["/agenda", "/agenda"],
    ["//evil.example", "/"],
    ["https://evil.example", "/"],
  ])("safeNextPath(%s) = %s", (next, expected) => {
    expect(safeNextPath(next)).toBe(expected);
  });
});

describe("login page", () => {
  it("validates the form before calling the API", async () => {
    renderApp("/login", { user: null });
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Se connecter" }));
    expect(screen.getByText("Saisissez une adresse e-mail valide.")).toBeInTheDocument();
    expect(screen.getByText("Saisissez votre mot de passe.")).toBeInTheDocument();
  });

  it("shows a generic message for bad credentials", async () => {
    renderApp("/login", { user: null });
    await signIn("user@example.com", "Wrong-Password-1");
    expect(await screen.findByRole("alert")).toHaveTextContent("E-mail ou mot de passe incorrect.");
  });

  it("tells how long to wait when locked out", async () => {
    renderApp("/login", { user: null });
    await signIn("locked@example.com");
    expect(await screen.findByRole("alert")).toHaveTextContent("Réessayez dans 9 min.");
  });

  it("applies the user's stored language after signing in", async () => {
    renderApp("/login", { user: null });
    backend.users[0]!.locale = "en";
    await signIn("user@example.com");
    const nav = await screen.findByRole("navigation");
    expect(await within(nav).findByText("Directory")).toBeInTheDocument();
  });
});

describe("session", () => {
  it("signs out from the user menu", async () => {
    const user = userEvent.setup();
    const { router } = renderApp("/");
    await user.click(await screen.findByRole("button", { name: "Ouvrir le menu utilisateur" }));
    await user.click(await screen.findByText("Se déconnecter"));
    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
    expect(backend.session).toBeNull();
  });

  it("renews an expired access token transparently", async () => {
    let meCalls = 0;
    server.use(
      http.get("*/api/v1/auth/me", () => {
        meCalls += 1;
        return meCalls === 1
          ? HttpResponse.json({ code: "AUTH_REQUIRED", detail: "", params: {} }, { status: 401 })
          : HttpResponse.json(regularUser);
      }),
      http.post("*/api/v1/auth/refresh", () => HttpResponse.json(regularUser)),
    );
    renderApp("/");
    expect(await screen.findByText("Camille Martin")).toBeInTheDocument();
    expect(meCalls).toBe(2);
  });

  it("treats a refresh done by another tab (409) as success", async () => {
    let meCalls = 0;
    server.use(
      http.get("*/api/v1/auth/me", () => {
        meCalls += 1;
        return meCalls === 1
          ? HttpResponse.json({ code: "AUTH_REQUIRED", detail: "", params: {} }, { status: 401 })
          : HttpResponse.json(adminUser);
      }),
      http.post("*/api/v1/auth/refresh", () =>
        HttpResponse.json(
          { code: "REFRESH_TOKEN_ALREADY_ROTATED", detail: "", params: {} },
          { status: 409 },
        ),
      ),
    );
    renderApp("/");
    expect(await screen.findByText("Admin Istrator")).toBeInTheDocument();
  });

  it("goes back to login when the session cannot be renewed", async () => {
    const { router } = renderApp("/settings", { user: null });
    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
  });

  it("falls back to the login page when the session check fails", async () => {
    server.use(
      http.get("*/api/v1/auth/me", () =>
        HttpResponse.json({ code: "INTERNAL_ERROR", detail: "", params: {} }, { status: 500 }),
      ),
    );
    const { router } = renderApp("/");
    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
  });
});
