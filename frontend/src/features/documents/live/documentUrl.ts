const UUID = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
/** A pasted link to a document of this app: absolute URL or router path. */
const DOCUMENT_URL = new RegExp(`^(?:https?://\\S*?)?/documents/(${UUID})/?(?:[?#]\\S*)?$`);

/** The document id of a pasted app URL, or null (ADR-0043: it becomes a wikilink). */
export function documentIdFromUrl(text: string): string | null {
  return DOCUMENT_URL.exec(text.trim())?.[1]?.toLowerCase() ?? null;
}
