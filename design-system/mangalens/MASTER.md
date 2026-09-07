# MangaLens Design System — "Paper & Ink"

Global source of truth for the UI. Page-specific overrides live in `pages/`.
Decided 2026-09-07. Dark theme is the default; light theme is fully defined.

## Concept

Manga is ink on paper. The workspace is a quiet, opaque, well-edged surface;
the one accent is **non-photo blue**, the pencil colour mangaka sketch with
because scanners do not pick it up. In the app it marks exactly that layer:
detected regions, selections, focus rings, the running stage. Red (朱, the
editor's correction pen) is reserved for errors and destructive actions.

## Tokens

All tokens are CSS variables in `src/app/globals.css`, exposed to Tailwind via
`@theme inline`. Components never use raw hex or raw Tailwind colours
(`slate-*`, `white/…`, `red-*`). Use the semantic names below.

### Colour

| Token (Tailwind) | Dark (default) | Light | Role |
|---|---|---|---|
| `paper` | `#141518` | `#F2F2EE` | app ground |
| `page` | `#1C1D21` | `#FFFFFF` | panels, cards, bars |
| `page-2` | `#24262B` | `#F5F5F2` | inputs, hover rows, nested surfaces |
| `ink` | `#ECEBE6` | `#1A1B1E` | primary text |
| `ink-2` | `#A9ABA6` | `#5A5D64` | secondary text |
| `ink-3` | `#7C7E7A` | `#8B8E95` | tertiary text, labels, disabled |
| `line` | `#2E3035` | `#DAD9D2` | borders (must be visible) |
| `line-2` | `#26282C` | `#E9E8E2` | subtle dividers, skeletons |
| `action` | `#6CC4DC` | `#0B7A9B` | the single accent: buttons, links, focus, running |
| `action-hover` | `#86D2E6` | `#096A87` | |
| `on-action` | `#0F1A1E` | `#FFFFFF` | text on accent |
| `npb` | `rgba(108,196,220,.16)` | `rgba(167,219,234,.35)` | selection / region fill |
| `shu` / `shu-soft` | `#E0655A` | `#B8382A` | error, destructive |
| `ok` / `ok-soft` | `#63B983` | `#2F7D4F` | completed |
| `warn` / `warn-soft` | `#D9A441` | `#B07A12` | queued, waiting, review |
| `theater` | `#0E0F11` | `#0E0F11` | reader ground, always dark |
| `scrim` | `rgba(8,9,11,.72)` | `rgba(20,21,24,.55)` | modal backdrop |

Semantic state colours (`ok`, `warn`, `shu`) are not accents. Use them only
to encode state, always with a label or icon, never colour alone.

### Typography

- **IBM Plex Sans** for UI (`font-sans`), **IBM Plex Mono** for numbers and
  identifiers (`font-mono`): page numbers, counts, coordinates, durations,
  costs, tokens, job ids. Use `tabular-nums` where digits align.
- Scale: 12 · 13 · 14 · 16 · 20 · 24. UI base is 14px, secondary 13px,
  captions 12px. **Nothing below 12px.**
- Weights: 400 body, 500 labels/buttons, 600 headings. No 700+, no italics
  as decoration.
- Section labels: `font-mono text-xs uppercase tracking-[0.07em] text-ink-3`.
  Everything else is sentence case.

### Shape and surface

- Radius: `rounded-chip` (4px) chips/badges, `rounded-control` (6px)
  buttons/inputs, `rounded-panel` (8px) cards/modals. Nothing else.
- Surfaces are **opaque**. `backdrop-blur` only on the modal scrim.
- Separation comes from `border-line`, not shadows. One shadow token,
  `shadow-pop`, for popovers and modals only.
- No gradients, no glow, no `text-shadow`.

### Spacing and layout

- Scale: 4 · 8 · 12 · 16 · 24 · 32.
- Sidebar 264px (56px collapsed). Layout-editor inspector 320px.
- Control heights: 28 (sm) · 32 (md) · 36 (lg). Icon buttons are square.
- z-index scale (CSS vars): `--z-bar 30`, `--z-sidebar 40`, `--z-overlay 100`,
  `--z-lightbox 110`, `--z-fullscreen 120`, `--z-confirm 130`, `--z-toast 200`.

### Motion

- Hover/press 120ms, panels and modals 200ms, `ease-out`.
- No scale/rotate on hover. Press feedback: background/border change only.
- Modals: fade + scale from 0.98. Toasts: slide from the right.
- `prefers-reduced-motion` disables all of it.

### Icons

- **lucide-react only**, 16px at stroke 1.5 (`className="h-4 w-4"`), 14px
  inside `sm` controls. Font Awesome is removed. No emoji as icons.
- Decorative icons beside text get `aria-hidden`. Icon-only buttons get
  `aria-label` (the `IconButton` primitive enforces this).

## Primitives (`src/components/ui/`)

`Button`, `IconButton`, `Field` + `Input`/`Textarea`/`Select`/`Checkbox`/`Switch`,
`SegmentedControl`, `Chip`, `StageBar`, `ProgressBar`, `Skeleton`, `Spinner`,
`EmptyState`, `Modal`, `FullscreenShell`, `Menu`, `Kbd`, `SectionLabel`.

Every modal uses `Modal` or `FullscreenShell`. Every button uses `Button` or
`IconButton`. Every input uses `Field` + the input primitives.

## Structure

- **Document bar** (top of the workspace): breadcrumb `Category / Series`,
  quiet mono meta, Edit/Read switch, and the single primary action.
- **Sidebar**: series tree, search, filter, **queue panel** with running jobs,
  footer with Categories / Settings / Backup / Sign out.
- **Page cards** carry a three-segment **stage bar**: Detect → Translate →
  Render. Green done, accent running, amber queued, red failed.
- **Reader** always renders on `theater`, with a slim auto-hiding bar.
- One primary CTA per screen. Destructive actions sit apart, in `danger`.

## Anti-patterns (do not reintroduce)

`font-black`, `tracking-tighter/widest` on body text, `text-[10px]` and
smaller, `uppercase` labels outside section headers, `rounded-2xl/3xl/[…rem]`,
`glass`, `shadow-glow`, `text-glow`, `backdrop-blur` on panels,
`bg-gradient-*`, hover `scale-*`/`rotate-*`, `bg-slate-*`, `bg-white/…`,
`transition-all`, mixed languages (UI is English), Font Awesome classes.
