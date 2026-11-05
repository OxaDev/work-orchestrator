import { Center, Group, Loader, Pagination, Table, Text } from "@mantine/core";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

export interface Column<T> {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  width?: number | string;
}

interface EntityTableProps<T extends { id: string }> {
  columns: Column<T>[];
  rows: T[] | undefined;
  loading?: boolean;
  onRowClick?: (row: T) => void;
  /** Server-side pagination (ADR-0014). */
  page?: number;
  pageSize?: number;
  total?: number;
  onPageChange?: (page: number) => void;
  emptyText?: ReactNode;
  rowLabel?: (row: T) => string;
}

export function EntityTable<T extends { id: string }>({
  columns,
  rows,
  loading,
  onRowClick,
  page = 1,
  pageSize = 50,
  total,
  onPageChange,
  emptyText,
  rowLabel,
}: EntityTableProps<T>) {
  const { t } = useTranslation();
  if (loading && !rows) {
    return (
      <Center py="xl">
        <Loader size="sm" />
      </Center>
    );
  }
  const pages = total ? Math.ceil(total / pageSize) : 1;

  return (
    <>
      <Table.ScrollContainer minWidth={560}>
        <Table highlightOnHover={Boolean(onRowClick)} verticalSpacing="xs">
          <Table.Thead>
            <Table.Tr>
              {columns.map((column) => (
                <Table.Th key={column.key} w={column.width}>
                  {column.header}
                </Table.Th>
              ))}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows?.map((row) => (
              <Table.Tr
                key={row.id}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                onKeyDown={
                  onRowClick
                    ? (event) => {
                        if (event.key === "Enter") onRowClick(row);
                      }
                    : undefined
                }
                tabIndex={onRowClick ? 0 : undefined}
                aria-label={rowLabel?.(row)}
                style={onRowClick ? { cursor: "pointer" } : undefined}
              >
                {columns.map((column) => (
                  <Table.Td key={column.key}>{column.render(row)}</Table.Td>
                ))}
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
      {rows?.length === 0 && (
        <Text c="dimmed" ta="center" py="lg" size="sm">
          {emptyText ?? t("common.empty")}
        </Text>
      )}
      {onPageChange && pages > 1 && (
        <Group justify="center" mt="sm">
          <Pagination total={pages} value={page} onChange={onPageChange} size="sm" />
        </Group>
      )}
    </>
  );
}
