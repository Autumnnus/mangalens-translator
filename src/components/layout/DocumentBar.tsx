"use client";

import { BookOpen, Menu as MenuIcon, Moon, PencilLine, Sun } from "lucide-react";
import React, { useMemo } from "react";
import { useCategoriesQuery } from "../../hooks/useCategoryQueries";
import { useSeriesImagesQuery, useSeriesQuery } from "../../hooks/useSeriesQueries";
import { useSeriesStore } from "../../stores/useSeriesStore";
import { useSettingsStore } from "../../stores/useSettingsStore";
import { useUIStore } from "../../stores/useUIStore";
import { formatCost, formatInt } from "../../utils/format";
import { IconButton, Mono, SegmentedControl } from "../ui";

/**
 * Top bar of the workspace: where you are (category / series), quiet meta,
 * and the Edit / Read switch. The editor toolbar below it owns the actions.
 */
const DocumentBar: React.FC = () => {
  const activeSeriesId = useSeriesStore((state) => state.activeSeriesId);
  const isViewOnly = useSettingsStore((state) => state.isViewOnly);
  const setViewOnly = useSettingsStore((state) => state.setViewOnly);
  const theme = useSettingsStore((state) => state.theme);
  const setTheme = useSettingsStore((state) => state.setTheme);
  const toggleSidebar = useUIStore((state) => state.toggleSidebar);

  const { data: seriesData } = useSeriesQuery();
  const { data: categories } = useCategoriesQuery();
  const { data: images } = useSeriesImagesQuery(activeSeriesId);

  const series = useMemo(
    () => seriesData?.items.find((item) => item.id === activeSeriesId),
    [seriesData, activeSeriesId],
  );

  const categoryId = series?.categoryId;
  const categoryPath = useMemo(() => {
    if (!categoryId || !categories) return [];
    const byId = new Map(categories.map((category) => [category.id, category]));
    const path: string[] = [];
    let current = byId.get(categoryId);
    let guard = 0;
    while (current && guard < 12) {
      path.unshift(current.name);
      current = current.parentId ? byId.get(current.parentId) : undefined;
      guard += 1;
    }
    return path;
  }, [categories, categoryId]);

  const stats = useMemo(() => {
    const list = images || [];
    const done = list.filter((image) => image.status === "completed").length;
    const cost = list.reduce((sum, image) => sum + (image.cost || 0), 0);
    const tokens = list.reduce(
      (sum, image) => sum + (image.usage?.totalTokenCount || 0),
      0,
    );
    return { total: list.length, done, cost, tokens };
  }, [images]);

  const meta = [
    series?.author && `by ${series.author}`,
    series?.group,
    series?.originalTitle,
  ].filter(Boolean) as string[];

  return (
    <header className="sticky top-0 z-(--z-bar) flex h-12 shrink-0 items-center gap-3 border-b border-line bg-page px-3 sm:px-4">
      <IconButton
        label="Open series list"
        className="md:hidden"
        onClick={() => toggleSidebar(true)}
      >
        <MenuIcon />
      </IconButton>

      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-sm">
        {categoryPath.map((name) => (
          <React.Fragment key={name}>
            <span className="hidden truncate text-ink-2 sm:inline">{name}</span>
            <span aria-hidden="true" className="hidden text-ink-3 sm:inline">
              /
            </span>
          </React.Fragment>
        ))}
        <span className="truncate font-semibold text-ink" aria-current="page">
          {series ? series.name : "No series selected"}
        </span>
      </nav>

      {meta.length > 0 && (
        <p className="hidden min-w-0 truncate text-[13px] text-ink-3 lg:block">
          {meta.join(" · ")}
        </p>
      )}

      <div className="ml-auto flex items-center gap-2">
        {series && stats.total > 0 && (
          <Mono
            className="hidden text-xs text-ink-3 md:inline"
            title={`${formatInt(stats.tokens)} tokens used`}
          >
            {stats.done}/{stats.total} pages · {formatCost(stats.cost)}
          </Mono>
        )}

        <SegmentedControl
          label="Workspace mode"
          size="sm"
          value={isViewOnly ? "read" : "edit"}
          onChange={(value) => setViewOnly(value === "read")}
          options={[
            { value: "edit", label: "Edit", icon: <PencilLine /> },
            { value: "read", label: "Read", icon: <BookOpen /> },
          ]}
        />

        <IconButton
          label={theme === "light" ? "Switch to dark theme" : "Switch to light theme"}
          size="sm"
          onClick={() => setTheme(theme === "light" ? "dark" : "light")}
        >
          {theme === "light" ? <Moon /> : <Sun />}
        </IconButton>
      </div>
    </header>
  );
};

export default React.memo(DocumentBar);
