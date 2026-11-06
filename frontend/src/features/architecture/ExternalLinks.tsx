import {
  ActionIcon,
  Anchor,
  Badge,
  Button,
  Group,
  Select,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";

import { useNotify } from "../directory/useNotify";
import {
  type ExternalLink,
  type ExternalLinkKind,
  type LinkedEntity,
  LINK_KINDS,
  useDeleteExternalLink,
  useSaveExternalLink,
} from "./api";

const isUrl = (value: string) => {
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
};

/** Repositories, ticket boards, environments... of a domain or mission (Q-H9). */
export function ExternalLinks({
  entityType,
  entityId,
  links,
}: {
  entityType: LinkedEntity;
  entityId: string;
  links: readonly ExternalLink[];
}) {
  const { t } = useTranslation("architecture");
  const notify = useNotify();
  const save = useSaveExternalLink();
  const remove = useDeleteExternalLink();
  const form = useForm({
    initialValues: { kind: "REPOSITORY" as ExternalLinkKind, label: "", url: "" },
    validate: {
      label: (v) => (v.trim() ? null : t("validation.required")),
      url: (v) => (isUrl(v.trim()) ? null : t("links.urlInvalid")),
    },
  });
  return (
    <Stack gap="xs">
      {links.length === 0 && (
        <Text size="sm" c="dimmed">
          {t("links.empty")}
        </Text>
      )}
      {links.map((link) => (
        <Group key={link.id} justify="space-between" wrap="nowrap">
          <Group gap="xs" wrap="nowrap">
            <Badge size="xs" variant="light" color="gray">
              {t(`linkKinds.${link.kind}`)}
            </Badge>
            <Anchor href={link.url} target="_blank" rel="noreferrer" size="sm">
              {link.label}
            </Anchor>
          </Group>
          <ActionIcon
            variant="subtle"
            color="red"
            aria-label={t("links.deleteOf", { label: link.label })}
            onClick={() => remove.mutate(link.id, { onError: notify.error })}
          >
            <IconTrash size={14} />
          </ActionIcon>
        </Group>
      ))}
      <form
        noValidate
        onSubmit={form.onSubmit((v) =>
          save.mutate(
            {
              entity_type: entityType,
              entity_id: entityId,
              kind: v.kind,
              label: v.label.trim(),
              url: v.url.trim(),
            },
            { onSuccess: () => form.reset(), onError: notify.error },
          ),
        )}
      >
        <Group align="flex-start" gap="xs">
          <Select
            aria-label={t("links.kind")}
            w={150}
            allowDeselect={false}
            data={LINK_KINDS.map((k) => ({ value: k, label: t(`linkKinds.${k}`) }))}
            {...form.getInputProps("kind")}
          />
          <TextInput
            aria-label={t("links.label")}
            placeholder={t("links.label")}
            {...form.getInputProps("label")}
          />
          <TextInput
            aria-label={t("links.url")}
            placeholder="https://"
            style={{ flex: 1 }}
            {...form.getInputProps("url")}
          />
          <Button
            type="submit"
            variant="light"
            leftSection={<IconPlus size={14} />}
            loading={save.isPending}
          >
            {t("links.add")}
          </Button>
        </Group>
      </form>
    </Stack>
  );
}
