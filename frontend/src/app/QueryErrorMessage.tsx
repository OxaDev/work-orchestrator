import { Button, Group, Text } from "@mantine/core";

/** Body of the "loading failed" toast: the translated reason and a retry button (P12-5). */
export function QueryErrorMessage({
  text,
  retryLabel,
  onRetry,
}: {
  text: string;
  retryLabel: string;
  onRetry: () => void;
}) {
  return (
    <Group justify="space-between" wrap="nowrap">
      <Text size="sm">{text}</Text>
      <Button size="xs" variant="light" onClick={onRetry}>
        {retryLabel}
      </Button>
    </Group>
  );
}
