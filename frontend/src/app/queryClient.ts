import { notifications } from "@mantine/notifications";
import { type DefaultOptions, QueryCache, QueryClient } from "@tanstack/react-query";
import { createElement } from "react";

import { ApiRequestError } from "../api/client";
import i18n from "../i18n";
import { QueryErrorMessage } from "./QueryErrorMessage";

declare module "@tanstack/react-query" {
  interface Register {
    /** `inlineError`: the page shows this query's error itself, no toast (P12-5). */
    queryMeta: { inlineError?: boolean };
  }
}

/** The translated message of a failed request, from its error code (ADR-0014). */
export function errorText(error: unknown): string {
  const code = error instanceof ApiRequestError ? error.body.code : "NETWORK_ERROR";
  const params = error instanceof ApiRequestError ? error.body.params : {};
  return i18n.exists(`errors:${code}`)
    ? i18n.t(`errors:${code}`, params)
    : i18n.t("errors:UNKNOWN", { code });
}

/**
 * Every failed read is reported once, translated, with a retry (P12-5); an expired session
 * (401) is handled by the sign-in redirect instead.
 */
export function createQueryClient(defaults: DefaultOptions = {}): QueryClient {
  const client: QueryClient = new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        if (query.meta?.inlineError) return;
        if (error instanceof ApiRequestError && error.status === 401) return;
        const id = `query-error-${query.queryHash}`;
        notifications.show({
          id,
          color: "red",
          autoClose: false,
          title: i18n.t("queryError.title"),
          message: createElement(QueryErrorMessage, {
            text: errorText(error),
            retryLabel: i18n.t("queryError.retry"),
            onRetry: () => {
              notifications.hide(id);
              void client.refetchQueries({ queryKey: query.queryKey });
            },
          }),
        });
      },
    }),
    defaultOptions: {
      ...defaults,
      queries: { staleTime: 30_000, refetchOnWindowFocus: false, ...defaults.queries },
    },
  });
  return client;
}
