import { Anchor, createTheme, type CSSVariablesResolver } from "@mantine/core";

/**
 * System fonts only: no font download at runtime (ADR-0028). Shades chosen for WCAG AA text
 * contrast (4.5:1, P12-3): indigo 8 for filled buttons and links on white.
 */
export const theme = createTheme({
  primaryColor: "indigo",
  primaryShade: { light: 8, dark: 8 },
  defaultRadius: "md",
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  fontFamilyMonospace: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  components: {
    // Links inside text are told apart by more than their colour (WCAG 1.4.1).
    Anchor: Anchor.extend({ defaultProps: { underline: "always" } }),
  },
});

const COLORS = [
  "dark",
  "gray",
  "red",
  "pink",
  "grape",
  "violet",
  "indigo",
  "blue",
  "cyan",
  "teal",
  "green",
  "lime",
  "yellow",
  "orange",
];
// Filled backgrounds under white text that stay below 4.5:1 at shade 8 or 9.
const WEAK_FILLED = ["cyan", "teal", "green", "lime", "yellow", "orange"];

/**
 * Light scheme (P12-3): secondary ("dimmed") text in gray 7 instead of gray 6 (3.3:1);
 * the text of light variants (alerts, light badges) and the fill of the weakest colours
 * darkened so that text keeps a 4.5:1 contrast.
 */
const weakFilled = Object.fromEntries(
  WEAK_FILLED.map((c) => [
    `--mantine-color-${c}-filled`,
    `color-mix(in srgb, var(--mantine-color-${c}-9), black 30%)`,
  ]),
);

export const cssVariablesResolver: CSSVariablesResolver = () => ({
  variables: {},
  light: {
    "--mantine-color-dimmed": "var(--mantine-color-gray-7)",
    "--mantine-color-placeholder": "var(--mantine-color-gray-7)",
    ...Object.fromEntries(
      COLORS.map((c) => [
        `--mantine-color-${c}-light-color`,
        `color-mix(in srgb, var(--mantine-color-${c}-9), black 30%)`,
      ]),
    ),
    ...weakFilled,
  },
  // Dark scheme: lighter secondary text, placeholders and links on dark surfaces.
  dark: {
    "--mantine-color-dimmed": "var(--mantine-color-dark-1)",
    "--mantine-color-placeholder": "var(--mantine-color-dark-1)",
    "--mantine-color-anchor": "var(--mantine-color-indigo-2)",
    ...weakFilled,
  },
});
