/**
 * Mermaid rendering (ADR-0025): bundled, loaded on first use, `strict` security level so labels
 * cannot inject markup. Shared by the preview and the SVG export (ADR-0036).
 */

let counter = 0;

export async function renderMermaid(code: string, dark = false): Promise<string> {
  const mermaid = (await import("mermaid")).default;
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme: dark ? "dark" : "default",
  });
  counter += 1;
  const { svg } = await mermaid.render(`wo-mermaid-${counter}`, code);
  return svg;
}
