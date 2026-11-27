# CLEANROOM Design System

This document defines the permanent visual, typographic, layout, and accessibility rules for **CLEANROOM**. All UI components and stylesheets must follow these rules strictly.

## 1. Immutable Color Architecture

All color values in the application are centralized in [`src/styles/tokens.css`](src/styles/tokens.css).

### Base Palette
- `--background`: `#F8F9FA` — application canvas
- `--foreground`: `#202124` — primary body and heading text
- `--primary`: `#356AE6` — primary actions and active selection states
- `--border`: `#E5E7EB` — hairline structural dividers and card borders
- `--muted`: `#6B7280` — secondary labels, helper text, and empty states
- `--surface`: `#FFFFFF` — elevated panels, header, and input surfaces

### Supporting Tokens
Restrained surface, interactive, and status tokens (`--surface-subtle`, `--primary-hover`, `--primary-soft`, `--primary-foreground`, `--border-strong`, `--focus-ring`, `--danger`, `--danger-surface`, `--danger-border`, `--success`, `--success-surface`, `--success-border`) are defined exclusively in `src/styles/tokens.css`.

### Color Rule
**No hardcoded color values (hex, `rgb()`, `rgba()`, `hsl()`, or named colors) are permitted outside `src/styles/tokens.css`.** All CSS Modules and global styles must reference CSS custom properties (e.g., `var(--surface)`, `var(--border)`, `var(--foreground)`) or standard inheritance/transparency keywords (`transparent`, `inherit`, `currentColor`).

## 2. Typography Scale

- **Font stack:** `--font-sans` (`'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`), bundled locally via `@fontsource/inter`.
- **Monospace stack:** `--font-mono` (`ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace`) for raw text editors, sanitized output, and tabular counts.
- **Scale:** Compact, utility-focused sizing with no oversized hero headings:
  - `--text-xs`: `0.75rem` (12px) — badges, metadata, footer notes
  - `--text-sm`: `0.8125rem` (13px) — secondary labels, compact controls
  - `--text-base`: `0.875rem` (14px) — body copy, inputs, buttons
  - `--text-md`: `1rem` (16px) — section panel headings
  - `--text-lg`: `1.125rem` (18px) — application wordmark (`<h1>`)
- **Weights:** `400` (`--weight-regular`), `500` (`--weight-medium`), `600` (`--weight-semibold`).

## 3. Shape, Borders, Elevation, and Spacing

- **Radii:** Crisp utility corners only — `--radius-sm` (`4px`) for buttons, badges, and inputs; `--radius-md` (`6px`) for panels and option cards.
- **Borders:** Restrained `1px solid var(--border)` (and `var(--border-strong)` on interactive hover/input boundaries).
- **Elevation:** Flat hierarchy with at most `--shadow-xs` (`0 1px 2px rgba(32, 33, 36, 0.05)`) on primary surface panels.
- **Spacing scale:** Multiples of 4px (`--space-1`: `4px` through `--space-6`: `24px`), constrained to a centered `--container-max` (`1280px`).

## 4. Prohibited Patterns

The following visual and behavioral patterns are strictly prohibited across the codebase:
- Gradients (`linear-gradient`, `radial-gradient`, `conic-gradient`)
- Glassmorphism (`backdrop-filter`, translucent blurred overlays)
- Neon, glowing, or unapproved accent colors
- Heavy or multi-layered drop shadows
- Decorative illustrations, marketing banners, or emojis
- Excessive or continuous animations
- Fake statistics, placeholder counts, or simulated active states for unimplemented features

## 5. Accessibility Standards

- **Semantic landmarks:** Every page must use `<header>`, `<main>`, `<section>` (with `aria-labelledby` when titled), and `<footer>`.
- **Keyboard focus:** Visible focus outlines on all interactive controls using `:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 2px; }`.
- **Contrast:** Text and interactive states must meet WCAG 2.1 AA contrast ratios against their backgrounds.
- **Reduced motion:** Global `@media (prefers-reduced-motion: reduce)` rule disables transitions and animations for users requesting reduced motion.
- **Live regions:** Processing state changes use `role="status"` and `aria-live="polite"` so assistive technologies receive timely updates.
