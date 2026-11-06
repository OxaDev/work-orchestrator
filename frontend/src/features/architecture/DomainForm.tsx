import { Button, Group, Modal, Select, Stack, Textarea, TextInput } from "@mantine/core";
import { useForm } from "@mantine/form";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";

import { buildTree, flattenTree, subtreeIds } from "../../components/tree";
import { OrgUnitSelect } from "../directory/components";
import { useNotify } from "../directory/useNotify";
import { ContactSearchSelect } from "../missions/components";
import {
  type Criticality,
  CRITICALITIES,
  type DomainDetail,
  type DomainKind,
  DOMAIN_KINDS,
  type Lifecycle,
  LIFECYCLES,
  useCreateDomain,
  useDomains,
  useUpdateDomain,
} from "./api";

/** Creates (under a parent, in an architecture) or edits a domain (P8-2). */
export function DomainForm({
  companyId,
  domain,
  parentId = null,
  architectureId,
  onCreated,
  onClose,
}: {
  companyId: string;
  domain?: DomainDetail;
  parentId?: string | null;
  architectureId?: string;
  /** Called instead of opening the new domain's sheet. */
  onCreated?: (id: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation("architecture");
  const notify = useNotify();
  const navigate = useNavigate();
  const create = useCreateDomain();
  const update = useUpdateDomain(domain?.id ?? "");
  const domains = useDomains({ company_id: companyId });
  const form = useForm({
    initialValues: {
      name: domain?.name ?? "",
      kind: (domain?.kind ?? "APPLICATION") as DomainKind,
      parent_id: domain ? domain.parent_id : parentId,
      lifecycle: (domain?.lifecycle ?? "CURRENT") as Lifecycle,
      criticality: (domain?.criticality ?? null) as Criticality | null,
      owner_org_unit_id: domain?.owner_org_unit?.id ?? null,
      referent_contact_id: domain?.referent_contact?.id ?? null,
      description: domain?.description ?? "",
    },
    validate: { name: (v) => (v.trim() ? null : t("validation.required")) },
  });
  const excluded = domain ? subtreeIds(domains.data ?? [], domain.id) : new Set<string>();
  const parents = flattenTree(buildTree(domains.data ?? [], (a, b) => a.name.localeCompare(b.name)))
    .filter((node) => !excluded.has(node.item.id))
    .map((node) => ({ value: node.item.id, label: `${"  ".repeat(node.depth)}${node.item.name}` }));

  return (
    <Modal
      opened
      onClose={onClose}
      title={domain ? t("domains.edit") : t("domains.create")}
      size="lg"
    >
      <form
        noValidate
        onSubmit={form.onSubmit((v) => {
          const values = { ...v, name: v.name.trim() };
          if (domain) {
            update.mutate(values, {
              onSuccess: () => {
                notify.saved();
                onClose();
              },
              onError: notify.error,
            });
          } else {
            create.mutate(
              { ...values, company_id: companyId, architecture_id: architectureId ?? null },
              {
                onSuccess: (created) =>
                  onCreated
                    ? onCreated(created.id)
                    : void navigate(`/architecture/domains/${created.id}`),
                onError: notify.error,
              },
            );
          }
        })}
      >
        <Stack>
          <Group grow align="flex-start">
            <TextInput label={t("fields.name")} data-autofocus {...form.getInputProps("name")} />
            <Select
              label={t("fields.kind")}
              allowDeselect={false}
              data={DOMAIN_KINDS.map((k) => ({ value: k, label: t(`kinds.${k}`) }))}
              {...form.getInputProps("kind")}
            />
          </Group>
          <Select
            label={t("fields.parent")}
            placeholder={t("fields.noParent")}
            clearable
            searchable
            data={parents}
            {...form.getInputProps("parent_id")}
          />
          <Group grow align="flex-start">
            <Select
              label={t("fields.lifecycle")}
              allowDeselect={false}
              data={LIFECYCLES.map((l) => ({ value: l, label: t(`lifecycles.${l}`) }))}
              {...form.getInputProps("lifecycle")}
            />
            <Select
              label={t("fields.criticality")}
              clearable
              data={CRITICALITIES.map((c) => ({ value: c, label: t(`criticalities.${c}`) }))}
              {...form.getInputProps("criticality")}
            />
          </Group>
          <Group grow align="flex-start">
            <OrgUnitSelect
              label={t("fields.owner")}
              companyId={companyId}
              clearable
              {...form.getInputProps("owner_org_unit_id")}
            />
            <ContactSearchSelect
              label={t("fields.referent")}
              placeholder={domain?.referent_contact?.name}
              {...form.getInputProps("referent_contact_id")}
            />
          </Group>
          <Textarea
            label={t("fields.description")}
            autosize
            minRows={3}
            {...form.getInputProps("description")}
          />
          <Button type="submit" loading={create.isPending || update.isPending}>
            {t("save")}
          </Button>
        </Stack>
      </form>
    </Modal>
  );
}
