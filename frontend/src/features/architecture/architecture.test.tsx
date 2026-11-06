import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { arch, archIds } from "../../test/architectureBackend";
import { ids } from "../../test/directoryBackend";
import { microIds } from "../../test/microBackend";
import { missionIds } from "../../test/missionsBackend";
import { renderApp } from "../../test/render";

type User = ReturnType<typeof userEvent.setup>;

async function pick(user: User, label: string, option: string | RegExp, scope?: HTMLElement) {
  const root = scope ? within(scope) : screen;
  await user.click(await root.findByRole("combobox", { name: label }));
  await user.click(await screen.findByRole("option", { name: option }));
}

describe("architecture home (P8-8)", () => {
  it("lists architectures, shows a client's domain tree and creates an architecture", async () => {
    const user = userEvent.setup();
    const { router } = renderApp("/architecture");
    const row = (await screen.findByRole("link", { name: "SI Horizon" })).closest("tr")!;
    expect(within(row).getByText("Banque Horizon")).toBeInTheDocument();
    expect(within(row).getByText("Horizon — Paiements")).toBeInTheDocument();
    expect(within(row).getByText("Actuel")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Domaines" }));
    expect(
      await screen.findByText("Choisissez un client pour voir ses domaines."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nouveau domaine" })).toBeDisabled();
    await pick(user, "Client", "Banque Horizon");
    const tree = await screen.findByRole("tree", { name: "Domaines" });
    const api = within(tree).getByRole("link", { name: "API" }).closest('[role="treeitem"]');
    expect(api).toHaveAttribute("aria-level", "3");
    expect(within(tree).getByText("Cible")).toBeInTheDocument();
    expect(within(tree).getAllByRole("img", { name: "Service" }).length).toBeGreaterThan(0);

    await user.click(screen.getByRole("tab", { name: "Architectures" }));
    await user.click(screen.getByRole("button", { name: "Nouvelle architecture" }));
    const dialog = await screen.findByRole("dialog", { name: "Nouvelle architecture" });
    await user.type(within(dialog).getByRole("textbox", { name: "Nom" }), "SI cible");
    await pick(user, "Cycle de vie", "Cible", dialog);
    await user.click(within(dialog).getByRole("button", { name: "Enregistrer" }));
    await waitFor(() =>
      expect(router.state.location.pathname).toMatch(/^\/architecture\/architectures\//),
    );
    expect(arch.lastBody).toMatchObject({
      company_id: ids.bankCompany,
      name: "SI cible",
      lifecycle: "TARGET",
      mission_id: null,
    });
  });
});

describe("architecture page (P8-8)", () => {
  it("shows the members' subtrees and manages entry domains", async () => {
    const user = userEvent.setup();
    arch.domains.push({
      ...arch.domains.find((d) => d.id === archIds.payments)!,
      id: "domain-crm",
      name: "CRM",
      kind: "APPLICATION",
      parent_id: null,
    });
    renderApp(`/architecture/architectures/${archIds.si}`);
    const tree = await screen.findByRole("tree", { name: "Domaines de l'architecture" });
    expect(within(tree).getByText("entrée")).toBeInTheDocument();
    expect(within(tree).getByRole("link", { name: "Base" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Domaines (4)" })).toBeInTheDocument();

    await pick(user, "Ajouter un domaine d'entrée", "CRM");
    await waitFor(() => expect(arch.lastUrl).toBe("member:domain-crm"));
    await user.click(await screen.findByRole("button", { name: "Retirer CRM de l'architecture" }));
    await waitFor(() => expect(arch.lastUrl).toBe("unmember:domain-crm"));

    await user.click(screen.getByRole("tab", { name: "Description" }));
    expect(screen.getByText("SI")).toBeInTheDocument();
  });

  it("creates a domain directly in the architecture", async () => {
    const user = userEvent.setup();
    const { router } = renderApp(`/architecture/architectures/${archIds.si}`);
    await user.click(await screen.findByRole("button", { name: "Nouveau domaine" }));
    const dialog = await screen.findByRole("dialog", { name: "Nouveau domaine" });
    await user.click(within(dialog).getByRole("button", { name: "Enregistrer" }));
    expect(await within(dialog).findByText("Obligatoire.")).toBeInTheDocument();
    await user.type(within(dialog).getByRole("textbox", { name: "Nom" }), "Cartes");
    await pick(user, "Type", "Domaine métier", dialog);
    await pick(user, "Criticité", "Critique", dialog);
    await user.click(within(dialog).getByRole("button", { name: "Enregistrer" }));
    await waitFor(() =>
      expect(router.state.location.pathname).toMatch(/^\/architecture\/domains\//),
    );
    expect(arch.lastBody).toMatchObject({
      name: "Cartes",
      kind: "BUSINESS_DOMAIN",
      criticality: "CRITICAL",
      company_id: ids.bankCompany,
      architecture_id: archIds.si,
      parent_id: null,
    });
  });
});

describe("domain sheet (P8-9, P8-10)", () => {
  it("shows the domain, its owner chain, architectures and sub-domains", async () => {
    const user = userEvent.setup();
    renderApp(`/architecture/domains/${archIds.hub}`);
    expect(await screen.findByRole("heading", { name: "Hub", level: 2 })).toBeInTheDocument();
    expect(screen.getByText("Critique")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Paiements" })).toBeInTheDocument(); // breadcrumb
    expect(screen.getByRole("link", { name: "SI Horizon" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Hub de paiements" })).toBeInTheDocument();
    const chain = screen.getByRole("navigation", { name: "Organisation responsable" });
    expect(chain).toHaveTextContent("Direction DSI");
    expect(chain).toHaveTextContent("Pôle Paiements");

    await user.click(screen.getByRole("tab", { name: "Sous-domaines (2)" }));
    expect(screen.getByRole("link", { name: "API" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Supprimer" }));
    await user.click(
      within(await screen.findByRole("dialog", { name: "Supprimer ?" })).getByRole("button", {
        name: "Confirmer",
      }),
    );
    expect(await screen.findByText(/encore utilisé/)).toBeInTheDocument();
  });

  it("creates, edits and deletes relations (RG-09)", async () => {
    const user = userEvent.setup();
    renderApp(`/architecture/domains/${archIds.api}`);
    await user.click(await screen.findByRole("tab", { name: "Relations (1)" }));
    const outgoing = screen.getByRole("table");
    expect(within(outgoing).getByText("Écrit dans")).toBeInTheDocument();
    expect(within(outgoing).getByRole("link", { name: "Base" })).toBeInTheDocument();
    expect(within(outgoing).getByText("JDBC")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Ajouter une relation sortante" }));
    const dialog = await screen.findByRole("dialog", { name: "Nouvelle relation" });
    await pick(user, "Vers", "Paiements › Hub › API", dialog);
    await user.click(within(dialog).getByRole("button", { name: "Enregistrer" }));
    expect(
      await within(dialog).findByText("Un domaine ne peut pas être relié à lui-même."),
    ).toBeInTheDocument();
    await pick(user, "Vers", "Paiements › Hub", dialog);
    await pick(user, "Relation", "Autre", dialog);
    await user.click(within(dialog).getByRole("button", { name: "Enregistrer" }));
    expect(await within(dialog).findByText("Nommez cette relation.")).toBeInTheDocument();
    await user.type(
      within(dialog).getByRole("textbox", { name: "Libellé" }),
      "Remonte les erreurs",
    );
    await user.type(within(dialog).getByRole("combobox", { name: "Protocole" }), "gRPC");
    await pick(user, "Mode", "Asynchrone", dialog);
    await user.click(within(dialog).getByRole("button", { name: "Enregistrer" }));
    await waitFor(() =>
      expect(arch.lastBody).toMatchObject({
        source_id: archIds.api,
        target_id: archIds.hub,
        type: "CUSTOM",
        label: "Remonte les erreurs",
        protocol: "gRPC",
        sync_mode: "ASYNC",
      }),
    );

    await user.click(await screen.findByRole("button", { name: "Modifier la relation avec Base" }));
    const edit = await screen.findByRole("dialog", { name: "Modifier la relation" });
    await pick(user, "Cycle de vie", "Obsolète", edit);
    await user.click(within(edit).getByRole("button", { name: "Enregistrer" }));
    await waitFor(() => expect(arch.lastBody).toMatchObject({ lifecycle: "DEPRECATED" }));
    await user.click(
      await screen.findByRole("button", { name: "Supprimer la relation avec Base" }),
    );
    await waitFor(() => expect(arch.lastUrl).toBe(`delete-relation:${archIds.relation}`));

    await user.click(screen.getByRole("button", { name: "Ajouter une relation entrante" }));
    const incoming = await screen.findByRole("dialog", { name: "Nouvelle relation" });
    expect(within(incoming).getByRole("combobox", { name: "Vers" })).toHaveValue(
      "Paiements › Hub › API",
    );
  });

  it("edits the domain, its technologies, subjects and external links", async () => {
    const user = userEvent.setup();
    renderApp(`/architecture/domains/${archIds.base}`);
    await user.click(await screen.findByRole("button", { name: "Modifier" }));
    const dialog = await screen.findByRole("dialog", { name: "Modifier le domaine" });
    await pick(user, "Cycle de vie", "Actuel", dialog);
    await pick(user, "Unité responsable", /DSI/, dialog);
    await user.click(within(dialog).getByRole("button", { name: "Enregistrer" }));
    await waitFor(() =>
      expect(arch.lastBody).toMatchObject({ lifecycle: "CURRENT", owner_org_unit_id: ids.dsi }),
    );

    await user.type(screen.getByRole("textbox", { name: "Libellé" }), "Schéma");
    await user.type(screen.getByRole("textbox", { name: "Adresse" }), "pas une url");
    await user.click(screen.getByRole("button", { name: "Ajouter" }));
    expect(await screen.findByText(/adresse complète/)).toBeInTheDocument();
    await user.clear(screen.getByRole("textbox", { name: "Adresse" }));
    await user.type(
      screen.getByRole("textbox", { name: "Adresse" }),
      "https://git.example.com/base",
    );
    await user.click(screen.getByRole("button", { name: "Ajouter" }));
    expect(await screen.findByRole("link", { name: "Schéma" })).toHaveAttribute(
      "href",
      "https://git.example.com/base",
    );
    await user.click(screen.getByRole("button", { name: "Supprimer Schéma" }));
    await waitFor(() => expect(arch.links).toEqual([]));

    await user.click(screen.getByRole("tab", { name: "Technologies (0)" }));
    await user.type(screen.getByRole("combobox", { name: "Technologie" }), "Pyth");
    await user.click(await screen.findByRole("option", { name: "Python" }));
    await user.type(screen.getByRole("textbox", { name: "Version" }), "3.13");
    await user.click(screen.getByRole("button", { name: "Ajouter" }));
    expect(await screen.findByText("Python 3.13")).toBeInTheDocument();
    expect(arch.lastBody).toEqual({ version: "3.13" });

    await user.click(screen.getByRole("tab", { name: "Technologies (1)" }));
    await user.click(screen.getByRole("tab", { name: "Sujets (0)" }));
    await pick(user, "Lier un sujet", "Migration Kafka › Consumers");
    await waitFor(() => expect(arch.lastUrl).toBe(`subject:${microIds.consumers}`));
    expect(await screen.findByText("Aucune tâche sur ces sujets.")).toBeInTheDocument();
  });
});

describe("mission architectures (Q-H1)", () => {
  it("links, unlinks and creates the mission's architectures", async () => {
    const user = userEvent.setup();
    const { router } = renderApp(`/missions/${missionIds.current}?tab=architectures`);
    expect(await screen.findByRole("link", { name: "SI Horizon" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Délier SI Horizon" }));
    await waitFor(() => expect(arch.lastUrl).toBe(`unlink:${missionIds.current}`));
    await pick(user, "Lier une architecture", "SI Horizon");
    await waitFor(() => expect(arch.lastUrl).toBe(`link:${missionIds.current}`));

    await user.click(screen.getByRole("button", { name: "Nouvelle architecture" }));
    const dialog = await screen.findByRole("dialog", { name: "Nouvelle architecture" });
    expect(within(dialog).getByRole("combobox", { name: "Client" })).toBeDisabled();
    await user.type(within(dialog).getByRole("textbox", { name: "Nom" }), "SI Paiements");
    await user.click(within(dialog).getByRole("button", { name: "Enregistrer" }));
    await waitFor(() =>
      expect(router.state.location.pathname).toMatch(/^\/architecture\/architectures\//),
    );
    expect(arch.lastBody).toMatchObject({
      company_id: ids.bankCompany,
      name: "SI Paiements",
      mission_id: missionIds.current,
    });
  });
});
