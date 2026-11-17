import { Button, Modal, Select, Stack, Textarea, TextInput } from "@mantine/core";
import { useForm } from "@mantine/form";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";

import { CompanySelect } from "../directory/components";
import { useNotify } from "../directory/useNotify";
import {
  type ArchitectureDetail,
  type Lifecycle,
  LIFECYCLES,
  useCreateArchitecture,
  useUpdateArchitecture,
} from "./api";

/** Creates (for a client, optionally linked to a project, ADR-0042) or edits an architecture. */
export function ArchitectureModal({
  architecture,
  companyId = null,
  projectId,
  onClose,
}: {
  architecture?: ArchitectureDetail;
  companyId?: string | null;
  projectId?: string;
  onClose: () => void;
}) {
  const { t } = useTranslation("architecture");
  const notify = useNotify();
  const navigate = useNavigate();
  const create = useCreateArchitecture();
  const update = useUpdateArchitecture(architecture?.id ?? "");
  const form = useForm({
    initialValues: {
      company_id: architecture?.company.id ?? companyId,
      name: architecture?.name ?? "",
      lifecycle: (architecture?.lifecycle ?? "CURRENT") as Lifecycle,
      description: architecture?.description ?? "",
    },
    validate: {
      company_id: (v) => (v ? null : t("validation.required")),
      name: (v) => (v.trim() ? null : t("validation.required")),
    },
  });
  return (
    <Modal
      opened
      onClose={onClose}
      title={architecture ? t("architectures.edit") : t("architectures.create")}
      size="lg"
    >
      <form
        noValidate
        onSubmit={form.onSubmit((v) => {
          if (architecture) {
            update.mutate(
              { name: v.name.trim(), lifecycle: v.lifecycle, description: v.description },
              {
                onSuccess: () => {
                  notify.saved();
                  onClose();
                },
                onError: notify.error,
              },
            );
          } else {
            create.mutate(
              {
                company_id: v.company_id!,
                name: v.name.trim(),
                lifecycle: v.lifecycle,
                description: v.description,
                project_id: projectId ?? null,
              },
              {
                onSuccess: (created) => void navigate(`/architecture/architectures/${created.id}`),
                onError: notify.error,
              },
            );
          }
        })}
      >
        <Stack>
          <CompanySelect
            label={t("fields.client")}
            disabled={Boolean(architecture || companyId)}
            {...form.getInputProps("company_id")}
          />
          <TextInput label={t("fields.name")} data-autofocus {...form.getInputProps("name")} />
          <Select
            label={t("fields.lifecycle")}
            allowDeselect={false}
            data={LIFECYCLES.map((l) => ({ value: l, label: t(`lifecycles.${l}`) }))}
            {...form.getInputProps("lifecycle")}
          />
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
