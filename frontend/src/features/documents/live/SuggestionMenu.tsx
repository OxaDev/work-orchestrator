import { Loader, Paper, Portal, Text, UnstyledButton } from "@mantine/core";
import { useTranslation } from "react-i18next";

import type { MenuState } from "./extensions";

/** The floating list under the cursor for "/" and "[[" (ADR-0043). */
export function SuggestionMenu({
  menu,
  active,
  label,
  onHover,
}: {
  menu: MenuState;
  active: number;
  label: string;
  onHover: (index: number) => void;
}) {
  const { t } = useTranslation("documents");
  const rect = menu.rect;
  return (
    <Portal>
      <Paper
        shadow="md"
        withBorder
        p={4}
        role="listbox"
        aria-label={label}
        style={{
          position: "fixed",
          top: (rect?.bottom ?? 0) + 4,
          left: rect?.left ?? 0,
          zIndex: 400,
          width: 300,
          maxHeight: 320,
          overflowY: "auto",
        }}
      >
        {menu.entries.length === 0 ? (
          menu.loading ? (
            <Loader size="xs" m="xs" />
          ) : (
            <Text size="sm" c="dimmed" p="xs">
              {t("live.noResult")}
            </Text>
          )
        ) : (
          menu.entries.map((entry, index) => (
            <UnstyledButton
              key={entry.key}
              role="option"
              aria-selected={index === active}
              display="block"
              w="100%"
              px="xs"
              py={6}
              style={{
                borderRadius: 4,
                background: index === active ? "var(--mantine-color-default-hover)" : undefined,
              }}
              // Keeps the focus (and the selection) in the editor.
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => onHover(index)}
              onClick={() => menu.select(index)}
            >
              <Text size="sm">{entry.label}</Text>
              {entry.detail && (
                <Text size="xs" c="dimmed">
                  {entry.detail}
                </Text>
              )}
            </UnstyledButton>
          ))
        )}
      </Paper>
    </Portal>
  );
}
