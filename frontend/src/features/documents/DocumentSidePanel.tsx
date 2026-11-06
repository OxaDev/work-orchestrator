import {
  ActionIcon,
  Anchor,
  Badge,
  Button,
  Group,
  Modal,
  ScrollArea,
  Stack,
  Tabs,
  Text,
} from "@mantine/core";
import { IconX } from "@tabler/icons-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { entityPath, type LinkType } from "../../components/markdown";
import { MarkdownView } from "../../components/MarkdownView";
import { useNotify } from "../directory/useNotify";
import {
  type DocumentDetail,
  type EntityRef,
  useAttachEntity,
  useBacklinks,
  useRestoreVersion,
  useVersion,
  useVersions,
} from "./api";
import { EntityPicker } from "./EntityPicker";

function EntityLink({ entity }: { entity: EntityRef }) {
  const { t } = useTranslation("documents");
  return (
    <Group gap={6} wrap="nowrap">
      <Badge size="xs" variant="light" color="gray">
        {t(`types.${entity.type}`)}
      </Badge>
      {entity.label ? (
        <Anchor
          component={Link}
          to={entityPath(entity.type as LinkType, entity.id, entity.label)}
          size="sm"
        >
          {entity.label}
        </Anchor>
      ) : (
        <Text size="sm" c="dimmed" td="line-through">
          {t("links.broken")}
        </Text>
      )}
    </Group>
  );
}

/** Lists the documents whose wikilinks point to an entity (P7-12). */
export function BacklinksList({ type, id }: { type: LinkType; id: string }) {
  const { t } = useTranslation("documents");
  const backlinks = useBacklinks(type, id);
  if (!backlinks.data?.length) {
    return (
      <Text size="sm" c="dimmed">
        {t("backlinks.empty")}
      </Text>
    );
  }
  return (
    <Stack gap={4}>
      {backlinks.data.map((backlink) => (
        <Anchor
          key={backlink.document.id}
          component={Link}
          to={`/documents/${backlink.document.id}`}
          size="sm"
        >
          {backlink.document.title}
        </Anchor>
      ))}
    </Stack>
  );
}

function Versions({
  document,
  onRestored,
}: {
  document: DocumentDetail;
  onRestored: (document: DocumentDetail) => void;
}) {
  const { t, i18n } = useTranslation("documents");
  const notify = useNotify();
  const versions = useVersions(document.id);
  const restore = useRestoreVersion(document.id);
  const [viewing, setViewing] = useState<number | null>(null);
  const version = useVersion(document.id, viewing);
  const format = new Intl.DateTimeFormat(i18n.language, { dateStyle: "short", timeStyle: "short" });
  return (
    <Stack gap={4}>
      {(versions.data ?? []).map((v) => (
        <Group key={v.number} justify="space-between" wrap="nowrap">
          <Anchor component="button" size="sm" onClick={() => setViewing(v.number)}>
            {t("versions.label", { number: v.number, date: format.format(new Date(v.created_at)) })}
          </Anchor>
          {v.number === versions.data?.[0]?.number && (
            <Badge size="xs" variant="light">
              {t("versions.current")}
            </Badge>
          )}
        </Group>
      ))}
      {viewing !== null && (
        <Modal
          opened
          onClose={() => setViewing(null)}
          title={t("versions.title", { number: viewing })}
          size="xl"
        >
          <Stack>
            <ScrollArea.Autosize mah="60vh">
              {version.data && <MarkdownView source={version.data.content_md} empty={t("empty")} />}
            </ScrollArea.Autosize>
            <Group justify="flex-end">
              <Button
                loading={restore.isPending}
                onClick={() =>
                  restore.mutate(viewing, {
                    onSuccess: (restored) => {
                      notify.saved();
                      setViewing(null);
                      onRestored(restored);
                    },
                    onError: notify.error,
                  })
                }
              >
                {t("versions.restore")}
              </Button>
            </Group>
          </Stack>
        </Modal>
      )}
    </Stack>
  );
}

/** Attachments to entities, outgoing links, backlinks and versions of a document. */
export function DocumentSidePanel({
  document,
  onRestored,
}: {
  document: DocumentDetail;
  onRestored: (document: DocumentDetail) => void;
}) {
  const { t } = useTranslation("documents");
  const notify = useNotify();
  const attach = useAttachEntity(document.id);
  return (
    <Tabs defaultValue="entities" keepMounted={false}>
      <Tabs.List>
        <Tabs.Tab value="entities">
          {t("entities.tab", { count: document.entities.length })}
        </Tabs.Tab>
        <Tabs.Tab value="links">{t("links.tab", { count: document.links.length })}</Tabs.Tab>
        <Tabs.Tab value="backlinks">{t("backlinks.tab")}</Tabs.Tab>
        <Tabs.Tab value="versions">{t("versions.tab", { count: document.version_count })}</Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel value="entities" pt="sm">
        <Stack gap="xs">
          <Text size="xs" c="dimmed">
            {t("entities.help")}
          </Text>
          {document.entities.map((entity) => (
            <Group key={`${entity.type}:${entity.id}`} justify="space-between" wrap="nowrap">
              <EntityLink entity={entity} />
              <ActionIcon
                variant="subtle"
                color="red"
                aria-label={t("entities.detach", { label: entity.label ?? "" })}
                onClick={() =>
                  attach.mutate(
                    { type: entity.type as LinkType, entityId: entity.id, attach: false },
                    { onError: notify.error },
                  )
                }
              >
                <IconX size={14} />
              </ActionIcon>
            </Group>
          ))}
          <EntityPicker
            label={t("entities.add")}
            placeholder={t("entities.search")}
            onPick={(entity) =>
              attach.mutate(
                { type: entity.type as LinkType, entityId: entity.id, attach: true },
                { onError: notify.error },
              )
            }
          />
        </Stack>
      </Tabs.Panel>
      <Tabs.Panel value="links" pt="sm">
        <Stack gap={4}>
          {document.links.length === 0 ? (
            <Text size="sm" c="dimmed">
              {t("links.empty")}
            </Text>
          ) : (
            document.links.map((entity) => (
              <EntityLink key={`${entity.type}:${entity.id}`} entity={entity} />
            ))
          )}
        </Stack>
      </Tabs.Panel>
      <Tabs.Panel value="backlinks" pt="sm">
        <BacklinksList type="document" id={document.id} />
      </Tabs.Panel>
      <Tabs.Panel value="versions" pt="sm">
        <Versions document={document} onRestored={onRestored} />
      </Tabs.Panel>
    </Tabs>
  );
}
