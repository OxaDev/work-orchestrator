import { Button, Group, SegmentedControl, Select, Stack, Text, TextInput } from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";

import type { UserRead } from "../../api/client";
import { useErrorMessage } from "../../i18n/useErrorMessage";
import { useCurrentUser, useUpdateProfile } from "../auth/useAuth";
import { CompanySelect } from "../directory/components";

const HOLIDAY_REGIONS = ["METRO", "57", "971", "972", "973", "974", "976"] as const;

function ProfileForm({ user }: { user: UserRead }) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const update = useUpdateProfile();
  const form = useForm({
    initialValues: {
      display_name: user.display_name,
      locale: user.locale,
      theme: user.theme,
      employer_company_id: user.employer_company_id ?? null,
      holiday_subdivision: user.holiday_subdivision ?? null,
    },
    validate: { display_name: (v) => (v.trim() ? null : t("settings.profile.nameRequired")) },
  });

  return (
    <form
      noValidate
      onSubmit={form.onSubmit((values) =>
        update.mutate(
          { ...values, display_name: values.display_name.trim() },
          {
            onSuccess: () => notifications.show({ color: "teal", message: t("common.saved") }),
            onError: (error) => notifications.show({ color: "red", message: errorMessage(error) }),
          },
        ),
      )}
    >
      <Stack maw={420}>
        <TextInput label={t("auth.email")} value={user.email} disabled />
        <TextInput
          label={t("settings.profile.displayName")}
          {...form.getInputProps("display_name")}
        />
        <CompanySelect
          esnOnly
          label={t("settings.profile.employer")}
          description={t("settings.profile.employerHelp")}
          {...form.getInputProps("employer_company_id")}
        />
        <Select
          label={t("settings.profile.holidayRegion")}
          description={t("settings.profile.holidayRegionHelp")}
          data={HOLIDAY_REGIONS.map((code) => ({
            value: code,
            label: t(`settings.profile.regions.${code}`),
          }))}
          value={form.values.holiday_subdivision ?? "METRO"}
          onChange={(v) =>
            form.setFieldValue(
              "holiday_subdivision",
              !v || v === "METRO" ? null : (v as NonNullable<UserRead["holiday_subdivision"]>),
            )
          }
          allowDeselect={false}
        />
        <Select
          label={t("header.language")}
          allowDeselect={false}
          data={[
            { value: "fr", label: "Français" },
            { value: "en", label: "English" },
          ]}
          {...form.getInputProps("locale")}
        />
        <div>
          <Text size="sm" fw={500} mb={4}>
            {t("settings.profile.theme")}
          </Text>
          <SegmentedControl
            data={(["auto", "light", "dark"] as const).map((value) => ({
              value,
              label: t(`settings.profile.themes.${value}`),
            }))}
            {...form.getInputProps("theme")}
          />
        </div>
        <Group>
          <Button type="submit" loading={update.isPending}>
            {t("common.save")}
          </Button>
        </Group>
      </Stack>
    </form>
  );
}

export function ProfileSettings() {
  const { data: user } = useCurrentUser();
  return user ? <ProfileForm user={user} /> : null;
}
