"use client";

import EditorBulkActions from "@/components/editor/EditorBulkActions";
import EditorToolbar, { PageFilter, ViewMode } from "@/components/editor/EditorToolbar";
import ImageCard from "@/components/editor/ImageCard";
import ListViewItem from "@/components/editor/ListViewItem";
import NoImagesState from "@/components/editor/NoImagesState";
import ToastViewport from "@/components/ToastViewport";
import {
  Button,
  Checkbox,
  Chip,
  EmptyState,
  Field,
  IconButton,
  Input,
  Kbd,
  Menu,
  Modal,
  Mono,
  ProgressBar,
  SectionLabel,
  SegmentedControl,
  Select,
  Skeleton,
  Spinner,
  StageBar,
  Switch,
  Textarea,
} from "@/components/ui";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { useUIStore } from "@/stores/useUIStore";
import { PageJobSummary, ProcessedImage } from "@/types";
import { describePageStatus } from "@/utils/stages";
import {
  Download,
  Library,
  MoreHorizontal,
  Moon,
  PencilRuler,
  Plus,
  Sun,
  Trash2,
  Zap,
} from "lucide-react";
import React, { useMemo, useState } from "react";

/**
 * Development gallery: renders the shared primitives and the editor page
 * components with fake data, without a database or login.
 *
 *   /dev/ui
 */

const pageSvg = (label: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600" viewBox="0 0 400 600">
      <rect width="400" height="600" fill="#f4f3ee"/>
      <rect x="18" y="18" width="364" height="260" fill="none" stroke="#1a1b1e" stroke-width="3"/>
      <rect x="18" y="300" width="170" height="282" fill="none" stroke="#1a1b1e" stroke-width="3"/>
      <rect x="212" y="300" width="170" height="282" fill="none" stroke="#1a1b1e" stroke-width="3"/>
      <ellipse cx="120" cy="110" rx="70" ry="42" fill="#fff" stroke="#1a1b1e" stroke-width="3"/>
      <ellipse cx="300" cy="400" rx="60" ry="38" fill="#fff" stroke="#1a1b1e" stroke-width="3"/>
      <text x="200" y="560" font-family="monospace" font-size="20" text-anchor="middle" fill="#8b8e95">${label}</text>
    </svg>`,
  )}`;

const makeImage = (
  index: number,
  status: ProcessedImage["status"],
  extra: Partial<ProcessedImage> = {},
): ProcessedImage => ({
  id: `img-${index}`,
  fileName: `vagabond_v12_c104_p${String(index).padStart(3, "0")}.jpg`,
  originalUrl: pageSvg(`p.${String(index).padStart(3, "0")}`),
  translatedUrl: status === "completed" ? pageSvg(`p.${String(index).padStart(3, "0")} · translated`) : null,
  status,
  sequenceNumber: index,
  cost: status === "completed" ? 0.0021 * index : undefined,
  usage:
    status === "completed"
      ? {
          promptTokenCount: 1820,
          candidatesTokenCount: 410,
          thoughtsTokenCount: 0,
          totalTokenCount: 2230,
          modelUsed: "gemini-2.5-flash-lite",
        }
      : undefined,
  ...extra,
});

const makeJob = (
  imageId: string,
  stage: PageJobSummary["stage"],
  extra: Partial<PageJobSummary> = {},
): PageJobSummary => ({
  id: `job-${imageId}`,
  imageId,
  seriesId: "series-1",
  provider: "gemini",
  stage,
  attempts: 1,
  waitingForWorker: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...extra,
});

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="flex flex-col gap-3 border-t border-line pt-6">
    <SectionLabel>{title}</SectionLabel>
    {children}
  </section>
);

