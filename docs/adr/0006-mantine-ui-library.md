# ADR-0006: Mantine as UI component library

- **Status**: Accepted
- **Date**: 2026-11-05
- **Deciders**: Project owner
- **Source**: Q-M3
- **Tags**: frontend
- **Related**: ADR-0005 · **Supersedes**: none

## Context

The app needs many rich components: date pickers, calendars, forms, data tables, trees, modals, a `Ctrl+K` command palette, light/dark theming.

## Decision drivers

- Breadth of ready components (dates, spotlight, forms)
- Theming including dark mode
- Productivity for a single developer

## Considered options

1. **Mantine** — large component set incl. `@mantine/dates`, `@mantine/spotlight`, `@mantine/form`
2. **shadcn/ui + Tailwind** — full visual control, more assembly work
3. **MUI** — mature, heavier, Material look
4. **Ant Design** — complete, opinionated enterprise look

## Decision

We will use Mantine (core, dates, form, notifications, spotlight, modals) as the only component library. Custom components (agenda cells, graph nodes) are built on Mantine primitives and theme tokens. No second UI library.

## Rationale

shadcn/ui requires building date and spotlight components ourselves. MUI and Ant are heavier and harder to restyle.

## Consequences

- **Positive**: fast delivery, consistent theming, dark mode built in
- **Negative**: tied to Mantine's major-version upgrades
- **Follow-ups**: theme file `frontend/src/app/theme.ts` with agenda colour tokens

## Compliance

`package.json` contains no other UI component library.
