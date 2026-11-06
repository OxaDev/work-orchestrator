import { Pagination, type PaginationProps } from "@mantine/core";
import { useTranslation } from "react-i18next";

/** Mantine pagination whose arrow buttons have a name for screen readers (P12-3). */
export function AppPagination(props: PaginationProps) {
  const { t } = useTranslation();
  return (
    <Pagination
      size="sm"
      getControlProps={(control) => ({ "aria-label": t(`pagination.${control}`) })}
      getItemProps={(page) => ({ "aria-label": t("pagination.page", { page }) })}
      {...props}
    />
  );
}