export default function UiGalleryPage() {
  const theme = useSettingsStore((state) => state.theme);
  const setTheme = useSettingsStore((state) => state.setTheme);
  const showToast = useUIStore((state) => state.showToast);
  const [modalOpen, setModalOpen] = useState(false);
  const [filter, setFilter] = useState<PageFilter>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [switchOn, setSwitchOn] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set(["img-3"]));

  const images = useMemo(
    () => [
      makeImage(1, "completed"),
      makeImage(2, "processing"),
      makeImage(3, "processing"),
      makeImage(4, "error"),
      makeImage(5, "idle"),
    ],
    [],
  );
  const jobs = useMemo(
    () =>
      new Map<string, PageJobSummary>([
        ["img-2", makeJob("img-2", "translating")],
        ["img-3", makeJob("img-3", "queued", { waitingForWorker: true })],
        ["img-4", makeJob("img-4", "failed", { error: "Gemini is busy; retrying in 30 s" })],
      ]),
    [],
  );

  if (process.env.NODE_ENV === "production") return null;

  const noop = () => {};
  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const cardProps = (image: ProcessedImage, index: number) => ({
    image,
    index,
    total: images.length,
    status: describePageStatus(image, jobs.get(image.id)),
    isSelected: selected.has(image.id),
    onToggleSelect: () => toggle(image.id),
    onOpen: () => showToast(`Open ${image.fileName}`, "info", 2500),
    onOpenEditor: () => showToast("Open layout editor", "info", 2500),
    onTranslate: () => showToast(`${image.fileName}: queued.`, "success", 2500),
    onCancel: () => showToast(`${image.fileName}: cancelled.`, "info", 2500),
    onDelete: () => showToast("Delete page", "error", 2500),
    onSetStatus: (status: ProcessedImage["status"]) =>
      showToast(`${image.fileName}: marked ${status}.`, "success", 2500),
  });

  return (
    <main className="mx-auto flex max-w-[1200px] flex-col gap-8 px-6 py-8">
      <ToastViewport />
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">MangaLens UI gallery</h1>
          <p className="text-sm text-ink-2">Primitives and editor components with sample data.</p>
        </div>
        <IconButton
          label={theme === "light" ? "Switch to dark theme" : "Switch to light theme"}
          variant="secondary"
          onClick={() => setTheme(theme === "light" ? "dark" : "light")}
        >
          {theme === "light" ? <Moon /> : <Sun />}
        </IconButton>
      </header>

      <Section title="Buttons">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" icon={<Zap />}>Translate all</Button>
          <Button icon={<Plus />}>Add pages</Button>
          <Button variant="ghost">Clear filters</Button>
          <Button variant="danger" icon={<Trash2 />}>Delete</Button>
          <Button variant="primary" loading>Saving</Button>
          <Button disabled>Disabled</Button>
          <Button size="sm">Small</Button>
          <Button size="lg" variant="primary">Large</Button>
          <IconButton label="More" variant="secondary"><MoreHorizontal /></IconButton>
          <IconButton label="Edit layout"><PencilRuler /></IconButton>
          <IconButton label="Active" active><Zap /></IconButton>
          <IconButton label="Danger" variant="danger"><Trash2 /></IconButton>
          <Menu
            items={[
              { label: "Export backup", icon: <Download />, onSelect: noop },
              { label: "Delete all pages", icon: <Trash2 />, onSelect: noop, danger: true, separator: true },
            ]}
            trigger={(props) => <Button iconRight={<MoreHorizontal />} {...props}>Menu</Button>}
          />
          <Spinner className="text-action" />
        </div>
      </Section>

      <Section title="Inputs">
        <div className="grid max-w-2xl grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Series title" required hint="Shown in the sidebar and reader.">
            {(ids) => <Input id={ids.id} placeholder="e.g. Vagabond" data-autofocus />}
          </Field>
          <Field label="Author" error="Author is required">
            {(ids) => <Input id={ids.id} invalid aria-describedby={ids.describedBy} />}
          </Field>
          <Field label="Target language">
            {(ids) => (
              <Select id={ids.id} defaultValue="English">
                <option>Turkish</option>
                <option>English</option>
                <option>Japanese</option>
              </Select>
            )}
          </Field>
          <Field label="Page" hint="Mono input for numbers">
            {(ids) => <Input id={ids.id} mono defaultValue="104" className="w-24" />}
          </Field>
          <Field label="Prompt guidelines" className="sm:col-span-2">
            {(ids) => <Textarea id={ids.id} placeholder="Keep sound effects in Japanese…" />}
          </Field>
          <Checkbox label="Verified adult content" description="Local OCR fallback stays disabled otherwise." />
          <Switch checked={switchOn} onChange={setSwitchOn} label="Gemini batch pricing" description="50%-priced asynchronous jobs." />
          <SegmentedControl
            label="View"
            value={viewMode}
            onChange={setViewMode}
            options={[
              { value: "grid", label: "Grid" },
              { value: "large", label: "Large" },
              { value: "list", label: "List" },
            ]}
          />
        </div>
      </Section>

      <Section title="Status">
        <div className="flex flex-wrap items-center gap-2">
          <Chip>Neutral</Chip>
          <Chip tone="accent">Running</Chip>
          <Chip tone="ok">Ready</Chip>
          <Chip tone="warn">Queued</Chip>
          <Chip tone="danger">Failed</Chip>
          <Chip active count={12} onClick={noop}>Filter chip</Chip>
          <Chip count={3} onClick={noop}>Failed</Chip>
          <Kbd>Ctrl</Kbd>
          <Kbd>Z</Kbd>
          <Mono>p.104 · $0.0123 · 12,340 tok</Mono>
        </div>
        <div className="grid max-w-xl grid-cols-2 gap-4">
          <StageBar stages={{ detect: "done", translate: "running", render: "idle" }} />
          <StageBar stages={{ detect: "done", translate: "done", render: "done" }} />
          <StageBar stages={{ detect: "queued", translate: "queued", render: "queued" }} />
          <StageBar stages={{ detect: "failed", translate: "failed", render: "failed" }} />
          <ProgressBar value={104} max={327} />
          <ProgressBar value={3} max={10} tone="danger" />
          <Skeleton className="h-8" />
          <Skeleton className="h-8 w-1/2" />
        </div>
      </Section>

      <Section title="Editor toolbar">
        <EditorToolbar
          counts={{ all: 18, running: 2, failed: 1, done: 11, idle: 4 }}
          filter={filter}
          onFilterChange={setFilter}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          isProcessingAll={false}
          canTranslateAll
          onTranslateAll={() => showToast("18 pages queued. The server keeps working if you close this tab.", "success", 4000)}
          batchSize={10}
          onBatchSizeChange={noop}
          onUpload={noop}
          isUploading={false}
          migrationCount={4}
          onOpenMigration={noop}
          onWipe={() => showToast("Delete all pages", "error", 2500)}
          onSelectPage={() => setSelected(new Set(images.map((image) => image.id)))}
          isViewOnly={false}
        />
        <EditorBulkActions
          selectedCount={selected.size}
          totalCount={images.length}
          isPageSelected={selected.size === images.length}
          onTogglePage={() =>
            setSelected(selected.size === images.length ? new Set() : new Set(images.map((image) => image.id)))
          }
          onSelectAll={() => setSelected(new Set(images.map((image) => image.id)))}
          onClear={() => setSelected(new Set())}
          onStatusChange={(status) => showToast(`${selected.size} pages marked ${status}.`, "success", 2500)}
          onTranslate={noop}
          onDelete={noop}
        />
      </Section>

      <Section title="Page cards">
        <ul className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
          {images.map((image, index) => (
            <ImageCard key={image.id} {...cardProps(image, index)} onMove={noop} developerMode />
          ))}
        </ul>
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {images.slice(0, 2).map((image, index) => (
            <ImageCard key={image.id} {...cardProps(image, index)} onMove={noop} developerMode large />
          ))}
        </ul>
      </Section>

      <Section title="Page rows">
        <ul className="flex flex-col gap-1">
          {images.map((image, index) => (
            <ListViewItem key={image.id} {...cardProps(image, index)} />
          ))}
        </ul>
      </Section>

      <Section title="Empty states">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <EmptyState
            icon={<Library />}
            title="No series selected"
            description="Pick a series from the list, or create a new one to start translating."
            action={<Button variant="primary" icon={<Plus />}>New series</Button>}
          />
          <NoImagesState seriesName="Vagabond" onUpload={noop} />
        </div>
      </Section>

      <Section title="Overlays">
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setModalOpen(true)}>Open modal</Button>
          <Button onClick={() => showToast("Settings saved.", "success")}>Success toast</Button>
          <Button onClick={() => showToast("Could not reach the server. Try again.", "error")}>Error toast</Button>
          <Button onClick={() => showToast("3 pages queued.", "info")}>Info toast</Button>
          <Button onClick={() => showToast("Gemini is busy; retrying in 30 s.", "warning")}>Warning toast</Button>
        </div>
        <Modal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          title="Edit series"
          description="Names, credits and category."
          icon={<PencilRuler />}
          footer={
            <>
              <Button onClick={() => setModalOpen(false)}>Cancel</Button>
              <Button variant="primary" onClick={() => setModalOpen(false)}>Save changes</Button>
            </>
          }
        >
          <div className="flex flex-col gap-4">
            <Field label="Series title" required>
              {(ids) => <Input id={ids.id} defaultValue="Vagabond" />}
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Author">{(ids) => <Input id={ids.id} defaultValue="Takehiko Inoue" />}</Field>
              <Field label="Group">{(ids) => <Input id={ids.id} />}</Field>
            </div>
          </div>
        </Modal>
      </Section>
    </main>
  );
}
