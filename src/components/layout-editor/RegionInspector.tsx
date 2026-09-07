import { FONT_FAMILIES, FONT_FAMILY_IDS, FontFamilyId } from "@/layout/fonts";
import { RegionPlan } from "@/layout/plan";
import { Region, REGION_KINDS, RegionKind } from "@/layout/types";
import {
  ArrowDown,
  ArrowUp,
  Languages,
  Lock,
  RefreshCw,
  Trash2,
  Unlock,
} from "lucide-react";
import React from "react";
import {
  Button,
  Chip,
  Field,
  IconButton,
  Input,
  Mono,
  SectionLabel,
  Select,
  Textarea,
} from "@/components/ui";
import type { DragTarget } from "./EditorCanvas";

interface Props {
  region: Region;
  plan?: RegionPlan;
  dragTarget: DragTarget;
  busy: boolean;
  onPatch: (patch: Partial<Region>) => void;
  onStylePatch: (patch: Partial<Region["style"]>) => void;
  onKindChange: (kind: RegionKind) => void;
  onMaskType: (type: "auto" | "none" | "rect" | "ellipse") => void;
  onResetArea: () => void;
  onDragTarget: (target: DragTarget) => void;
  onTranslate: () => void;
  onMove: (direction: -1 | 1) => void;
  onDelete: () => void;
}

const KIND_LABELS: Record<RegionKind, string> = {
  speech: "Speech",
  thought: "Thought",
  caption: "Caption",
  sfx: "Sound effect",
  label: "Label",
};

const colorInputClass =
  "h-8 w-10 shrink-0 cursor-pointer rounded-control border border-line bg-page-2 p-0.5";

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="flex flex-col gap-3 rounded-panel border border-line p-3">
    <SectionLabel>{title}</SectionLabel>
    {children}
  </section>
);

/** Toggle chip: accent tone, pressed state through `active`. */
const Toggle: React.FC<{ on: boolean; label: string; onChange: (value: boolean) => void }> = ({ on, label: text, onChange }) => (
  <Chip tone="accent" active={on} onClick={() => onChange(!on)}>
    {text}
  </Chip>
);

const NumberField: React.FC<{
  label: string;
  value: number;
  step?: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
}> = ({ label: text, value, step = 1, min, max, onChange }) => (
  <Field label={text}>
    {(ids) => (
      <Input
        id={ids.id}
        type="number"
        mono
        value={Number.isFinite(value) ? Math.round(value * 100) / 100 : 0}
        step={step}
        min={min}
        max={max}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next)) onChange(next);
        }}
      />
    )}
  </Field>
);

