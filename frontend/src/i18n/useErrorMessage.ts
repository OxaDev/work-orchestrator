import { useTranslation } from "react-i18next";

import { ApiRequestError } from "../api/client";

/** Translates any thrown value into a user-facing message using backend error codes. */
export function useErrorMessage(): (error: unknown) => string {
  const { t, i18n } = useTranslation("errors");
  return (error: unknown) => {
    const code = error instanceof ApiRequestError ? error.body.code : "NETWORK_ERROR";
    const params: Record<string, unknown> =
      error instanceof ApiRequestError ? { ...error.body.params } : {};
    if (typeof params.retryAfterSeconds === "number") {
      params.minutes = Math.ceil(params.retryAfterSeconds / 60);
    }
    return i18n.exists(`errors:${code}`) ? t(code, params) : t("UNKNOWN", { code });
  };
}
