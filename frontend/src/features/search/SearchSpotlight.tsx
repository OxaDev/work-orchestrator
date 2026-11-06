import { ActionIcon, Badge, Button, Group, Kbd, Stack, Text } from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { Spotlight, spotlight } from "@mantine/spotlight";
import { IconSearch } from "@tabler/icons-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";

import { todayIso } from "../agenda/calendar";
import { dayPath } from "../agenda/micro";
import { NEW_TASK_EVENT } from "../agenda/QuickTaskEntry";
import { resultPath, useGlobalSearch } from "./api";
import { Highlight } from "./Highlight";

interface QuickAction {
  id: string;
  run: () => void;
}

function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

/**
 * `Ctrl+K` / `⌘K` palette (P11-3, ADR-0040): quick actions, then search results over
 * everything, best matches first. Snippets are highlighted from server markers, never HTML.
 */
export function SearchSpotlight() {
  const { t } = useTranslation("search");
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [debounced] = useDebouncedValue(query, 200);
  const search = useGlobalSearch(debounced);
  const results = query.trim() ? (search.data ?? []) : [];

  const go = (path: string) => () => void navigate(path);
  const actions: QuickAction[] = [
    { id: "newTask", run: () => window.dispatchEvent(new Event(NEW_TASK_EVENT)) },
    { id: "today", run: go(dayPath(todayIso())) },
    { id: "week", run: go(`/agenda/week/${todayIso()}`) },
    { id: "standup", run: go("/agenda/standup") },
    { id: "newDocument", run: go("/documents?new=1") },
    { id: "newMission", run: go("/missions?new=1") },
  ];
  const needle = fold(query.trim());
  const shown = actions.filter((action) => fold(t(`actions.${action.id}`)).includes(needle));

  return (
    <>
      <Button
        size="xs"
        variant="default"
        leftSection={<IconSearch size={14} />}
        rightSection={<Kbd size="xs">Ctrl K</Kbd>}
        onClick={() => spotlight.open()}
        visibleFrom="sm"
      >
        {t("open")}
      </Button>
      <ActionIcon
        variant="default"
        size="lg"
        aria-label={t("open")}
        onClick={() => spotlight.open()}
        hiddenFrom="sm"
      >
        <IconSearch size={18} />
      </ActionIcon>
      <Spotlight.Root
        query={query}
        onQueryChange={setQuery}
        shortcut={["mod + K"]}
        // Always start afresh; clearQueryOnClose waits for the closing transition.
        onSpotlightOpen={() => setQuery("")}
        scrollable
        maxHeight={480}
      >
        <Spotlight.Search
          placeholder={t("placeholder")}
          aria-label={t("placeholder")}
          leftSection={<IconSearch size={18} />}
        />
        <Spotlight.ActionsList>
          {shown.length > 0 && (
            <Spotlight.ActionsGroup label={t("groups.actions")}>
              {shown.map((action) => (
                <Spotlight.Action
                  key={action.id}
                  label={t(`actions.${action.id}`)}
                  onClick={action.run}
                />
              ))}
            </Spotlight.ActionsGroup>
          )}
          {results.length > 0 && (
            <Spotlight.ActionsGroup label={t("groups.results")}>
              {results.map((result) => (
                <Spotlight.Action
                  key={`${result.type}:${result.id}`}
                  onClick={go(resultPath(result))}
                >
                  <Group wrap="nowrap" align="flex-start" w="100%">
                    <Badge variant="light" size="sm" miw={90}>
                      {t(`types.${result.type}`)}
                    </Badge>
                    <Stack gap={2} style={{ minWidth: 0 }}>
                      <Group gap="xs">
                        <Text size="sm" fw={500}>
                          {result.title}
                        </Text>
                        {result.archived && (
                          <Badge size="xs" color="gray" variant="outline">
                            {t("archived")}
                          </Badge>
                        )}
                      </Group>
                      {result.snippet && (
                        <Text size="xs" c="dimmed" lineClamp={2}>
                          <Highlight snippet={result.snippet} />
                        </Text>
                      )}
                    </Stack>
                  </Group>
                </Spotlight.Action>
              ))}
            </Spotlight.ActionsGroup>
          )}
          {shown.length === 0 && results.length === 0 && (
            <Spotlight.Empty>{search.isFetching ? t("searching") : t("empty")}</Spotlight.Empty>
          )}
        </Spotlight.ActionsList>
      </Spotlight.Root>
    </>
  );
}
