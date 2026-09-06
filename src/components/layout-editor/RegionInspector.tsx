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
  speech: "Konuşma",
  thought: "Düşünce",
  caption: "Anlatım kutusu",
  sfx: "Ses efekti",
  label: "Etiket",
};

const field = "w-full rounded-xl border border-border-muted bg-surface-raised/60 px-3 py-2 text-xs text-text-main outline-none focus:ring-2 ring-primary/50";
const label = "mb-1 block text-[9px] font-black uppercase tracking-widest text-text-dark";

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="space-y-3 rounded-2xl border border-border-muted bg-surface-raised/30 p-3">
    <p className="text-[9px] font-black uppercase tracking-[0.2em] text-primary">{title}</p>
    {children}
  </div>
);

const Toggle: React.FC<{ on: boolean; label: string; onChange: (value: boolean) => void }> = ({ on, label: text, onChange }) => (
  <button
    type="button"
    onClick={() => onChange(!on)}
    className={`rounded-lg border px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider transition-all ${
      on ? "border-primary/60 bg-primary/15 text-primary" : "border-border-muted bg-surface-raised/40 text-text-dark"
    }`}
  >
    {text}
  </button>
);

const NumberField: React.FC<{
  label: string;
  value: number;
  step?: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
}> = ({ label: text, value, step = 1, min, max, onChange }) => (
  <div>
    <span className={label}>{text}</span>
    <input
      type="number"
      className={field}
      value={Number.isFinite(value) ? Math.round(value * 100) / 100 : 0}
      step={step}
      min={min}
      max={max}
      onChange={(event) => {
        const next = Number(event.target.value);
        if (Number.isFinite(next)) onChange(next);
      }}
    />
  </div>
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

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-[9px] font-black uppercase tracking-widest text-text-dark">Bölge</p>
          <p className="text-sm font-bold text-text-main">
            {region.order + 1}. {KIND_LABELS[region.kind]}
            <span className="ml-2 text-[9px] font-mono text-text-dark">{region.source}</span>
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" title="Yukarı taşı (okuma sırası)" onClick={() => onMove(-1)} className="rounded-lg border border-border-muted p-1.5 text-text-dark hover:text-primary">
            <ArrowUp className="h-3.5 w-3.5" />
          </button>
          <button type="button" title="Aşağı taşı" onClick={() => onMove(1)} className="rounded-lg border border-border-muted p-1.5 text-text-dark hover:text-primary">
            <ArrowDown className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title={region.locked ? "Kilidi aç" : "Kilitle: otomatik çeviri bu bölgeyi ezmez"}
            onClick={() => onPatch({ locked: !region.locked })}
            className={`rounded-lg border p-1.5 ${region.locked ? "border-amber-500/60 text-amber-400" : "border-border-muted text-text-dark hover:text-primary"}`}
          >
            {region.locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
          </button>
          <button type="button" title="Bölgeyi sil" onClick={onDelete} className="rounded-lg border border-border-muted p-1.5 text-text-dark hover:border-red-500/50 hover:text-red-400">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <Section title="Metin">
        <div>
          <span className={label}>Tür (varsayılan stil uygulanır)</span>
          <select className={field} value={region.kind} onChange={(event) => onKindChange(event.target.value as RegionKind)}>
            {REGION_KINDS.map((kind) => (
              <option key={kind} value={kind}>{KIND_LABELS[kind]}</option>
            ))}
          </select>
        </div>
        <div>
          <span className={label}>Çeviri</span>
          <textarea
            className={`${field} min-h-[88px] resize-y font-semibold`}
            value={region.translatedText}
            onChange={(event) => onPatch({ translatedText: event.target.value })}
          />
        </div>
        <div>
          <span className={label}>Kaynak metin</span>
          <textarea
            className={`${field} min-h-[56px] resize-y text-text-muted`}
            value={region.sourceText}
            onChange={(event) => onPatch({ sourceText: event.target.value })}
          />
        </div>
        <button
          type="button"
          disabled={busy || !region.sourceText.trim()}
          onClick={onTranslate}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-primary/40 bg-primary/10 py-2 text-[10px] font-black uppercase tracking-wider text-primary disabled:opacity-40"
        >
          <Languages className="h-3.5 w-3.5" /> Bu bölgeyi yeniden çevir
        </button>
        <div className="flex flex-wrap gap-2">
          <Toggle on={!!region.hidden} label="Gizli" onChange={(value) => onPatch({ hidden: value })} />
          <Toggle on={style.uppercase} label="Büyük harf" onChange={(value) => onStylePatch({ uppercase: value })} />
        </div>
      </Section>

      <Section title="Yerleşim">
        <div>
          <span className={label}>Sürükleme hedefi</span>
          <div className="flex gap-2">
            <Toggle on={dragTarget === "area"} label="Yazı alanı" onChange={() => onDragTarget("area")} />
            <Toggle on={dragTarget === "textBox"} label="Kaynak kutusu" onChange={() => onDragTarget("textBox")} />
          </div>
          <p className="mt-1 text-[9px] leading-relaxed text-text-dark">
            Yazı alanı çevirinin yerleştiği yer, kaynak kutusu silinecek orijinal metnin yeri. Kaynak kutusu değişince maske yeniden hesaplanır.
          </p>
        </div>
        <div>
          <span className={label}>Konum</span>
          <select className={field} value={region.placement} onChange={(event) => onPatch({ placement: event.target.value as Region["placement"] })}>
            <option value="inside">Baloncuğun içine</option>
            <option value="below">Altına etiket</option>
            <option value="above">Üstüne etiket</option>
          </select>
        </div>
        {region.textArea && (
          <button type="button" onClick={onResetArea} className="w-full rounded-xl border border-border-muted py-1.5 text-[10px] font-black uppercase tracking-wider text-text-dark hover:text-primary">
            Yazı alanını otomatiğe döndür
          </button>
        )}
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="İç boşluk" value={style.padding} step={0.01} min={0} max={0.45} onChange={(value) => onStylePatch({ padding: value })} />
          <NumberField label="Döndürme °" value={style.rotation} step={1} min={-180} max={180} onChange={(value) => onStylePatch({ rotation: value })} />
        </div>
        <div>
          <span className={label}>Sarma şekli</span>
          <select className={field} value={style.shape} onChange={(event) => onStylePatch({ shape: event.target.value as Region["style"]["shape"] })}>
            <option value="auto">Otomatik (maskeyi izler)</option>
            <option value="ellipse">Elips</option>
            <option value="rect">Dikdörtgen</option>
          </select>
        </div>
      </Section>

      <Section title="Yazı">
        <div>
          <span className={label}>Font</span>
          <select className={field} value={style.fontFamily} onChange={(event) => onStylePatch({ fontFamily: event.target.value as FontFamilyId })}>
            {FONT_FAMILY_IDS.map((id) => (
              <option key={id} value={id}>{FONT_FAMILIES[id].label}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap gap-2">
          <Toggle on={style.weight === "bold"} label="Kalın" onChange={(value) => onStylePatch({ weight: value ? "bold" : "regular" })} />
          <Toggle on={style.italic} label="İtalik" onChange={(value) => onStylePatch({ italic: value })} />
          <Toggle on={style.fontSize === "auto"} label="Otomatik boyut" onChange={(value) => onStylePatch({ fontSize: value ? "auto" : Math.round(info?.fontSize || plan?.info.fontSize || 32) })} />
        </div>
        {style.fontSize !== "auto" && (
          <NumberField label="Boyut (px)" value={style.fontSize} step={1} min={4} max={2000} onChange={(value) => onStylePatch({ fontSize: value })} />
        )}
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="Satır aralığı" value={style.lineHeight} step={0.02} min={0.6} max={3} onChange={(value) => onStylePatch({ lineHeight: value })} />
          <NumberField label="Harf aralığı (em)" value={style.letterSpacing} step={0.01} min={-0.2} max={1} onChange={(value) => onStylePatch({ letterSpacing: value })} />
        </div>
        <div>
          <span className={label}>Hizalama</span>
          <select className={field} value={style.align} onChange={(event) => onStylePatch({ align: event.target.value as Region["style"]["align"] })}>
            <option value="center">Ortalı</option>
            <option value="left">Sola</option>
            <option value="right">Sağa</option>
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <span className={label}>Yazı rengi</span>
            <div className="flex items-center gap-2">
              <select className={field} value={style.color === "auto" ? "auto" : "custom"} onChange={(event) => onStylePatch({ color: event.target.value === "auto" ? "auto" : (info?.textColor || "#111111") })}>
                <option value="auto">Otomatik</option>
                <option value="custom">Özel</option>
              </select>
              {style.color !== "auto" && (
                <input type="color" value={style.color} onChange={(event) => onStylePatch({ color: event.target.value })} className="h-8 w-10 shrink-0 cursor-pointer rounded-lg border border-border-muted bg-transparent" />
              )}
            </div>
          </div>
          <div>
            <span className={label}>Kontur</span>
            <div className="flex items-center gap-2">
              <select
                className={field}
                value={style.strokeColor === "auto" ? "auto" : style.strokeColor === "none" ? "none" : "custom"}
                onChange={(event) =>
                  onStylePatch({
                    strokeColor: event.target.value === "auto" ? "auto" : event.target.value === "none" ? "none" : "#ffffff",
                  })
                }
              >
                <option value="auto">Otomatik</option>
                <option value="none">Yok</option>
                <option value="custom">Özel</option>
              </select>
              {style.strokeColor !== "auto" && style.strokeColor !== "none" && (
                <input type="color" value={style.strokeColor} onChange={(event) => onStylePatch({ strokeColor: event.target.value })} className="h-8 w-10 shrink-0 cursor-pointer rounded-lg border border-border-muted bg-transparent" />
              )}
            </div>
          </div>
        </div>
        {style.strokeColor !== "none" && (
          <NumberField label="Kontur kalınlığı (em)" value={style.strokeWidth} step={0.01} min={0} max={1} onChange={(value) => onStylePatch({ strokeWidth: value })} />
        )}
      </Section>

      <Section title="Temizleme">
        <div>
          <span className={label}>Maske</span>
          <select
            className={field}
            value={maskType === "polygon" ? "polygon" : maskType}
            onChange={(event) => {
              const value = event.target.value;
              if (value === "polygon") return;
              onMaskType(value as "auto" | "none" | "rect" | "ellipse");
            }}
          >
            <option value="auto">Otomatik (baloncuk içi)</option>
            {maskType === "polygon" && <option value="polygon">Bulunan çokgen</option>}
            <option value="rect">Dikdörtgen (yazı alanı)</option>
            <option value="ellipse">Elips (yazı alanı)</option>
            <option value="none">Temizleme yok</option>
          </select>
        </div>
        {maskType !== "auto" && (
          <button type="button" onClick={() => onMaskType("auto")} className="flex w-full items-center justify-center gap-2 rounded-xl border border-border-muted py-1.5 text-[10px] font-black uppercase tracking-wider text-text-dark hover:text-primary">
            <RefreshCw className="h-3 w-3" /> Maskeyi yeniden hesapla
          </button>
        )}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <span className={label}>Dolgu</span>
            <select className={field} value={region.fill.mode} onChange={(event) => onPatch({ fill: { ...region.fill, mode: event.target.value as Region["fill"]["mode"], color: event.target.value === "color" ? region.fill.color || info?.fillColor || "#ffffff" : region.fill.color } })}>
              <option value="auto">Zeminden örnekle</option>
              <option value="color">Sabit renk</option>
              <option value="none">Boyama</option>
            </select>
          </div>
          {region.fill.mode === "color" && (
            <div>
              <span className={label}>Renk</span>
              <input type="color" value={region.fill.color || "#ffffff"} onChange={(event) => onPatch({ fill: { mode: "color", color: event.target.value } })} className="h-8 w-full cursor-pointer rounded-lg border border-border-muted bg-transparent" />
            </div>
          )}
        </div>
      </Section>

      {(info || plan) && (
        <Section title="Son render">
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]">
            <dt className="text-text-dark">Font boyutu</dt>
            <dd className="font-mono text-text-main">{Math.round(plan?.info.fontSize || info?.fontSize || 0)} px</dd>
            <dt className="text-text-dark">Satır</dt>
            <dd className="font-mono text-text-main">{plan?.info.lines.length ?? info?.lines.length ?? 0}</dd>
            <dt className="text-text-dark">Sığma</dt>
            <dd className={`font-mono ${(plan?.info.overflow ?? info?.overflow) ? "text-red-400" : "text-emerald-400"}`}>
              {(plan?.info.overflow ?? info?.overflow) ? "taşıyor" : "sığıyor"}
            </dd>
            {info?.maskConfidence !== undefined && (
              <>
                <dt className="text-text-dark">Maske güveni</dt>
                <dd className={`font-mono ${info.maskConfidence < 0.4 ? "text-amber-400" : "text-text-main"}`}>{info.maskConfidence.toFixed(2)}</dd>
              </>
            )}
          </dl>
          {info?.maskDiagnostics?.length ? (
            <ul className="space-y-0.5 text-[9px] leading-snug text-amber-300/80">
              {info.maskDiagnostics.map((line, index) => (
                <li key={index}>• {line}</li>
              ))}
            </ul>
          ) : null}
        </Section>
      )}
    </div>
  );
};

export default RegionInspector;
