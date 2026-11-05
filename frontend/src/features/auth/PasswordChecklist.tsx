import { List, ThemeIcon } from "@mantine/core";
import { IconCheck, IconX } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";

import { PASSWORD_RULES, passwordViolations } from "./passwordPolicy";

/** Live feedback on the password policy (ADR-0008). */
export function PasswordChecklist({ password }: { password: string }) {
  const { t } = useTranslation();
  const violations = new Set(passwordViolations(password));
  return (
    <List size="xs" spacing={2} aria-label={t("password.rulesTitle")}>
      {PASSWORD_RULES.map((rule) => {
        const ok = !violations.has(rule);
        return (
          <List.Item
            key={rule}
            data-ok={ok}
            icon={
              <ThemeIcon color={ok ? "teal" : "gray"} size={16} radius="xl">
                {ok ? <IconCheck size={11} /> : <IconX size={11} />}
              </ThemeIcon>
            }
          >
            {t(`password.rules.${rule}`)}
          </List.Item>
        );
      })}
    </List>
  );
}
