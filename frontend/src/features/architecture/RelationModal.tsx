import {
  Autocomplete,
  Button,
  Group,
  Modal,
  Select,
  Stack,
  Textarea,
  TextInput,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { useTranslation } from "react-i18next";

import { buildTree, flattenTree } from "../../components/tree";
import { useNotify } from "../directory/useNotify";
import {
  type Lifecycle,
  LIFECYCLES,
  PROTOCOLS,
  type Relation,
  type RelationType,
  RELATION_TYPES,
  type SyncMode,
  useDomains,
  useSaveRelation,
} from "./api";

/**
 * Creates or edits a relation between two domains of the same client (P8-10, RG-09).
 * `direction` decides which end is the current domain when creating.
 */
export function RelationModal({
  companyId,
  domainId,
  relation,
  direction = "outgoing",
  targetId,
  onClose,
}: {
  companyId: string;
  domainId: string;
  relation?: Relation;
  direction?: "outgoing" | "incoming";
  /** Pre-selected target, e.g. after dragging between two nodes of the graph. */
  targetId?: string;
  onClose: () => void;
}) {
  const { t } = useTranslation("architecture");
  const notify = useNotify();
  const save = useSaveRelation();
  const domains = useDomains({ company_id: companyId });
  const form = useForm({
    initialValues: {
      source_id: relation?.source.id ?? (direction === "outgoing" ? domainId : null),
      target_id: relation?.target.id ?? targetId ?? (direction === "incoming" ? domainId : null),
      type: (relation?.type ?? "CALLS") as RelationType,
      label: relation?.label ?? "",
      protocol: relation?.protocol ?? "",
      sync_mode: (relation?.sync_mode ?? null) as SyncMode | null,
      lifecycle: (relation?.lifecycle ?? "CURRENT") as Lifecycle,
      description: relation?.description ?? "",
    },
    validate: {
      source_id: (v) => (v ? null : t("validation.required")),
      target_id: (v, values) =>
        !v ? t("validation.required") : v === values.source_id ? t("relations.selfError") : null,
      label: (v, values) =>
        values.type === "CUSTOM" && !v.trim() ? t("relations.labelRequired") : null,
    },
  });
  // Full paths ("Paiements › Hub › API") tell homonyms apart.
  const options = flattenTree(
    buildTree(domains.data ?? [], (a, b) => a.name.localeCompare(b.name)),
  );
  const byId = new Map(options.map((node) => [node.item.id, node.item]));
  const path = (id: string): string => {
    const domain = byId.get(id);
    if (!domain) return "";
    return domain.parent_id && byId.has(domain.parent_id)
      ? `${path(domain.parent_id)} › ${domain.name}`
      : domain.name;
  };
  const data = options.map((node) => ({ value: node.item.id, label: path(node.item.id) }));

  return (
    <Modal
      opened
      onClose={onClose}
      title={relation ? t("relations.edit") : t("relations.create")}
      size="lg"
    >
      <form
        noValidate
        onSubmit={form.onSubmit((v) =>
          save.mutate(
            {
              id: relation?.id,
              source_id: v.source_id!,
              target_id: v.target_id!,
              type: v.type,
              label: v.label.trim() || null,
              protocol: v.protocol.trim() || null,
              sync_mode: v.sync_mode,
              lifecycle: v.lifecycle,
              description: v.description,
            },
            {
              onSuccess: () => {
                notify.saved();
                onClose();
              },
              onError: notify.error,
            },
          ),
        )}
      >
        <Stack>
          <Group grow align="flex-start">
            <Select
              label={t("relations.source")}
              searchable
              data={data}
              {...form.getInputProps("source_id")}
            />
            <Select
              label={t("relations.target")}
              searchable
              data={data}
              {...form.getInputProps("target_id")}
            />
          </Group>
          <Group grow align="flex-start">
            <Select
              label={t("relations.type")}
              allowDeselect={false}
              data={RELATION_TYPES.map((r) => ({ value: r, label: t(`relationTypes.${r}`) }))}
              {...form.getInputProps("type")}
            />
            <TextInput label={t("relations.label")} {...form.getInputProps("label")} />
          </Group>
          <Group grow align="flex-start">
            <Autocomplete
              label={t("relations.protocol")}
              data={PROTOCOLS}
              {...form.getInputProps("protocol")}
            />
            <Select
              label={t("relations.syncMode")}
              clearable
              data={(["SYNC", "ASYNC"] as const).map((m) => ({
                value: m,
                label: t(`syncModes.${m}`),
              }))}
              {...form.getInputProps("sync_mode")}
            />
            <Select
              label={t("fields.lifecycle")}
              allowDeselect={false}
              data={LIFECYCLES.map((l) => ({ value: l, label: t(`lifecycles.${l}`) }))}
              {...form.getInputProps("lifecycle")}
            />
          </Group>
          <Textarea
            label={t("fields.description")}
            autosize
            minRows={2}
            {...form.getInputProps("description")}
          />
          <Button type="submit" loading={save.isPending}>
            {t("save")}
          </Button>
        </Stack>
      </form>
    </Modal>
  );
}
