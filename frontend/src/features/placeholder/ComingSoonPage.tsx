import { Stack, Text, Title } from "@mantine/core";
import { useTranslation } from "react-i18next";

interface ComingSoonPageProps {
  titleKey: string;
  phase: string;
}

/** Temporary page for sections delivered by later roadmap phases. */
export function ComingSoonPage({ titleKey, phase }: ComingSoonPageProps) {
  const { t } = useTranslation();
  return (
    <Stack>
      <Title order={2}>{t(titleKey)}</Title>
      <Text c="dimmed">{t("comingSoon.body", { phase })}</Text>
    </Stack>
  );
}
