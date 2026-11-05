import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { renderApp } from "../../test/render";
import { adminUser, backend, PASSWORD } from "../../test/server";

const STRONG = "Brand-New-Pass-7";

describe("profile settings", () => {
  it("saves display name, language and theme", async () => {
    const user = userEvent.setup();
    renderApp("/settings");
    const name = await screen.findByLabelText("Nom affiché");
    await user.clear(name);
    await user.type(name, "Camille M.");
    await user.click(screen.getByText("Sombre"));
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));
    expect(await screen.findByText("Enregistré.")).toBeInTheDocument();
    expect(backend.lastPatch).toMatchObject({ display_name: "Camille M.", theme: "dark" });
  });

  it("requires a display name", async () => {
    const user = userEvent.setup();
    renderApp("/settings");
    await user.clear(await screen.findByLabelText("Nom affiché"));
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));
    expect(await screen.findByText("Saisissez un nom.")).toBeInTheDocument();
    expect(backend.lastPatch).toBeNull();
  });

  it("persists the header language switch on the profile", async () => {
    const user = userEvent.setup();
    renderApp("/");
    await user.click(await screen.findByText("EN"));
    await waitFor(() => expect(backend.lastPatch).toEqual({ locale: "en" }));
  });

  it("persists the header theme toggle on the profile", async () => {
    const user = userEvent.setup();
    renderApp("/");
    await user.click(await screen.findByRole("button", { name: "Basculer thème clair / sombre" }));
    await waitFor(() => expect(backend.lastPatch).toEqual({ theme: "dark" }));
  });

  it("hides the users tab from non-admins", async () => {
    renderApp("/settings");
    expect(await screen.findByRole("tab", { name: "Profil" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Utilisateurs" })).not.toBeInTheDocument();
  });

  it("switches tabs", async () => {
    const user = userEvent.setup();
    const { router } = renderApp("/settings");
    await user.click(await screen.findByRole("tab", { name: "Mot de passe" }));
    expect(router.state.location.pathname).toBe("/settings/password");
  });
});

describe("password settings", () => {
  it("shows the live checklist and validates locally", async () => {
    const user = userEvent.setup();
    renderApp("/settings/password");
    await user.type(await screen.findByLabelText("Mot de passe actuel"), PASSWORD);
    await user.type(screen.getByLabelText("Nouveau mot de passe"), "short");
    await user.type(screen.getByLabelText("Confirmer le nouveau mot de passe"), "other");
    const rules = screen.getByRole("list", { name: "Règles du mot de passe" });
    expect(within(rules).getByText("Une minuscule").closest("li")).toHaveAttribute(
      "data-ok",
      "true",
    );
    expect(within(rules).getByText("Au moins 12 caractères").closest("li")).toHaveAttribute(
      "data-ok",
      "false",
    );
    await user.click(screen.getByRole("button", { name: "Changer le mot de passe" }));
    expect(
      screen.getByText("Le mot de passe ne respecte pas les règles ci-dessous."),
    ).toBeVisible();
    expect(screen.getByText("Les mots de passe ne correspondent pas.")).toBeVisible();
  });

  it("reports a wrong current password", async () => {
    const user = userEvent.setup();
    renderApp("/settings/password");
    await user.type(await screen.findByLabelText("Mot de passe actuel"), "Not-The-Pass-1");
    await user.type(screen.getByLabelText("Nouveau mot de passe"), STRONG);
    await user.type(screen.getByLabelText("Confirmer le nouveau mot de passe"), STRONG);
    await user.click(screen.getByRole("button", { name: "Changer le mot de passe" }));
    expect(await screen.findByText("Le mot de passe actuel est incorrect.")).toBeInTheDocument();
  });

  it("changes the password", async () => {
    const user = userEvent.setup();
    renderApp("/settings/password");
    await user.type(await screen.findByLabelText("Mot de passe actuel"), PASSWORD);
    await user.type(screen.getByLabelText("Nouveau mot de passe"), STRONG);
    await user.type(screen.getByLabelText("Confirmer le nouveau mot de passe"), STRONG);
    await user.click(screen.getByRole("button", { name: "Changer le mot de passe" }));
    expect(await screen.findByText(/Mot de passe changé/)).toBeInTheDocument();
    expect(backend.password).toBe(STRONG);
  });
});

describe("users administration", () => {
  it("is not reachable by regular users", async () => {
    const { router } = renderApp("/settings/users");
    await waitFor(() => expect(router.state.location.pathname).toBe("/settings"));
  });

  it("lists users with role and status", async () => {
    renderApp("/settings/users", { user: adminUser });
    const row = (await screen.findByText("admin@example.com")).closest("tr");
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).getByText("Administrateur")).toBeInTheDocument();
    expect(within(row as HTMLElement).getByText("—")).toBeInTheDocument();
    expect(screen.getByText("user@example.com")).toBeInTheDocument();
  });

  it("creates a user", async () => {
    const user = userEvent.setup();
    renderApp("/settings/users", { user: adminUser });
    await user.click(await screen.findByRole("button", { name: "Nouvel utilisateur" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("E-mail"), "new@example.com");
    await user.type(within(dialog).getByLabelText("Nom affiché"), "New Person");
    await user.type(within(dialog).getByLabelText("Mot de passe initial"), STRONG);
    await user.click(within(dialog).getByRole("button", { name: "Nouvel utilisateur" }));
    expect(await screen.findByText("new@example.com")).toBeInTheDocument();
  });

  it("shows API errors in the creation dialog", async () => {
    const user = userEvent.setup();
    renderApp("/settings/users", { user: adminUser });
    await user.click(await screen.findByRole("button", { name: "Nouvel utilisateur" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("E-mail"), "user@example.com");
    await user.type(within(dialog).getByLabelText("Nom affiché"), "Dup");
    await user.type(within(dialog).getByLabelText("Mot de passe initial"), STRONG);
    await user.click(within(dialog).getByRole("button", { name: "Nouvel utilisateur" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("déjà utilisée");
  });

  it("edits a user and reports the last-admin rule", async () => {
    const user = userEvent.setup();
    renderApp("/settings/users", { user: adminUser });
    await user.click(await screen.findByRole("button", { name: "Modifier admin@example.com" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByLabelText("Actif"));
    await user.click(within(dialog).getByRole("button", { name: "Enregistrer" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Il doit rester au moins un administrateur actif.",
    );
  });

  it("deactivates a regular user", async () => {
    const user = userEvent.setup();
    renderApp("/settings/users", { user: adminUser });
    await user.click(await screen.findByRole("button", { name: "Modifier user@example.com" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByLabelText("Actif"));
    await user.click(within(dialog).getByRole("button", { name: "Enregistrer" }));
    await waitFor(() => expect(backend.users[0]!.is_active).toBe(false));
  });

  it("resets a password", async () => {
    const user = userEvent.setup();
    renderApp("/settings/users", { user: adminUser });
    await user.click(
      await screen.findByRole("button", {
        name: "Réinitialiser le mot de passe de user@example.com",
      }),
    );
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Nouveau mot de passe"), STRONG);
    await user.click(within(dialog).getByRole("button", { name: "Réinitialiser le mot de passe" }));
    expect(await screen.findByText(/Mot de passe réinitialisé/)).toBeInTheDocument();
  });
});
