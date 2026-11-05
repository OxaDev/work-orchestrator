import { createTheme } from "@mantine/core";

/** System fonts only: no font download at runtime (ADR-0028). */
export const theme = createTheme({
  primaryColor: "indigo",
  defaultRadius: "md",
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  fontFamilyMonospace: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
});
