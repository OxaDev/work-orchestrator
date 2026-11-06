import { Anchor, Button, Grid, Group, Stack, Text, Title } from "@mantine/core";
import { IconPlus } from "@tabler/icons-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import type { LinkType } from "../../components/markdown";
import { useDocuments } from "./api";
import { BacklinksList } from "./DocumentSidePanel";
import { NewDocumentModal } from "./NewDocumentModal";

/** Documents attached to an entity and documents linking to it (Q-I1, Q-I5). */
export function EntityDocuments({ type, id }: { type: LinkType; id: string }) {
  const { t } = useTranslation("documents");
  const attached = useDocuments({ entity_type: type, entity_id: id });
  const [creating, setCreating] = useState(false);
  return (
    <Grid>
      <Grid.Col span={{ base: 12, md: 6 }}>
        <Stack gap="xs">
          <Group justify="space-between">
            <Title order={5}>{t("attached.title")}</Title>
            <Button
              size="xs"
              variant="light"
              leftSection={<IconPlus size={14} />}
              onClick={() => setCreating(true)}
            >
              {t("attached.create")}
            </Button>
          </Group>
          {attached.data?.length ? (
            attached.data.map((doc) => (
              <Anchor key={doc.id} component={Link} to={`/documents/${doc.id}`} size="sm">
                {doc.title}
              </Anchor>
            ))
          ) : (
            <Text size="sm" c="dimmed">
              {t("attached.empty")}
            </Text>
          )}
        </Stack>
      </Grid.Col>
      <Grid.Col span={{ base: 12, md: 6 }}>
        <Stack gap="xs">
          <Title order={5}>{t("backlinks.title")}</Title>
          <BacklinksList type={type} id={id} />
        </Stack>
      </Grid.Col>
      {creating && <NewDocumentModal attachTo={{ type, id }} onClose={() => setCreating(false)} />}
    </Grid>
  );
}
