import { Alert, Button, Group, PasswordInput, Stack, Text } from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";

import { useErrorMessage } from "../../i18n/useErrorMessage";
import { PasswordChecklist } from "../auth/PasswordChecklist";
import { passwordViolations } from "../auth/passwordPolicy";
import { useChangePassword } from "../auth/useAuth";

export function PasswordSettings() {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const change = useChangePassword();
  const form = useForm({
    initialValues: { current: "", next: "", confirm: "" },
    validate: {
      current: (v) => (v ? null : t("auth.passwordRequired")),
      next: (v) => (passwordViolations(v).length ? t("password.notCompliant") : null),
      confirm: (v, values) => (v === values.next ? null : t("password.mismatch")),
    },
  });

  return (
    <form
      noValidate
      onSubmit={form.onSubmit((values) =>
        change.mutate(
          { current_password: values.current, new_password: values.next },
          {
            onSuccess: () => {
              form.reset();
              notifications.show({ color: "teal", message: t("password.changed") });
            },
          },
        ),
      )}
    >
      <Stack maw={420}>
        <Text size="sm" c="dimmed">
          {t("password.otherSessionsNotice")}
        </Text>
        {change.isError && (
          <Alert color="red" role="alert">
            {errorMessage(change.error)}
          </Alert>
        )}
        <PasswordInput
          label={t("password.current")}
          autoComplete="current-password"
          {...form.getInputProps("current")}
        />
        <PasswordInput
          label={t("password.new")}
          autoComplete="new-password"
          {...form.getInputProps("next")}
        />
        <PasswordChecklist password={form.values.next} />
        <PasswordInput
          label={t("password.confirm")}
          autoComplete="new-password"
          {...form.getInputProps("confirm")}
        />
        <Group>
          <Button type="submit" loading={change.isPending}>
            {t("password.submit")}
          </Button>
        </Group>
      </Stack>
    </form>
  );
}
