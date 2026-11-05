import {
  Alert,
  Button,
  Center,
  Paper,
  PasswordInput,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { IconAlertTriangle } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { Navigate, useNavigate, useSearchParams } from "react-router";

import { useErrorMessage } from "../../i18n/useErrorMessage";
import { FullPageLoader } from "./guards";
import { safeNextPath } from "./nextPath";
import { useCurrentUser, useLogin } from "./useAuth";

export function LoginPage() {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNextPath(params.get("next"));
  const { data: user, isPending } = useCurrentUser();
  const login = useLogin();
  const form = useForm({
    initialValues: { email: "", password: "" },
    validate: {
      email: (value) => (/^\S+@\S+$/.test(value) ? null : t("auth.emailInvalid")),
      password: (value) => (value ? null : t("auth.passwordRequired")),
    },
  });

  if (isPending) return <FullPageLoader />;
  if (user) return <Navigate to={next} replace />;

  return (
    <Center mih="100vh" p="md">
      <Paper withBorder shadow="sm" p="xl" w={380} maw="100%">
        <form
          noValidate
          onSubmit={form.onSubmit((values) =>
            login.mutate(values, { onSuccess: () => void navigate(next, { replace: true }) }),
          )}
        >
          <Stack>
            <div>
              <Title order={3}>{t("app.name")}</Title>
              <Text c="dimmed" size="sm">
                {t("auth.subtitle")}
              </Text>
            </div>
            {login.isError && (
              <Alert color="red" icon={<IconAlertTriangle size={18} />} role="alert">
                {errorMessage(login.error)}
              </Alert>
            )}
            <TextInput
              label={t("auth.email")}
              type="email"
              autoComplete="username"
              autoFocus
              {...form.getInputProps("email")}
            />
            <PasswordInput
              label={t("auth.password")}
              autoComplete="current-password"
              {...form.getInputProps("password")}
            />
            <Button type="submit" loading={login.isPending}>
              {t("auth.signIn")}
            </Button>
            <Text size="xs" c="dimmed">
              {t("auth.forgotHint")}
            </Text>
          </Stack>
        </form>
      </Paper>
    </Center>
  );
}
