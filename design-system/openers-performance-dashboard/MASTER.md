# Openers Performance Dashboard design system

Generated and reconciled: 2026-07-28
Design dials: variance 3/10 · motion 3/10 · density 8/10
Source of truth: root `DESIGN.md` and `src/app/globals.css`

## Direction

The Operations Briefing is a compact enterprise operating surface. A 184px
midnight rail anchors the product; a cool, bright canvas carries dense white
surfaces with fine blue-gray borders. Electric blue is reserved for active
navigation, primary action, focus, and the principal data series.

## Core tokens

| Role | Value |
| --- | --- |
| Midnight rail | `#06152f` |
| Electric blue | `#1f5eff` |
| Electric blue hover | `#154be0` |
| Canvas | `#f5f7fb` |
| Surface | `#ffffff` |
| Primary ink | `#12213d` |
| Muted ink | `#5c6b82` |
| Border | `#d7dfeb` |
| Success | `#0a8f64` |
| Warning | `#a56000` |
| Danger | `#b42318` |

Typography is Geist with system fallbacks. Geist Mono is limited to immutable
technical identifiers and expanded evidence. Use tabular numerals for metrics
and tables without switching them to monospace.

Spacing uses a 4px base with `8`, `12`, `16`, `24`, and `32px` steps. Controls
use 6px corners; surfaces use 8–10px corners. Full pills are reserved for short
status badges.

## Layout

- Desktop: fixed 184px rail, 1440px maximum working canvas, 24px gutters.
- Overview: 12 columns with an 8-column performance story and 4-column
  diagnostic rail.
- Tablet: two-column dashboard patterns; modal navigation drawer.
- Phone: priority metrics remain paired when space permits; wide tables keep
  labeled internal scrolling and the page itself never scrolls horizontally.

## Components

- Primary button: electric blue, white label, 40px visual height, no lift.
- Secondary button: white surface, strong hairline border, primary ink.
- Fields: white, 44px minimum touch height, persistent label, visible blue
  focus ring.
- Cards: border-led, 10px corners, 12–16px internal padding, flat at rest.
- Tables: quiet headers, tabular numbers, 44px interactive row actions.
- Navigation: line icons, compact labels, solid blue active field.
- Drawer and dialogs: protected focus, Escape close, overlay close, and focus
  restoration.

## Motion

Use 120–180ms state transitions. Do not animate page changes or scroll position.
The mobile drawer is the only authored entrance motion and remains visible by
default when open. Respect `prefers-reduced-motion`.

## Accessibility

- Target WCAG 2.2 AA.
- Preserve native labels, landmarks, table captions, status roles, and server
  authorization.
- Keep focus visible and provide a skip link.
- Use 44px targets for coarse pointers.
- Never encode state through color alone.

## Prohibited patterns

- No gradients, glass, decorative blur, giant marketing type, or stock imagery.
- No fabricated people, metrics, comparisons, benchmarks, or capabilities.
- No raw enum keys, IDs, or JSON as the primary label.
- No control without a real route, query change, or server action.
- No semantic color used as decorative variety.
