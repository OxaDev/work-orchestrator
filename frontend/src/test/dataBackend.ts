/** In-memory fake of search, archive, Markdown and CSV endpoints (P11) for component tests. */

import { http, HttpResponse } from "msw";

import type { CsvImportReport } from "../features/data/api";
import type { SearchResult } from "../features/search/api";

const error = (status: number, code: string, params: Record<string, unknown> = {}) =>
  HttpResponse.json({ code, detail: code, params }, { status });

export const data = {
  results: [] as SearchResult[],
  queries: [] as string[],
  exports: 0,
  imported: [] as string[],
  csvRuns: [] as boolean[],
  csvReport: null as unknown as CsvImportReport,
};

export function resetData(): void {
  data.results = [
    {
      type: "document",
      id: "doc-kafka",
      title: "Migration Kafka",
      snippet: "Les consommateurs suivent la charge",
      date: null,
      archived: false,
      rank: 0.9,
    },
    {
      type: "task",
      id: "task-1",
      title: "Revue Kafka",
      snippet: "",
      date: "2026-03-02",
      archived: true,
      rank: 0.5,
    },
  ];
  data.queries = [];
  data.exports = 0;
  data.imported = [];
  data.csvRuns = [];
  data.csvReport = {
    created: 2,
    skipped: 1,
    companies_created: 1,
    errors: [{ line: 4, code: "INVALID_EMAIL", field: "email_work" }],
  };
}

/** Tests put the file name in the content: names do not survive jsdom's FormData. */
async function uploadedName(request: Request): Promise<string> {
  const form = await request.formData();
  const file = form.get("file") as Blob | string | null;
  return typeof file === "string" || file === null ? "" : file.text();
}

export const dataHandlers = [
  http.get("*/api/v1/search", ({ request }) => {
    const q = new URL(request.url).searchParams.get("q") ?? "";
    data.queries.push(q);
    const needle = q.toLowerCase();
    return HttpResponse.json(data.results.filter((r) => r.title.toLowerCase().includes(needle)));
  }),
  http.get("*/api/v1/export", () => {
    data.exports += 1;
    return new HttpResponse("PK", {
      headers: {
        "content-type": "application/zip",
        "content-disposition": "attachment; filename*=UTF-8''work-orchestrator-2026-11-06.zip",
      },
    });
  }),
  http.post("*/api/v1/import", async ({ request }) => {
    const name = await uploadedName(request);
    data.imported.push(name);
    if (name === "full.zip") return error(409, "IMPORT_ACCOUNT_NOT_EMPTY", { table: "missions" });
    return HttpResponse.json({
      tables: { missions: 2, documents: 5, tasks: 0 },
      matched: 0,
      attachments: 3,
      missing_files: 1,
    });
  }),
  http.post("*/api/v1/documents/import-markdown", async ({ request }) => {
    const name = await uploadedName(request);
    data.imported.push(name);
    if (name === "notes.txt") return error(400, "IMPORT_INVALID_ARCHIVE", { reason: "zip" });
    return HttpResponse.json({
      documents: 12,
      folders: 2,
      attachments: 4,
      unresolved_links: 1,
      skipped_files: 0,
      root_ids: [],
    });
  }),
  http.get("*/api/v1/contacts/export.csv", () => {
    data.exports += 1;
    return new HttpResponse("﻿first_name;last_name\r\n", {
      headers: { "content-type": "text/csv; charset=utf-8" },
    });
  }),
  http.post("*/api/v1/contacts/import", ({ request }) => {
    const dryRun = new URL(request.url).searchParams.get("dry_run") === "true";
    data.csvRuns.push(dryRun);
    return HttpResponse.json(data.csvReport);
  }),
];
