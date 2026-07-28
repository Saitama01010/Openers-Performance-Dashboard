---
name: Openers Performance Dashboard
description: A compact, trustworthy operations console for role-scoped performance and import governance.
colors:
  midnight-rail: "#06152f"
  midnight-raised: "#0d2346"
  electric-blue: "#1f5eff"
  electric-blue-hover: "#154be0"
  electric-blue-soft: "#eef4ff"
  canvas: "#f5f7fb"
  surface: "#ffffff"
  surface-subtle: "#f8faff"
  ink: "#12213d"
  ink-muted: "#5c6b82"
  border: "#d7dfeb"
  border-strong: "#b9c6d8"
  success: "#0a8f64"
  success-soft: "#eaf9f3"
  warning: "#a56000"
  warning-soft: "#fff7e6"
  danger: "#b42318"
  danger-soft: "#fff0ee"
typography:
  headline:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(1.5rem, 2vw, 2rem)"
    fontWeight: 650
    lineHeight: 1.15
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 650
    lineHeight: 1.3
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "0.08em"
  numeric:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 650
    lineHeight: 1.1
rounded:
  sm: "6px"
  md: "8px"
  lg: "10px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  2xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.electric-blue}"
    textColor: "{colors.surface}"
    rounded: "{rounded.sm}"
    padding: "9px 14px"
    height: "40px"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "9px 14px"
    height: "40px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "{spacing.lg}"
  field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "8px 10px"
    height: "44px"
---

# Design System: Openers Performance Dashboard

## Overview

**Creative North Star: “The Operations Briefing”**

The product should feel like a well-prepared morning operating brief: compact, ordered, calm, and immediately useful. A deep midnight rail anchors identity and navigation while a bright working canvas gives real data maximum legibility. Thin blue-gray borders, disciplined alignment, and a restrained electric-blue accent create the polished enterprise character visible in the supplied reference without copying its brand or data.

This is an Operate surface. Familiar controls, stable geometry, and fast scanning always outrank spectacle. Expression comes from composition, density, precise typography, small inline data graphics, and consistent status language—not gradients, decorative hero art, floating glass, or attention-seeking motion.

**Key characteristics:**

- Dense but strongly grouped
- Bright, crisp working surfaces
- Midnight navigation rail with rare electric-blue emphasis
- Fine borders and shallow ambient depth
- Tabular alignment and concise operational copy
- Responsive disclosure rather than desktop content simply stacked

## Colors

The palette is a restrained neutral field with one saturated blue for navigation, selection, focus, and primary action.

### Primary

- **Electric Blue** (`#1f5eff`): active navigation, primary actions, focus emphasis, selected tabs, and the principal chart series.
- **Midnight Rail** (`#06152f`): the permanent desktop navigation field and branded auth-side panel.

### Secondary

- **Operational Green** (`#0a8f64`): confirmed success, healthy state, and truthful positive series.
- **Signal Amber** (`#a56000`): warnings and states that require review; never a competing call-to-action color.
- **Controlled Red** (`#b42318`): errors and destructive actions only.

### Neutral

- **Working Canvas** (`#f5f7fb`): application background.
- **Paper Surface** (`#ffffff`): cards, tables, fields, dialogs, and the top bar.
- **Quiet Surface** (`#f8faff`): grouped rows, table headers, loading geometry, and selected low-emphasis states.
- **Primary Ink** (`#12213d`): titles, values, and primary body text.
- **Muted Ink** (`#5c6b82`): metadata and explanatory copy.
- **Hairline Border** (`#d7dfeb`): default surface and control border.
- **Strong Border** (`#b9c6d8`): emphasized separators and selected secondary controls.

### Named Rules

**The Rare Blue Rule.** Electric blue marks interaction or the most important series; it does not wash entire content regions.

**The Semantic Color Rule.** Green, amber, and red always communicate state. They are never decorative variety.

### Supporting Tones

The canonical colors above own each role. Supporting tones may be used only as lighter or darker steps of that role: focus blue (`#cbdcff`), vivid icon blue (`#2f73ff`), selected-border blue (`#4b7cff`), sidebar metadata (`#8497b4`), and accessible semantic borders/foregrounds for success, warning, and danger. These tones never introduce a new semantic meaning.

## Typography

**Display Font:** Geist with system UI fallback

**Body Font:** Geist with system UI fallback
**Label/Mono Font:** Geist; Geist Mono is reserved for immutable IDs or code-like technical detail

**Character:** A compact workhorse family supports the application's mixed data, forms, and tables without introducing a dashboard-as-code aesthetic. Numeric values use tabular figures in the same family so they align cleanly without looking like terminal output.

### Hierarchy

- **Headline** (650, `clamp(1.5rem, 2vw, 2rem)`, 1.15): one concise page title.
- **Title** (650, `1rem`, 1.3): cards and major subsections.
- **Body** (400, `0.875rem`, 1.5): operational copy, capped near 72 characters where prose appears.
- **Label** (700, `0.6875rem`, 0.08em, uppercase): section overlines and compact column-level grouping.
- **Numeric** (650, `1.5rem`, 1.1, tabular): headline metrics only; tables use body-size tabular figures.

The supporting data ramp is intentional: `0.5rem` chart-axis microtext, `0.625rem` metadata, `0.6875rem` overlines, `0.75rem` secondary metadata, `0.8125rem` tables, `0.875rem` body and controls, `0.9375rem` compact card titles, `1rem` section titles, `1.1rem` state titles, and `1.5–2rem` dashboard metrics. Auth and standalone state headlines may use `1.75–3rem` where the working canvas is absent.