const RegionInspector: React.FC<Props> = ({
  region,
  plan,
  dragTarget,
  busy,
  onPatch,
  onStylePatch,
  onKindChange,
  onMaskType,
  onResetArea,
  onDragTarget,
  onTranslate,
  onMove,
  onDelete,
}) => {
  const { style } = region;
  const info = region.render;
  const maskType = region.mask.type;
  const overflow = plan?.info.overflow ?? info?.overflow;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <SectionLabel>Region</SectionLabel>
          <p className="text-sm font-medium text-ink">
            {region.order + 1}. {KIND_LABELS[region.kind]}
          </p>
          <Mono className="block truncate text-xs text-ink-3">{region.source}</Mono>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <IconButton label="Move up (reading order)" onClick={() => onMove(-1)}>
            <ArrowUp />
          </IconButton>
          <IconButton label="Move down (reading order)" onClick={() => onMove(1)}>
            <ArrowDown />
          </IconButton>
          <IconButton
            label={region.locked ? "Unlock" : "Lock"}
            title={
              region.locked
                ? "Locked: automatic translation will not overwrite this region"
                : "Lock: automatic translation will not overwrite this region"
            }
            active={!!region.locked}
            onClick={() => onPatch({ locked: !region.locked })}
          >
            {region.locked ? <Lock /> : <Unlock />}
          </IconButton>
          <IconButton label="Delete region" variant="danger" onClick={onDelete}>
            <Trash2 />
          </IconButton>
        </div>
      </div>

      <Section title="Text">
        <Field label="Kind" hint="Changing the kind applies its default style.">
          {(ids) => (
            <Select id={ids.id} value={region.kind} onChange={(event) => onKindChange(event.target.value as RegionKind)}>
              {REGION_KINDS.map((kind) => (
                <option key={kind} value={kind}>{KIND_LABELS[kind]}</option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Translation">
          {(ids) => (
            <Textarea
              id={ids.id}
              className="min-h-[88px] resize-y"
              value={region.translatedText}
              onChange={(event) => onPatch({ translatedText: event.target.value })}
            />
          )}
        </Field>
        <Field label="Source text">
          {(ids) => (
            <Textarea
              id={ids.id}
              className="min-h-14 resize-y text-ink-2"
              value={region.sourceText}
              onChange={(event) => onPatch({ sourceText: event.target.value })}
            />
          )}
        </Field>
        <Button
          variant="secondary"
          full
          icon={<Languages />}
          disabled={busy || !region.sourceText.trim()}
          onClick={onTranslate}
        >
          Translate this region
        </Button>
        <div className="flex flex-wrap gap-2">
          <Toggle on={!!region.hidden} label="Hidden" onChange={(value) => onPatch({ hidden: value })} />
          <Toggle on={style.uppercase} label="Uppercase" onChange={(value) => onStylePatch({ uppercase: value })} />
        </div>
      </Section>

      <Section title="Placement">
        <Field
          label="Drag target"
          hint="Text area is where the translation is placed; source box is where the original text is removed. Changing the source box recomputes the mask."
        >
          <div className="flex flex-wrap gap-2">
            <Toggle on={dragTarget === "area"} label="Text area" onChange={() => onDragTarget("area")} />
            <Toggle on={dragTarget === "textBox"} label="Source box" onChange={() => onDragTarget("textBox")} />
          </div>
        </Field>
        <Field label="Position">
          {(ids) => (
            <Select id={ids.id} value={region.placement} onChange={(event) => onPatch({ placement: event.target.value as Region["placement"] })}>
              <option value="inside">Inside the balloon</option>
              <option value="below">Label below</option>
              <option value="above">Label above</option>
            </Select>
          )}
        </Field>
        {region.textArea && (
          <Button variant="secondary" size="sm" full onClick={onResetArea}>
            Reset text area to automatic
          </Button>
        )}
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="Padding" value={style.padding} step={0.01} min={0} max={0.45} onChange={(value) => onStylePatch({ padding: value })} />
          <NumberField label="Rotation (°)" value={style.rotation} step={1} min={-180} max={180} onChange={(value) => onStylePatch({ rotation: value })} />
        </div>
        <Field label="Wrap shape">
          {(ids) => (
            <Select id={ids.id} value={style.shape} onChange={(event) => onStylePatch({ shape: event.target.value as Region["style"]["shape"] })}>
              <option value="auto">Automatic (follows mask)</option>
              <option value="ellipse">Ellipse</option>
              <option value="rect">Rectangle</option>
            </Select>
          )}
        </Field>
      </Section>

      <Section title="Type">
        <Field label="Font">
          {(ids) => (
            <Select id={ids.id} value={style.fontFamily} onChange={(event) => onStylePatch({ fontFamily: event.target.value as FontFamilyId })}>
              {FONT_FAMILY_IDS.map((id) => (
                <option key={id} value={id}>{FONT_FAMILIES[id].label}</option>
              ))}
            </Select>
          )}
        </Field>
        <div className="flex flex-wrap gap-2">
          <Toggle on={style.weight === "bold"} label="Bold" onChange={(value) => onStylePatch({ weight: value ? "bold" : "regular" })} />
          <Toggle on={style.italic} label="Italic" onChange={(value) => onStylePatch({ italic: value })} />
          <Toggle on={style.fontSize === "auto"} label="Auto size" onChange={(value) => onStylePatch({ fontSize: value ? "auto" : Math.round(info?.fontSize || plan?.info.fontSize || 32) })} />
        </div>
        {style.fontSize !== "auto" && (
          <NumberField label="Size (px)" value={style.fontSize} step={1} min={4} max={2000} onChange={(value) => onStylePatch({ fontSize: value })} />
        )}
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="Line height" value={style.lineHeight} step={0.02} min={0.6} max={3} onChange={(value) => onStylePatch({ lineHeight: value })} />
          <NumberField label="Letter spacing (em)" value={style.letterSpacing} step={0.01} min={-0.2} max={1} onChange={(value) => onStylePatch({ letterSpacing: value })} />
        </div>
        <Field label="Alignment">
          {(ids) => (
            <Select id={ids.id} value={style.align} onChange={(event) => onStylePatch({ align: event.target.value as Region["style"]["align"] })}>
              <option value="center">Center</option>
              <option value="left">Left</option>
              <option value="right">Right</option>
            </Select>
          )}
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Text colour">
            {(ids) => (
              <div className="flex items-center gap-2">
                <Select
                  id={ids.id}
                  className="min-w-0 flex-1"
                  value={style.color === "auto" ? "auto" : "custom"}
                  onChange={(event) => onStylePatch({ color: event.target.value === "auto" ? "auto" : (info?.textColor || "#111111") })}
                >
                  <option value="auto">Automatic</option>
                  <option value="custom">Custom</option>
                </Select>
                {style.color !== "auto" && (
                  <input
                    type="color"
                    aria-label="Custom text colour"
                    value={style.color}
                    onChange={(event) => onStylePatch({ color: event.target.value })}
                    className={colorInputClass}
                  />
                )}
              </div>
            )}
          </Field>
          <Field label="Stroke">
            {(ids) => (
              <div className="flex items-center gap-2">
                <Select
                  id={ids.id}
                  className="min-w-0 flex-1"
                  value={style.strokeColor === "auto" ? "auto" : style.strokeColor === "none" ? "none" : "custom"}
                  onChange={(event) =>
                    onStylePatch({
                      strokeColor: event.target.value === "auto" ? "auto" : event.target.value === "none" ? "none" : "#ffffff",
                    })
                  }
                >
                  <option value="auto">Automatic</option>
                  <option value="none">None</option>
                  <option value="custom">Custom</option>
                </Select>
                {style.strokeColor !== "auto" && style.strokeColor !== "none" && (
                  <input
                    type="color"
                    aria-label="Custom stroke colour"
                    value={style.strokeColor}
                    onChange={(event) => onStylePatch({ strokeColor: event.target.value })}
                    className={colorInputClass}
                  />
                )}
              </div>
            )}
          </Field>
        </div>
        {style.strokeColor !== "none" && (
          <NumberField label="Stroke width (em)" value={style.strokeWidth} step={0.01} min={0} max={1} onChange={(value) => onStylePatch({ strokeWidth: value })} />
        )}
      </Section>

      <Section title="Cleaning">
        <Field label="Mask">
          {(ids) => (
            <Select
              id={ids.id}
              value={maskType === "polygon" ? "polygon" : maskType}
              onChange={(event) => {
                const value = event.target.value;
                if (value === "polygon") return;
                onMaskType(value as "auto" | "none" | "rect" | "ellipse");
              }}
            >
              <option value="auto">Automatic (inside balloon)</option>
              {maskType === "polygon" && <option value="polygon">Detected polygon</option>}
              <option value="rect">Rectangle (text area)</option>
              <option value="ellipse">Ellipse (text area)</option>
              <option value="none">No cleaning</option>
            </Select>
          )}
        </Field>
        {maskType !== "auto" && (
          <Button variant="secondary" size="sm" full icon={<RefreshCw />} onClick={() => onMaskType("auto")}>
            Recompute mask
          </Button>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Field label="Fill">
            {(ids) => (
              <Select
                id={ids.id}
                value={region.fill.mode}
                onChange={(event) => onPatch({ fill: { ...region.fill, mode: event.target.value as Region["fill"]["mode"], color: event.target.value === "color" ? region.fill.color || info?.fillColor || "#ffffff" : region.fill.color } })}
              >
                <option value="auto">Sample from background</option>
                <option value="color">Solid colour</option>
                <option value="none">Paint nothing</option>
              </Select>
            )}
          </Field>
          {region.fill.mode === "color" && (
            <Field label="Colour">
              {(ids) => (
                <input
                  id={ids.id}
                  type="color"
                  value={region.fill.color || "#ffffff"}
                  onChange={(event) => onPatch({ fill: { mode: "color", color: event.target.value } })}
                  className={`${colorInputClass} w-full`}
                />
              )}
            </Field>
          )}
        </div>
      </Section>

      {(info || plan) && (
        <Section title="Last render">
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
            <dt className="text-ink-3">Font size</dt>
            <dd><Mono className="text-ink">{Math.round(plan?.info.fontSize || info?.fontSize || 0)} px</Mono></dd>
            <dt className="text-ink-3">Lines</dt>
            <dd><Mono className="text-ink">{plan?.info.lines.length ?? info?.lines.length ?? 0}</Mono></dd>
            <dt className="text-ink-3">Fit</dt>
            <dd><Mono className={overflow ? "text-shu" : "text-ok"}>{overflow ? "Overflows" : "Fits"}</Mono></dd>
            {info?.maskConfidence !== undefined && (
              <>
                <dt className="text-ink-3">Mask confidence</dt>
                <dd><Mono className={info.maskConfidence < 0.4 ? "text-warn" : "text-ink"}>{info.maskConfidence.toFixed(2)}</Mono></dd>
              </>
            )}
          </dl>
          {info?.maskDiagnostics?.length ? (
            <ul className="flex flex-col gap-0.5 text-xs leading-snug text-warn">
              {info.maskDiagnostics.map((line, index) => (
                <li key={index}>{line}</li>
              ))}
            </ul>
          ) : null}
        </Section>
      )}
    </div>
  );
};

export default RegionInspector;
