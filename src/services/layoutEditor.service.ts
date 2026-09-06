import { PageLayout } from "@/layout/types";
import { UsageMetadata } from "@/types";

/** Client calls for the page layout editor. */

const parse = async <T>(response: Response, fallback: string): Promise<T> => {
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(data.error || fallback);
  return data;
};

export interface LayoutResponse {
  layout: PageLayout;
  origin: "stored" | "legacy" | "empty";
  layoutVersion: number;
  hasLegacyRender: boolean;
}

export interface RenderResponse {
  layout: PageLayout;
  key: string;
  url: string;
  width: number;
  height: number;
  applied: boolean;
}

export interface TranslateTextResponse {
  layout: PageLayout;
  usage: UsageMetadata;
  cost: number;
}

export const fetchPageLayout = (imageId: string) =>
  fetch(`/api/pages/${encodeURIComponent(imageId)}/layout`, {
    cache: "no-store",
    credentials: "same-origin",
  }).then((response) => parse<LayoutResponse>(response, "Layout could not be loaded"));

export const savePageLayout = (imageId: string, layout: PageLayout) =>
  fetch(`/api/pages/${encodeURIComponent(imageId)}/layout`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ layout }),
  }).then((response) => parse<{ layout: PageLayout }>(response, "Layout could not be saved"));

export const renderPageLayout = (imageId: string, layout: PageLayout, apply: boolean) =>
  fetch(`/api/pages/${encodeURIComponent(imageId)}/render`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ layout, apply }),
  }).then((response) => parse<RenderResponse>(response, "Render failed"));

export const translateLayoutText = (
  imageId: string,
  layout: PageLayout,
  regionIds?: string[],
) =>
  fetch(`/api/pages/${encodeURIComponent(imageId)}/translate-text`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ layout, regionIds }),
  }).then((response) => parse<TranslateTextResponse>(response, "Translation failed"));