### Named Rules

**The Two-Line Header Rule.** Page titles stay on one line when space allows and supporting context uses no more than two lines.

**The Plain Number Rule.** Large values are clear and well aligned, never theatrical, monospaced, or accompanied by invented directional claims.

## Layout

Desktop uses a fixed `184px` midnight navigation rail and a fluid content region. The content canvas has a `1440px` maximum working width, `24px` desktop gutters, and a 12-column grid. Section gaps are `16–24px`; cards use `16px` internal padding, reducing to `12px` in dense table and metric contexts.

The overview composes information by decision priority: context and actions, core performance, activity state, diagnostic charts, detailed performance, then data trust and administrative shortcuts. Not every card has equal visual weight.

At tablet widths, the rail collapses into an accessible drawer and dashboard grids reduce to two columns. At phone widths, high-priority metrics remain paired where labels permit, low-priority metadata moves into disclosure, action groups wrap, and wide tables retain explicit labeled horizontal scroll regions. No screen may introduce page-level horizontal scrolling.

## Elevation & Depth

Depth is primarily structural: white surfaces, cool borders, and tonal background changes. Cards at rest use at most a shallow ambient shadow. Menus, drawers, and dialogs use stronger elevation because they occupy a temporary layer.

### Shadow Vocabulary

- **Surface Ambient** (`0 1px 2px rgba(6, 21, 47, 0.05)`): optional on primary cards and the top bar.
- **Overlay** (`0 16px 40px rgba(6, 21, 47, 0.18)`): drawers, menus, and dialogs only.

### Named Rules

**The Flat-by-Default Rule.** Borders establish most hierarchy; shadows identify a temporary layer or one intentionally prominent surface.

## Shapes

The form language is compact and lightly softened. Controls use `6px` corners, cards and containers use `8–10px`, and overlays use no more than `12px`. Borders are one pixel. Full pills (`999px`) are reserved for avatars, spinners, short statuses, or binary filters, never for standard buttons, cards, table containers, or navigation.

## Components

### Buttons

- **Shape:** compact rectangle with `6px` corners and a `40px` default height.
- **Primary:** electric-blue fill, white label, `9px 14px` padding; one primary action per local action group.
- **Hover / Focus:** darken without movement; visible three-pixel focus ring; no scale or lift animation.
- **Secondary / Ghost:** white or transparent surface with a fine border; destructive buttons use the danger palette and stay separated from routine actions.

### Chips

- **Style:** short text, one-pixel border, `6px` or full-pill corners only when representing immutable status.
- **State:** selected filters use blue-soft background and electric-blue border; statuses include text and do not rely on color alone.

### Cards / Containers

- **Corner Style:** `10px` for standard surfaces, `8px` for dense nested surfaces.
- **Background:** white on the working canvas; quiet surface for internal grouping.
- **Shadow Strategy:** flat by default; ambient shadow only for priority.
- **Border:** one-pixel hairline.
- **Internal Padding:** `16px` standard, `12px` dense.

### Inputs / Fields

- **Style:** white field, `6px` corners, one-pixel hairline border, `44px` default height.
- **Focus:** electric-blue border with a visible outer ring.
- **Error / Disabled:** semantic foreground and soft background; never opacity alone.

### Navigation

The desktop rail is midnight, grouped by labeled sections, and permanently visible. Links are compact rows with line icons, muted labels, and a solid electric-blue active field. Mobile navigation is a modal drawer with a labeled trigger, overlay close, Escape close, focus containment, and focus restoration.

### Metric and Chart Surfaces

Metric cards lead with a precise label, one live scoped value, unit/context, and an optional small truthful visualization. Charts expose concise text summaries and units, preserve source order, and never imply comparisons the data does not support.

### Data Tables

Tables use sticky or tonal headers, `44px` minimum interactive row targets, tabular numbers, clear column alignment, and compact row actions. Row hover improves tracking without changing geometry. Large tables provide search, filters, pagination, and a labeled scroll region when those behaviors are supported.

## Copy & Terminology

Visible copy uses sentence case and familiar business language. Internal enum keys, database fields, audit action IDs, and import states are translated through `src/presentation/labels.ts`; components do not humanize identifiers ad hoc. Status messages name what changed, errors state the problem and the next step, and destructive actions state their scope and permanence. Immutable IDs and technical JSON appear only as secondary, disclosed evidence.

## Do's and Don'ts

### Do:

- **Do** use the supplied screenshot's compact enterprise rhythm, deep rail, bright canvas, fine borders, and blue emphasis.
- **Do** preserve server-rendered data and authorization boundaries.
- **Do** keep live scope, active-version context, freshness, and consequential status visible near the relevant decision.
- **Do** use one coherent icon family drawn with consistent 1.75–1.8px strokes.
- **Do** make every visible action keyboard accessible and visibly stateful.
- **Do** use `120–190ms` state transitions and honor reduced-motion preferences.

### Don't:

- **Don't** copy the reference brand, people, or values.
- **Don't** use gradients, glassmorphism, oversized marketing typography, decorative blobs, or generic hero composition.
- **Don't** use amber as a primary call to action or scatter semantic colors for visual variety.
- **Don't** animate page transitions, use scroll-triggered effects, or add movement that delays a frequent task.
- **Don't** show raw enum keys, IDs, or technical JSON as the primary user-facing label.
- **Don't** introduce a control unless it performs a real action or changes real state.
