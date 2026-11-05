import {
  Button,
  Group,
  NumberInput,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  Textarea,
  TextInput,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { MarkdownView } from "../../components/MarkdownView";
import { CompanySelect } from "../directory/components";
import {
  MISSION_STATUSES,
  type MissionDetail,
  type MissionStatus,
  type MissionUpdate,
} from "./api";
import { ColorPicker } from "./components";

interface Values {
  title: string;
  job_title: string;
  client_id: string | null;
  employer_company_id: string | null;
  start_date: string;
  planned_end_date: string;
  actual_end_date: string;
  end_date_change_note: string;
  status: MissionStatus;
  color: string;
  location: string;
  remote_policy: string;
  daily_rate: number | string;
  objectives: string;
  description: string;
  review: string;
}

function MarkdownField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const { t } = useTranslation("missions");
  return (
    <SimpleGrid cols={{ base: 1, md: 2 }}>
      <Textarea
        label={label}
        description={t("fields.markdownHint")}
        autosize
        minRows={4}
        value={value}
        onChange={(e) => onChange(e.currentTarget.value)}
      />
      <Stack gap={4}>
        <Text size="sm" fw={500}>
          {t("preview")}
        </Text>
        <MarkdownView source={value} empty={t("noContent")} />
      </Stack>
    </SimpleGrid>
  );
}

export function MissionForm({
  mission,
  submitting,
  onSubmit,
}: {
  mission: MissionDetail;
  submitting: boolean;
  onSubmit: (changes: MissionUpdate) => void;
}) {
  const { t } = useTranslation("missions");
  const [showMoney, setShowMoney] = useState(false);
  const required = (v: string | null) => (v ? null : t("validation.required"));
  const form = useForm<Values>({
    initialValues: {
      title: mission.title,
      job_title: mission.job_title,
      client_id: mission.client.id,
      employer_company_id: mission.employer.id,
      start_date: mission.start_date,
      planned_end_date: mission.planned_end_date ?? "",
      actual_end_date: mission.actual_end_date ?? "",
      end_date_change_note: "",
      status: mission.status,
      color: mission.color,
      location: mission.location ?? "",
      remote_policy: mission.remote_policy ?? "",
      daily_rate: mission.daily_rate ?? "",
      objectives: mission.objectives,
      description: mission.description,
      review: mission.review,
    },
    validate: {
      title: (v) => required(v.trim()),
      job_title: (v) => required(v.trim()),
      client_id: required,
      employer_company_id: required,
      start_date: required,
      planned_end_date: (v, values) =>
        v && v < values.start_date ? t("validation.endBeforeStart") : null,
      actual_end_date: (v, values) =>
        v && v < values.start_date ? t("validation.endBeforeStart") : null,
    },
  });
  const endDateChanged = (form.values.planned_end_date || null) !== mission.planned_end_date;

  return (
    <form
      noValidate
      onSubmit={form.onSubmit((v) =>
        onSubmit({
          title: v.title.trim(),
          job_title: v.job_title.trim(),
          client_id: v.client_id,
          employer_company_id: v.employer_company_id,
          start_date: v.start_date,
          planned_end_date: v.planned_end_date || null,
          actual_end_date: v.actual_end_date || null,
          end_date_change_note: endDateChanged ? v.end_date_change_note.trim() || null : null,
          status: v.status,
          color: v.color as MissionUpdate["color"],
          location: v.location.trim() || null,
          remote_policy: v.remote_policy.trim() || null,
          daily_rate: v.daily_rate === "" ? null : String(v.daily_rate),
          objectives: v.objectives,
          description: v.description,
          review: v.review,
        }),
      )}
    >
      <Stack>
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <TextInput label={t("fields.title")} {...form.getInputProps("title")} />
          <TextInput label={t("fields.jobTitle")} {...form.getInputProps("job_title")} />
          <CompanySelect label={t("fields.client")} {...form.getInputProps("client_id")} />
          <CompanySelect
            esnOnly
            label={t("fields.employer")}
            {...form.getInputProps("employer_company_id")}
          />
          <TextInput
            type="date"
            label={t("fields.startDate")}
            {...form.getInputProps("start_date")}
          />
          <Select
            label={t("fields.status")}
            allowDeselect={false}
            data={MISSION_STATUSES.map((s) => ({ value: s, label: t(`status.${s}`) }))}
            {...form.getInputProps("status")}
          />
          <TextInput
            type="date"
            label={t("fields.plannedEndDate")}
            {...form.getInputProps("planned_end_date")}
          />
          <TextInput
            type="date"
            label={t("fields.actualEndDate")}
            {...form.getInputProps("actual_end_date")}
          />
        </SimpleGrid>
        {endDateChanged && mission.planned_end_date && (
          <TextInput
            label={t("fields.endDateChangeNote")}
            placeholder={t("fields.endDateChangePlaceholder")}
            {...form.getInputProps("end_date_change_note")}
          />
        )}
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <TextInput label={t("fields.location")} {...form.getInputProps("location")} />
          <TextInput label={t("fields.remotePolicy")} {...form.getInputProps("remote_policy")} />
        </SimpleGrid>
        <div>
          <Text size="sm" fw={500} mb={4}>
            {t("fields.color")}
          </Text>
          <ColorPicker
            label={t("fields.color")}
            value={form.values.color}
            onChange={(c) => form.setFieldValue("color", c)}
          />
        </div>
        <Switch
          label={t("fields.showFinancial")}
          checked={showMoney}
          onChange={(e) => setShowMoney(e.currentTarget.checked)}
        />
        {showMoney && (
          <NumberInput
            label={t("fields.dailyRate")}
            min={0}
            decimalScale={2}
            suffix=" €"
            maw={220}
            {...form.getInputProps("daily_rate")}
          />
        )}
        <MarkdownField
          label={t("fields.objectives")}
          value={form.values.objectives}
          onChange={(v) => form.setFieldValue("objectives", v)}
        />
        <MarkdownField
          label={t("fields.description")}
          value={form.values.description}
          onChange={(v) => form.setFieldValue("description", v)}
        />
        <MarkdownField
          label={t("fields.review")}
          value={form.values.review}
          onChange={(v) => form.setFieldValue("review", v)}
        />
        <Group>
          <Button type="submit" loading={submitting}>
            {t("save")}
          </Button>
        </Group>
      </Stack>
    </form>
  );
}
