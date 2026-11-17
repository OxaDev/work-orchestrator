import {
  Alert,
  Anchor,
  Breadcrumbs,
  Button,
  FileButton,
  Grid,
  Group,
  Loader,
  SegmentedControl,
  Select,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { useHotkeys } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import {
  IconArchive,
  IconArchiveOff,
  IconDeviceFloppy,
  IconFileExport,
  IconFilePlus,
  IconPaperclip,
  IconTrash,
} from "@tabler/icons-react";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router";

import { ConfirmDialog } from "../../components/ConfirmDialog";
import { attachmentMarkdown } from "../../components/markdown";
import { MarkdownView } from "../../components/MarkdownView";
import { buildTree, flattenTree, subtreeIds } from "../../components/tree";
import { useErrorMessage } from "../../i18n/useErrorMessage";
import { useNotify } from "../directory/useNotify";
import { NotFoundPage } from "../placeholder/NotFoundPage";
import {
  type DocumentDetail,
  uploadAttachment,
  useArchiveDocument,
  useDeleteDocument,
  useDocument,
  useDocuments,
  useMoveDocument,
  useSaveDocument,
  useSaveDraft,
} from "./api";
import { DocumentSidePanel } from "./DocumentSidePanel";
import { ExportModal } from "./ExportModal";
import { MarkdownEditor } from "./MarkdownEditor";
import { NewDocumentModal } from "./NewDocumentModal";

// ProseMirror and its extensions load with the first document opened (ADR-0043).
const LiveEditor = lazy(() => import("./LiveEditor"));

const AUTOSAVE_MS = 2000;
/** Live WYSIWYG (default), Markdown source, read-only preview (ADR-0043). */
type Mode = "live" | "source" | "preview";
const MODES: Mode[] = ["live", "source", "preview"];

function Editor({ document }: { document: DocumentDetail }) {
  const { t, i18n } = useTranslation("documents");
  const notify = useNotify();
  const errorMessage = useErrorMessage();
  const navigate = useNavigate();
  const all = useDocuments({ include_archived: true });
  const save = useSaveDocument(document.id);
  const draft = useSaveDraft(document.id);
  const move = useMoveDocument(document.id);
  const archive = useArchiveDocument(document.id);
  const remove = useDeleteDocument(document.id);
  const [title, setTitle] = useState(document.title);
  const [content, setContent] = useState(document.content_md);
  // The last content known to the server (saved or drafted), to know what autosave must send.
  const [synced, setSynced] = useState(document.draft_md ?? document.content_md);
  const [pendingDraft, setPendingDraft] = useState(
    document.draft_md !== null && document.draft_md !== document.content_md,
  );
  const [mode, setMode] = useState<Mode>("live");
  const [creatingChild, setCreatingChild] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const time = new Intl.DateTimeFormat(i18n.language, { timeStyle: "short" });

  // Autosave a draft after a pause in typing (ADR-0024: no version).
  useEffect(() => {
    if (pendingDraft || content === synced) return;
    timer.current = setTimeout(() => {
      draft.mutate(content, { onSuccess: () => setSynced(content) });
    }, AUTOSAVE_MS);
    return () => clearTimeout(timer.current);
    // `draft` is a stable mutation object for this document.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, synced, pendingDraft]);

  const dirty = content !== document.content_md || title.trim() !== document.title;
  const doSave = () => {
    if (!title.trim()) return;
    clearTimeout(timer.current);
    save.mutate(
      { title: title.trim(), content_md: content },
      {
        onSuccess: (saved) => {
          setSynced(saved.content_md);
          notify.saved();
        },
        onError: notify.error,
      },
    );
  };
  // Ctrl/Cmd+S anywhere on the page, title field included (the editor handles its own).
  useHotkeys([["mod+s", doSave]], []);
  const onFiles = async (files: File[]) => {
    const snippets: string[] = [];
    for (const file of files) {
      try {
        const uploaded = await uploadAttachment(file, document.id);
        snippets.push(attachmentMarkdown(file, uploaded.id));
      } catch (error) {
        notifications.show({ color: "red", message: errorMessage(error) });
      }
    }
    return snippets;
  };
  const insertFile = (file: File | null) => {
    if (!file) return;
    void onFiles([file]).then((snippets) => {
      if (snippets.length)
        setContent((current) => `${current.replace(/\n*$/, "\n\n")}${snippets.join("\n")}\n`);
    });
  };

  const items = all.data ?? [];
  const byId = new Map(items.map((d) => [d.id, d]));
  const ancestors: { id: string; title: string }[] = [];
  for (
    let parent = document.parent_id;
    parent && byId.has(parent);
    parent = byId.get(parent)!.parent_id
  ) {
    ancestors.unshift(byId.get(parent)!);
  }
  const excluded = subtreeIds(items, document.id);
  const parents = flattenTree(
    buildTree(
      items.filter((d) => !d.archived_at),
      (a, b) => a.title.localeCompare(b.title),
    ),
  )
    .filter((node) => !excluded.has(node.item.id))
    .map((node) => ({
      value: node.item.id,
      label: `${"  ".repeat(node.depth)}${node.item.title}`,
    }));

  const status = save.isPending
    ? t("status.saving")
    : draft.isPending
      ? t("status.drafting")
      : !dirty
        ? t("status.saved")
        : content === synced && document.draft_saved_at
          ? t("status.drafted", { time: time.format(new Date(document.draft_saved_at)) })
          : t("status.unsaved");

  return (
    <Stack>
      <Breadcrumbs>
        <Anchor component={Link} to="/documents">
          {t("title")}
        </Anchor>
        {ancestors.map((a) => (
          <Anchor key={a.id} component={Link} to={`/documents/${a.id}`}>
            {a.title}
          </Anchor>
        ))}
        <Text>{document.title}</Text>
      </Breadcrumbs>
      {document.archived_at && <Alert color="gray">{t("archivedNotice")}</Alert>}
      {pendingDraft && (
        <Alert color="orange" title={t("draft.title")}>
          <Group justify="space-between">
            <Text size="sm">
              {t("draft.found", {
                time: document.draft_saved_at ? time.format(new Date(document.draft_saved_at)) : "",
              })}
            </Text>
            <Group gap="xs">
              <Button
                size="xs"
                onClick={() => {
                  setContent(document.draft_md ?? "");
                  setPendingDraft(false);
                }}
              >
                {t("draft.resume")}
              </Button>
              <Button
                size="xs"
                variant="default"
                onClick={() =>
                  draft.mutate(null, {
                    onSuccess: () => {
                      setSynced(document.content_md);
                      setPendingDraft(false);
                    },
                  })
                }
              >
                {t("draft.discard")}
              </Button>
            </Group>
          </Group>
        </Alert>
      )}
      <Group justify="space-between" align="flex-end">
        <TextInput
          label={t("fields.title")}
          value={title}
          onChange={(e) => setTitle(e.currentTarget.value)}
          error={title.trim() ? null : t("validation.required")}
          style={{ flex: 1, minWidth: 240 }}
        />
        <Select
          label={t("fields.parent")}
          placeholder={t("fields.root")}
          clearable
          data={parents}
          value={document.parent_id}
          onChange={(value) => move.mutate(value, { onError: notify.error })}
          w={240}
        />
      </Group>
      <Group justify="space-between">
        <Group gap="xs">
          <Button
            leftSection={<IconDeviceFloppy size={16} />}
            onClick={doSave}
            loading={save.isPending}
            disabled={!dirty || !title.trim()}
          >
            {t("save")}
          </Button>
          <Text size="sm" c="dimmed" aria-live="polite">
            {status}
          </Text>
        </Group>
        <Group gap="xs">
          <SegmentedControl
            size="xs"
            aria-label={t("mode.label")}
            value={mode}
            onChange={(value) => setMode(value as Mode)}
            data={MODES.map((m) => ({
              value: m,
              label: t(`mode.${m}`),
            }))}
          />
          <Button
            size="xs"
            variant="default"
            leftSection={<IconFilePlus size={14} />}
            onClick={() => setCreatingChild(true)}
          >
            {t("createSubdocument")}
          </Button>
          <FileButton onChange={insertFile}>
            {(props) => (
              <Button
                {...props}
                size="xs"
                variant="default"
                leftSection={<IconPaperclip size={14} />}
              >
                {t("insertFile")}
              </Button>
            )}
          </FileButton>
          <Button
            size="xs"
            variant="default"
            leftSection={<IconFileExport size={14} />}
            onClick={() => setExporting(true)}
          >
            {t("export.button")}
          </Button>
          <Button
            size="xs"
            variant="default"
            leftSection={
              document.archived_at ? <IconArchiveOff size={14} /> : <IconArchive size={14} />
            }
            onClick={() => archive.mutate(!document.archived_at, { onError: notify.error })}
          >
            {t(document.archived_at ? "restore" : "archive")}
          </Button>
          <Button
            size="xs"
            variant="subtle"
            color="red"
            leftSection={<IconTrash size={14} />}
            onClick={() => setDeleting(true)}
          >
            {t("delete")}
          </Button>
        </Group>
      </Group>
      <Grid>
        <Grid.Col span={{ base: 12, xl: 9 }}>
          {mode === "live" && (
            <Suspense fallback={<Loader size="sm" />}>
              <LiveEditor
                value={content}
                onChange={setContent}
                onSave={doSave}
                onFiles={onFiles}
                label={t("editor")}
              />
            </Suspense>
          )}
          {mode === "source" && (
            <MarkdownEditor
              value={content}
              onChange={setContent}
              onSave={doSave}
              onFiles={onFiles}
              label={t("editor")}
            />
          )}
          {mode === "preview" && (
            <section aria-label={t("preview")}>
              <MarkdownView source={content} empty={t("empty")} />
            </section>
          )}
        </Grid.Col>
        <Grid.Col span={{ base: 12, xl: 3 }}>
          <DocumentSidePanel
            document={document}
            onRestored={(restored) => {
              setTitle(restored.title);
              setContent(restored.content_md);
              setSynced(restored.content_md);
            }}
          />
        </Grid.Col>
      </Grid>
      {creatingChild && (
        <NewDocumentModal parentId={document.id} onClose={() => setCreatingChild(false)} />
      )}
      {exporting && (
        <ExportModal slug={document.slug} content={content} onClose={() => setExporting(false)} />
      )}
      <ConfirmDialog
        opened={deleting}
        title={t("deleteTitle")}
        message={t("deleteMessage", { title: document.title })}
        loading={remove.isPending}
        onCancel={() => setDeleting(false)}
        onConfirm={() =>
          remove.mutate(undefined, {
            onSuccess: () => void navigate("/documents", { replace: true }),
            onError: (error) => {
              setDeleting(false);
              notify.error(error);
            },
          })
        }
      />
    </Stack>
  );
}

/** /documents/:documentId — live Markdown editor, source and preview modes (P7, ADR-0043). */
export function DocumentPage() {
  const { documentId = "" } = useParams();
  const document = useDocument(documentId);
  if (document.isPending) return <Loader size="sm" />;
  if (!document.data) return <NotFoundPage />;
  return <Editor key={document.data.id} document={document.data} />;
}
