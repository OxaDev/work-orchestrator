import { useMutation, useQueryClient } from "@tanstack/react-query";

import { api, unwrap } from "../../api/client";
import type { components } from "../../api/schema";

export type ArchiveReport = components["schemas"]["ImportReportRead"];
export type MarkdownImportReport = components["schemas"]["MarkdownImportReportRead"];
export type CsvImportReport = components["schemas"]["CsvImportReportRead"];

/** Saves a blob under `name` through a temporary link: nothing leaves the browser. */
export function saveBlob(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function filenameOf(response: Response, fallback: string): string {
  const header = response.headers.get("content-disposition") ?? "";
  const match = /filename\*=UTF-8''([^;]+)|filename="([^"]+)"/.exec(header);
  const name = match?.[1] ?? match?.[2];
  return name ? decodeURIComponent(name) : fallback;
}

/** The OpenAPI body type of an upload is a string; the browser sends a File (multipart). */
function form(file: File, fields: Record<string, string | undefined> = {}) {
  return {
    body: { file: file as unknown as string },
    bodySerializer: () => {
      const data = new FormData();
      data.append("file", file, file.name);
      for (const [key, value] of Object.entries(fields)) {
        if (value) data.append(key, value);
      }
      return data;
    },
  };
}

/** `GET /export`: everything the user owns, as a zip (P11-4, ADR-0040). */
export async function downloadArchive(): Promise<void> {
  const { data, response } = await api.GET("/api/v1/export", { parseAs: "blob" });
  const blob = await unwrap(Promise.resolve({ data, response }));
  saveBlob(filenameOf(response, "work-orchestrator.zip"), blob as Blob);
}

export async function downloadContactsCsv(): Promise<void> {
  const { data, response } = await api.GET("/api/v1/contacts/export.csv", { parseAs: "blob" });
  const blob = await unwrap(Promise.resolve({ data, response }));
  saveBlob(filenameOf(response, "contacts.csv"), blob as Blob);
}

/** Every cached query may change after an import: refetch them all. */
export function useImportArchive() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => unwrap(api.POST("/api/v1/import", form(file))),
    onSuccess: () => queryClient.invalidateQueries(),
  });
}

export function useImportMarkdown() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      file,
      parentId,
      projectId,
    }: {
      file: File;
      parentId?: string;
      /** Top-level pages go into this project (ADR-0042). */
      projectId?: string;
    }) =>
      unwrap(
        api.POST(
          "/api/v1/documents/import-markdown",
          form(file, { parent_id: parentId, project_id: projectId }),
        ),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["documents"] }),
  });
}

export function useImportContacts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ file, dryRun }: { file: File; dryRun: boolean }) =>
      unwrap(
        api.POST("/api/v1/contacts/import", {
          params: { query: { dry_run: dryRun } },
          ...form(file),
        }),
      ),
    onSuccess: (_report, { dryRun }) => {
      if (!dryRun) {
        void queryClient.invalidateQueries({ queryKey: ["contacts"] });
        void queryClient.invalidateQueries({ queryKey: ["companies"] });
      }
    },
  });
}
