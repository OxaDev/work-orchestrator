import { Alert, Button, Group, Modal, Select, Stack, Stepper, TextInput } from "@mantine/core";
import { useForm } from "@mantine/form";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";

import { useErrorMessage } from "../../i18n/useErrorMessage";
import { useCurrentUser } from "../auth/useAuth";
import { useCompanies } from "../directory/api";
import { CompanySelect } from "../directory/components";
import { MISSION_STATUSES, type MissionStatus, useCreateMission } from "./api";

interface Values {
  client_id: string | null;
  employer_company_id: string | null;
  job_title: string;
  title: string;
  start_date: string;
  planned_end_date: string;
  status: MissionStatus;
}

/** Step-by-step creation (P3-6): client and ESN, then position, then dates. */
export function CreateMissionModal({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  const { t } = useTranslation("missions");
  const errorMessage = useErrorMessage();
  const navigate = useNavigate();
  const { data: user } = useCurrentUser();
  const companies = useCompanies({ limit: 200 });
  const create = useCreateMission();
  const [step, setStep] = useState(0);
  const required = (v: string | null) => (v ? null : t("validation.required"));
  const form = useForm<Values>({
    initialValues: {
      client_id: null,
      employer_company_id: user?.employer_company_id ?? null,
      job_title: "",
      title: "",
      start_date: "",
      planned_end_date: "",
      status: "ACTIVE",
    },
    validate: (values) => {
      if (step === 0) {
        return {
          client_id: required(values.client_id),
          employer_company_id: required(values.employer_company_id),
        };
      }
      if (step === 1) return { job_title: required(values.job_title.trim()) };
      return {
        start_date: required(values.start_date),
        planned_end_date:
          values.planned_end_date &&
          values.start_date &&
          values.planned_end_date < values.start_date
            ? t("validation.endBeforeStart")
            : null,
      };
    },
  });
  const clientName = companies.data?.items.find((c) => c.id === form.values.client_id)?.name ?? "";
  const close = () => {
    form.reset();
    create.reset();
    setStep(0);
    onClose();
  };
  const next = () => {
    if (form.validate().hasErrors) return;
    if (step === 1 && !form.values.title.trim()) {
      // Suggest an internal name from client and position.
      form.setFieldValue("title", `${clientName} — ${form.values.job_title.trim()}`);
    }
    setStep((s) => s + 1);
  };
  const submit = () => {
    if (form.validate().hasErrors) return;
    const v = form.values;
    create.mutate(
      {
        client_id: v.client_id!,
        employer_company_id: v.employer_company_id,
        job_title: v.job_title.trim(),
        title: v.title.trim() || `${clientName} — ${v.job_title.trim()}`,
        start_date: v.start_date,
        planned_end_date: v.planned_end_date || null,
        status: v.status,
        objectives: "",
        description: "",
        review: "",
      },
      {
        onSuccess: (mission) => {
          close();
          void navigate(`/missions/${mission.id}`);
        },
      },
    );
  };

  return (
    <Modal opened={opened} onClose={close} title={t("create")} size="lg">
      <Stack>
        {create.isError && (
          <Alert color="red" role="alert">
            {errorMessage(create.error)}
          </Alert>
        )}
        <Stepper active={step} size="sm">
          <Stepper.Step label={t("steps.client")}>
            <Stack mt="md">
              <CompanySelect label={t("fields.client")} {...form.getInputProps("client_id")} />
              <CompanySelect
                esnOnly
                label={t("fields.employer")}
                description={t("fields.employerHelp")}
                {...form.getInputProps("employer_company_id")}
              />
            </Stack>
          </Stepper.Step>
          <Stepper.Step label={t("steps.position")}>
            <Stack mt="md">
              <TextInput label={t("fields.jobTitle")} {...form.getInputProps("job_title")} />
              <TextInput
                label={t("fields.title")}
                description={t("fields.titleHelp")}
                {...form.getInputProps("title")}
              />
            </Stack>
          </Stepper.Step>
          <Stepper.Step label={t("steps.dates")}>
            <Stack mt="md">
              <TextInput
                type="date"
                label={t("fields.startDate")}
                {...form.getInputProps("start_date")}
              />
              <TextInput
                type="date"
                label={t("fields.plannedEndDate")}
                {...form.getInputProps("planned_end_date")}
              />
              <Select
                label={t("fields.status")}
                allowDeselect={false}
                data={MISSION_STATUSES.map((s) => ({ value: s, label: t(`status.${s}`) }))}
                {...form.getInputProps("status")}
              />
            </Stack>
          </Stepper.Step>
        </Stepper>
        <Group justify="space-between">
          <Button variant="default" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
            {t("steps.back")}
          </Button>
          {step < 2 ? (
            <Button onClick={next}>{t("steps.next")}</Button>
          ) : (
            <Button onClick={submit} loading={create.isPending}>
              {t("create")}
            </Button>
          )}
        </Group>
      </Stack>
    </Modal>
  );
}
