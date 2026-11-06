import { Anchor, Group, SegmentedControl, Stack, Text, Title } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router";

import type { SubjectScope } from "./api";
import { SubjectsPanel } from "./SubjectsPanel";

/** Mission subjects live on each mission page; this page holds the others. */
const PAGE_SCOPES: SubjectScope[] = ["INTERCONTRACT", "TRAINING", "PERSONAL"];

export function SubjectsPage() {
  const { t } = useTranslation("subjects");
  const [params, setParams] = useSearchParams();
  const requested = params.get("scope") as SubjectScope | null;
  const scope = requested && PAGE_SCOPES.includes(requested) ? requested : "INTERCONTRACT";

  return (
    <Stack>
      <Group justify="space-between">
        <Title order={2}>{t("title")}</Title>
        <Anchor component={Link} to="/agenda" size="sm">
          {t("backToAgenda")}
        </Anchor>
      </Group>
      <Text size="sm" c="dimmed">
        {t("missionHint")}
      </Text>
      <SegmentedControl
        aria-label={t("scopeLabel")}
        value={scope}
        onChange={(value) => setParams({ scope: value }, { replace: true })}
        data={PAGE_SCOPES.map((s) => ({ value: s, label: t(`scopes.${s}`) }))}
      />
      <SubjectsPanel key={scope} scope={scope} />
    </Stack>
  );
}
