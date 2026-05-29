# Venice Forge Theme System

> Scope: Complete token-based theming architecture, live theme editor, FOUC prevention, and WCAG AA contrast compliance.
> Implemented: 2026-05-28
> Commit: `715fa1d`

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Token Reference](#token-reference)
4. [Built-in Themes](#built-in-themes)
5. [ThemeMaker UI](#thememaker-ui)
6. [Persistence & Lifecycle](#persistence--lifecycle)
7. [Accessibility](#accessibility)
8. [Adding a New Theme](#adding-a-new-theme)
9. [File Inventory](#file-inventory)
10. [Migration Notes](#migration-notes)

---

## Overview

Venice Forge uses a **semantic token-based theme system** built on Tailwind CSS v4 CSS variables. Every color, border, shadow, and focus ring in the UI derives from a centralized set of 17 semantic tokens mapped to CSS custom properties. This enables:

- **Built-in themes:** Forge Graphite (dark), Forge Daylight (light), Forge Copper (dark).
- **Custom themes:** Users can define every token via the in-app ThemeMaker.
- **Live preview:** Changes apply immediately without reload.
- **Persistent storage:** Canonical settings live in encrypted IndexedDB; a lightweight `localStorage` bootstrap cache prevents FOUC on startup.
- **WCAG AA compliance:** Contrast ratios are verified programmatically for all built-in themes and warned for custom themes.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Theme State (React reducer)                                │
│  ├─ selectedThemeId: string                                 │
│  ├─ appearanceMode: "dark" | "light"                        │
│  └─ customTheme: Theme | null                               │
│                          │                                  │
│                          ▼                                  │
│  ┌──────────────────────────────────────────────┐          │
│  │  resolveInitialTheme(bootstrapCache?)         │          │
│  │  → picks builtin / custom / prefers-color     │          │
│  └──────────────────────────────────────────────┘          │
│                          │                                  │
│                          ▼                                  │
│  ┌──────────────────────────────────────────────┐          │
│  │  applyTheme(theme)                            │          │
│  │  → writes CSS variables to :root              │          │
│  │  → sets data-theme-mode on <html>             │          │
│  └──────────────────────────────────────────────┘          │
│                          │                                  │
│                          ▼                                  │
│  ┌──────────────────────────────────────────────┐          │
│  │  Tailwind v4 @theme                          │          │
│  │  → maps CSS vars to utility classes          │          │
│  │    (bg-bg, text-text-primary, border-border) │          │
│  └──────────────────────────────────────────────┘          │
└─────────────────────────────────────────────────────────────┘
```

### Two-Layer Persistence

| Layer | Storage | Content | Purpose |
|-------|---------|---------|---------|
| **Canonical** | IndexedDB (`StorageService.saveItem("settings", …)`) | Full `AppSettings` including `selectedThemeId`, `appearanceMode`, `customTheme` | Source of truth; encrypted at rest for `"settings"` store |
| **Bootstrap** | `localStorage['vf.theme.bootstrap']` | Color tokens + metadata only (no secrets) | FOUC prevention; read by inline `<script>` in `index.html` before React mounts |

After IndexedDB hydrates, `App.tsx` reconciles the canonical settings against the bootstrap cache. If they differ, the canonical theme is re-applied and the cache is refreshed.

---

## Token Reference

There are **17 semantic tokens**. Each maps to a CSS custom property (`--*`) and a Tailwind v4 utility class.

| Token | CSS Variable | Tailwind Class | Role |
|-------|-------------|----------------|------|
| `background` | `--bg` | `bg-bg` | App/workspace background |
| `surface` | `--surface` | `bg-surface` | Card/panel backgrounds |
| `surfaceElevated` | `--surface-elevated` | `bg-surface-elevated` | Elevated cards, inputs, modal backdrops |
| `border` | `--border` | `border-border` | Dividers, input borders |
| `textPrimary` | `--text-primary` | `text-text-primary` | Headings, primary body text |
| `textSecondary` | `--text-secondary` | `text-text-secondary` | Labels, secondary text |
| `textMuted` | `--text-muted` | `text-text-muted` | Placeholders, hints, disabled text |
| `accent` | `--accent` | `bg-accent`, `text-accent`, `border-accent` | Primary action color |
| `accentHover` | `--accent-hover` | `hover:bg-accent-hover` | Accent hover state |
| `accentForeground` | `--accent-fg` | `text-accent-fg` | Text on accent backgrounds (buttons, badges) |
| `success` | `--success` | `text-success`, `border-success` | Positive status, success toasts |
| `warning` | `--warning` | `text-warning`, `border-warning` | Cautions, warnings |
| `danger` | `--danger` | `text-danger`, `border-danger` | Errors, destructive actions |
| `info` | `--info` | `text-info` | Informational hints |
| `focusRing` | `--focus-ring` | `focus-visible:ring-focus-ring` | Keyboard focus outline |
| `overlay` | `--overlay` | `bg-overlay` | Modal/drawer backdrop scrim |
| `glow` | `--glow` | `shadow-glow` | Accent glow on active elements |

### Raw Hex Rule

Raw hex values are intentionally **scoped** to:
- `src/theme/themes.ts` — built-in palette definitions
- `src/index.css` — brand palette, button gradients, scrollbar rgba
- `src/components/ThemeMaker.tsx` — input fallback `#000000`
- Test fixtures

All component and module bodies consume **CSS variables / Tailwind semantic tokens** only.

---

## Built-in Themes

### Forge Graphite (dark) — `builtin-dark`
The default dark theme. Graphite base with Venice blue accent.

### Forge Daylight (light) — `builtin-light`
Light counterpart with a blue accent.

### Forge Copper (dark) — `builtin-copper`
Dark graphite base with a copper accent for warm contrast.

### Contrast Verification

| Pair | Graphite | Daylight | Copper |
|------|----------|----------|--------|
| textPrimary / background | **16.02:1** | **14.84:1** | — |
| textSecondary / surface | **7.08:1** | **6.39:1** | — |
| accentForeground / accent | **4.90:1** | **5.19:1** | **5.03:1** |

All ratios exceed WCAG AA thresholds (4.5:1 for normal text, 3:1 for large text).

---

## ThemeMaker UI

Located in **Settings → Appearance → Theme Maker** (`src/components/ThemeMaker.tsx`).

### Features
- **Theme selector:** Switch between Forge Graphite, Forge Daylight, Forge Copper, or Custom.
- **Token editor:** Each token has a synced native color picker and hex text input.
- **Hex validation:** Regex `/^#([0-9a-f]{3}|[0-9a-f]{6})$/i`; invalid input falls back to `#000000`.
- **Live preview:** `applyTheme(draftTheme)` updates the entire app in real time as you edit.
- **Contrast warnings:** Checks `textPrimary/bg`, `textSecondary/surface`, and `accentForeground/accent` against WCAG AA. Warnings render in an `aria-live="polite"` region.
- **Preview card:** A mini app mock-up (`ThemePreview.tsx`) showing background, sidebar, active tab, button, input, and alert tokens.

### Controls
- **Save custom theme:** Persists to canonical IndexedDB settings + refreshes bootstrap cache.
- **Reset custom theme:** Reverts editor to last saved custom theme.
- **Restore defaults:** Switches to Forge Graphite and clears the custom theme.

---

## Persistence & Lifecycle

### Startup (FOUC Prevention)

1. Browser parses `index.html`.
2. Inline `<script>` runs before paint:
   - Reads `localStorage.getItem('vf.theme.bootstrap')`.
   - If valid, applies CSS variables directly to `:root`.
   - If missing/invalid, falls back to Forge Graphite (dark) or Forge Daylight (light) based on `prefers-color-scheme`.
3. React mounts; `App.tsx` bootstraps.

### Hydration

1. `App.tsx` opens IndexedDB via `StorageService.openDB()`.
2. Fetches settings with `getItemsWithMeta("settings")`.
3. Finds record `id === "app-settings"`.
4. Dispatches `SET_SETTINGS` with stored settings (including theme fields).
5. Post-dispatch `useEffect` reads `state.settings.selectedThemeId`, `appearanceMode`, `customTheme` → calls `applyTheme()`.

### Reconciliation

A separate `useEffect` in `App.tsx` compares canonical settings to the bootstrap cache. If drifted:
- Re-applies the canonical theme.
- Re-writes `localStorage['vf.theme.bootstrap']` with a colors-only snapshot.

### Save

A debounced (500 ms) `useEffect` on `state.settings` changes calls:
```ts
StorageService.saveItem("settings", {
  id: "app-settings",
  value: state.settings,
  timestamp: Date.now(),
});
```

---

## Accessibility

- **Keyboard focus:** All interactives use `focus-visible:ring-2 focus-visible:ring-focus-ring` with `--focus-ring` token.
- **Reduced motion:** `src/index.css` includes `@media (prefers-reduced-motion: reduce)` rules.
- **Aria-live:** Existing `aria-live="polite"` regions (offline banner, status block, toast host, chat module, batch module, image generation form) were preserved. ThemeMaker adds an additional `aria-live="polite"` region for contrast warnings.
- **Color independence:** UI does not rely on color alone; status chips combine color tokens with border and background patterns.

---

## Adding a New Theme

### Option A: Built-in Theme

1. Open `src/theme/themes.ts`.
2. Add a new `Theme` object:
   ```ts
   export const BUILTIN_OCEAN: Theme = {
     id: "builtin-ocean",
     name: "Forge Ocean",
     mode: "dark",
     tokens: { /* 17 tokens */ },
   };
   ```
3. Export it from `src/theme/index.ts`.
4. Add it to the theme list in `ThemeMaker.tsx`.
5. Update the fallback map in `index.html` bootstrap script.
6. Run contrast verification: `npx tsx -e "import {contrastRatio} from './src/theme/contrast'; console.log(contrastRatio('#fff', '#0a0a0a'));"`.
7. Update this document.

### Option B: Custom Theme at Runtime

Users create custom themes via the ThemeMaker UI. No code changes required.

---

## File Inventory

### New Files

| File | Purpose |
|------|---------|
| `src/theme/themeTypes.ts` | Type contracts (`ThemeMode`, `ThemeTokens`, `Theme`, `ThemeState`) |
| `src/theme/themes.ts` | Built-in palette definitions |
| `src/theme/applyTheme.ts` | Maps tokens to CSS variables + resolves initial theme |
| `src/theme/contrast.ts` | WCAG luminance and contrast ratio utilities |
| `src/theme/fallbacks.ts` | Shared fallback constant (`#000000`) for validation |
| `src/theme/index.ts` | Barrel export |
| `src/components/ThemeMaker.tsx` | Theme editor UI |
| `src/components/ThemePreview.tsx` | Mini preview card |

### Modified Files (Theming Impact)

| File | Change |
|------|--------|
| `src/types/app.ts` | Extended `AppSettings` with theme fields |
| `src/state/appReducer.ts` | Added theme fields to `initialState.settings` and `SET_SETTINGS` whitelist |
| `src/index.css` | Expanded `:root` vars, `@theme` semantic colors, `.btn` system, `prefers-reduced-motion` |
| `index.html` | Inline FOUC-prevention bootstrap script |
| `src/App.tsx` | Theme hydration/reconciliation effects; reskinned shell |
| `src/components/TabButton.tsx` | Token-based active/inactive states |
| `src/components/Chip.tsx` | Token-based status chips |
| `src/components/ToastHost.tsx` | Token-based toast variants |
| `src/components/StatusBlock.tsx` | Token-based status indicators |
| `src/components/ErrorBoundary.tsx` | Token-based error UI |
| `src/components/ConfirmModal.tsx` | Token-based modal |
| `src/components/Field.tsx` | Token-based form field |
| `src/components/CollapsibleSection.tsx` | Token-based collapsible |
| `src/components/ModelSelect.tsx` | Token-based dropdown |
| `src/components/DiagnosticsPreview.tsx` | Token-based preview |
| `src/components/ImageGenerationForm.tsx` | Token-based form |
| `src/components/ImageGenerationPreview.tsx` | Token-based preview |
| `src/components/ImageActionModal.tsx` | Token-based modal |
| `src/modules/SettingsModule.tsx` | Integrated ThemeMaker; reskinned settings UI |
| `src/modules/ChatModule.tsx` | Reskinned chat UI |
| `src/modules/BatchModule.tsx` | Reskinned batch UI |
| `src/modules/SearchScrapeModule.tsx` | Reskinned research UI |
| `src/modules/GalleryModule.tsx` | Reskinned gallery UI |
| `src/modules/ImageModule.tsx` | Reskinned image UI |
| `src/modules/ModelsModule.tsx` | Reskinned models UI |
| `src/modules/DiagnosticsModule.tsx` | Reskinned diagnostics UI |

---

## Migration Notes

### For Contributors

- **No `tailwind.config`:** Tailwind v4 is CSS-first. Add new semantic colors to the `@theme` block in `src/index.css`, not a JS config.
- **No raw hex in components:** If you need a new color, add it as a token. If it is one-off, justify it in the PR. The existing exceptions are intentional and scoped.
- **Test contrast:** If you change a built-in palette, run the contrast checks. The minimum acceptable ratio is 4.5:1 for text-on-background pairs.

### For Users Upgrading from Pre-Theme Versions

- On first launch after upgrade, the app detects no theme settings and defaults to **Forge Graphite (dark)**.
- Existing settings (API key, model defaults, etc.) are preserved.
- The old `theme` string field (if present) is migrated gracefully; the new fields `selectedThemeId`, `appearanceMode`, and `customTheme` take precedence.

---

## Further Reading

- [`docs/ABOUT.md`](ABOUT.md) — Architecture and goals
- [`docs/FAQ.md`](FAQ.md) — Frequently asked questions (includes theme Q&A)
- [`CHANGELOG.md`](../CHANGELOG.md) — Version history
- [`src/theme/`](../src/theme/) — Source code
