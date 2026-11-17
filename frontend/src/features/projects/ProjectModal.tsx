import { Button, Modal, Stack, Textarea, TextInput } from "@mantine/core";
import { useForm } from "@mantine/form";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";

import { useNotify } from "../directory/useNotify";
import { type ProjectSummary, projectPath, useCreateProject, useUpdateProject } from "./api";
import { useWorkContext } from "./scope";

/** Creates a project in a mission (and makes it the current context) or edits one. */
export function ProjectModal({
  missionId,
  project,
  onClose,
}: {
  missionId: string;
  project?: ProjectSummary;
  onClose: () => void;
}) {
  const { t } = useTranslation("projects");
  const notify = useNotify();
  const navigate = useNavigate();
  const { setScope } = useWorkContext();
  const create = useCreateProject();
  const update = useUpdateProject(project?.id ?? "");
  const form = useForm({
    initialValues: { name: project?.name ?? "", description: project?.description ?? "" },
    validate: { name: (v) => (v.trim() ? null : t("validation.required")) },
  });
  return (
    <Modal opened onClose={onClose} title={project ? t("edit") : t("create")}>
      <form
        noValidate
        onSubmit={form.onSubmit((v) => {
          const body = { name: v.name.trim(), description: v.description };
          if (project) {
            update.mutate(body, {
              onSuccess: () => {
                notify.saved();
                onClose();
              },
              onError: notify.error,
            });
          } else {
            create.mutate(
              { mission_id: missionId, ...body },
              {
                onSuccess: (created) => {
                  setScope({ missionId, projectId: created.id });
                  void navigate(projectPath(created));
                },
                onError: notify.error,
              },
            );
          }
        })}
      >
        <Stack>
          <TextInput label={t("fields.name")} data-autofocus {...form.getInputProps("name")} />
          <Textarea
            label={t("fields.description")}
            autosize
            minRows={3}
            {...form.getInputProps("description")}
          />
          <Button type="submit" loading={create.isPending || update.isPending}>
            {project ? t("save") : t("create")}
          </Button>
        </Stack>
      </form>
    </Modal>
  );
}
