import {
  Anchor,
  Button,
  Group,
  Loader,
  Stack,
  Switch,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { IconPlus, IconSearch, IconUpload } from "@tabler/icons-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { useCreateParam } from "../../app/useCreateParam";
import { TreeList } from "../../components/TreeList";
import { useDocuments } from "./api";
import { MarkdownImportModal } from "./MarkdownImportModal";
import { NewDocumentModal } from "./NewDocumentModal";

/** /documents — the page tree, search, creation (P7-12). */
export function DocumentsPage() {
  const { t } = useTranslation("documents");
  const [search, setSearch] = useState("");
  const [debounced] = useDebouncedValue(search, 250);
  const [archived, setArchived] = useState(false);
  const [creating, setCreating] = useState<{ parentId: string | null } | null>(null);
  const [requested, clearRequest] = useCreateParam();
  const [importing, setImporting] = useState(false);
  const documents = useDocuments({ q: debounced || undefined, include_archived: archived });
  const items = documents.data ?? [];

  return (
    <Stack>
      <Group justify="space-between">
        <Title order={2}>{t("title")}</Title>
        <Group gap="xs">
          <Anchor component={Link} to="/documents/graph" size="sm">
            {t("graph.title")}
          </Anchor>
          <Anchor component={Link} to="/documents/templates" size="sm">
            {t("templates.title")}
          </Anchor>
          <Button
            variant="default"
            leftSection={<IconUpload size={16} />}
            onClick={() => setImporting(true)}
          >
            {t("data:markdown.title")}
          </Button>
          <Button
            leftSection={<IconPlus size={16} />}
            onClick={() => setCreating({ parentId: null })}
          >
            {t("create")}
          </Button>
        </Group>
      </Group>
      <Group>
        <TextInput
          aria-label={t("search")}
          placeholder={t("search")}
          leftSection={<IconSearch size={16} />}
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
          w={320}
        />
        <Switch
          size="xs"
          label={t("showArchived")}
          checked={archived}
          onChange={(e) => setArchived(e.currentTarget.checked)}
        />
      </Group>
      {documents.isPending ? (
        <Loader size="sm" />
      ) : (
        <TreeList
          aria-label={t("tree")}
          items={items}
          compare={(a, b) => a.title.localeCompare(b.title)}
          empty={
            <Stack align="flex-start" gap="xs">
              <Text size="sm" c="dimmed">
                {debounced ? t("nothingFound") : t("emptyList")}
              </Text>
              {!debounced && (
                <Group gap="xs">
                  <Button
                    variant="light"
                    leftSection={<IconPlus size={16} />}
                    onClick={() => setCreating({ parentId: null })}
                  >
                    {t("create")}
                  </Button>
                  <Button
                    variant="default"
                    leftSection={<IconUpload size={16} />}
                    onClick={() => setImporting(true)}
                  >
                    {t("data:markdown.title")}
                  </Button>
                </Group>
              )}
            </Stack>
          }
          label={(doc) => (
            <Group gap={6}>
              <Anchor
                component={Link}
                to={`/documents/${doc.id}`}
                size="sm"
                td={doc.archived_at ? "line-through" : undefined}
              >
                {doc.title}
              </Anchor>
              {doc.has_draft && (
                <Text size="xs" c="orange">
                  {t("hasDraft")}
                </Text>
              )}
            </Group>
          )}
          actions={(doc) => (
            <Button
              size="compact-xs"
              variant="subtle"
              aria-label={t("createChild", { title: doc.title })}
              onClick={() => setCreating({ parentId: doc.id })}
            >
              <IconPlus size={14} />
            </Button>
          )}
        />
      )}
      {importing && <MarkdownImportModal onClose={() => setImporting(false)} />}
      {(creating ?? requested) && (
        <NewDocumentModal
          parentId={creating?.parentId ?? null}
          onClose={() => {
            setCreating(null);
            clearRequest();
          }}
        />
      )}
    </Stack>
  );
}
