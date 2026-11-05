import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";

import { useErrorMessage } from "../../i18n/useErrorMessage";

/** Mutation callbacks showing a translated success or error toast. */
export function useNotify() {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  return {
    saved: () => notifications.show({ color: "teal", message: t("common.saved") }),
    error: (error: unknown) => notifications.show({ color: "red", message: errorMessage(error) }),
  };
}
