# Capital Design System — Master Specification

> **Source of Truth:** This file defines the real, verified design system of the Capital PWA/Android mobile application.
> It reflects the production styling from `style.css` and Tailwind classes, explicitly distinguishing active tokens from legacy/dead code.

---

## 1. Design DNA & Visual Benchmark

- **Style:** High-density, minimalist mobile fintech (inspired by Apple Card, Revolut, Linear).
- **Core Principle:** High signal-to-noise ratio. Zero decorative clutter ("neuroslop"). Respect user intelligence.
- **Viewport:** Mobile-first, optimized strictly for **380px – 412px** width (`max-width: 760px` for desktop shell).

---

## 2. Color Palette & Design Tokens

### Core CSS Variables (`:root` in `style.css`)

| Token           | Hex / Value                     | Usage                                         |
| :-------------- | :------------------------------ | :-------------------------------------------- |
| `--bg`          | `#000000` / `#0F1117`           | Canvas / deep dark background                 |
| `--surface`     | `#0E1016` / `#181B24`           | Primary card background                       |
| `--surface-2`   | `#151821` / `#1E222D`           | Secondary cards, dropdowns, input fields      |
| `--surface-3`   | `#1D212D`                       | Elevated popovers, active highlights          |
| `--line`        | `rgba(255, 255, 255, 0.07)`     | Hairline borders between rows                 |
| `--line-strong` | `rgba(255, 255, 255, 0.12)`     | Container borders, modal edges                |
| `--text`        | `#FFFFFF`                       | Primary headers, balances, active values      |
| `--muted`       | `#8E96A4` / `text-zinc-400`     | Secondary labels, descriptions                |
| `--muted-2`     | `#5F6775` / `text-zinc-500`     | Subdued metadata, dates, micro-labels         |
| `--accent`      | `#FFFFFF` / `#8C7DFF`           | Primary button text / brand accent            |
| `--green`       | `#10B981` / `text-emerald-400`  | Income, profit, positive delta, active toggle |
| `--red`         | `#F43F5E` / `text-rose-400`     | Expenses, debt, destructive actions           |
| `--yellow`      | `#F59E0B` / `text-amber-400`    | Pending status, warnings, calendar bills      |
| `--radius`      | `14px` (`rounded-2xl` = `16px`) | Primary card and button corner radius         |

---

## 3. Typography & Numerals

- **Font Family:** `Inter, ui-sans-serif, system-ui, -apple-system, sans-serif`
- **Tabular Figures:** `font-variant-numeric: tabular-nums` (applied globally). Money amounts must always align visually.

### Type Scale

| Tier               | Size / Weight      | Classes                                                           | Usage                               |
| :----------------- | :----------------- | :---------------------------------------------------------------- | :---------------------------------- |
| **Hero Balance**   | 24–32px, Extrabold | `text-2xl sm:text-3xl font-extrabold tracking-tight tabular-nums` | Main account balance, total capital |
| **Section Header** | 16–18px, Bold      | `text-base sm:text-lg font-bold text-white tracking-tight`        | Screen titles, card group headers   |
| **Primary Value**  | 14–15px, Semibold  | `text-sm font-semibold text-white tabular-nums`                   | Transaction amount, deposit rate    |
| **Body / Name**    | 13–14px, Medium    | `text-xs sm:text-sm font-medium text-zinc-200`                    | Transaction name, bank name         |
| **Secondary Meta** | 11–12px, Regular   | `text-[11px] sm:text-xs text-zinc-400`                            | Date, category, condition notes     |
| **Micro Eyebrow**  | 9–10px, Bold Caps  | `text-[9px] font-bold uppercase tracking-wider text-zinc-500`     | Card categories, section labels     |

---

## 4. Standard Components & Classes

### Buttons (Use strictly Variant A)

```html
<!-- Primary Action: Solid White on Dark -->
<button class="btn-primary px-4 py-2.5 rounded-[14px] text-xs font-semibold">Сохранить</button>

<!-- Secondary Action: Dark Subtle Surface -->
<button class="btn-secondary px-4 py-2.5 rounded-[14px] text-xs font-medium">Отмена</button>

<!-- Destructive Action: Subdued Rose -->
<button
  class="bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 px-4 py-2.5 rounded-[14px] text-xs font-semibold"
>
  Удалить
</button>
```

### Cards & Container Layout

- **Flat Container:** Background `#0E1016` or `#181B24`, border `1px solid rgba(255, 255, 255, 0.06)`, radius `rounded-2xl` (`16px`) or `rounded-[14px]`.
- **List Rows within Card:** Borderless or hairline bottom dividers (`border-b border-white/[0.04]`). Never nest boxes inside boxes!
- **Haptic Tap Feedback:** Apply `active:scale-[0.98] transition-transform duration-100 cursor-pointer` on clickable cards and controls.

### Inputs & Form Controls

- **Inputs:** `bg-[#151821] border border-white/[0.08] rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-zinc-500 focus:border-white/[0.2] outline-none`.
- **Sliders:** Use native classes `.discrete-range-slider` (market rates) or `.goal-share-slider`.

---

## 5. Visual Review & Anti-Slop Checkpoints

Every new UI screen must strictly comply with the 5 invariants defined in `prompts/visual-design-critic.md`:

1. **Information Uniqueness:** Every metric appears at most once per card.
2. **Context Echoing:** No badges restating active tabs or normal default states.
3. **Structural Flatness:** Maximum card nesting depth is 1. Frameless rows instead of boxed sub-cards.
4. **Control Economy:** Icon + noun only (no duplicate action verbs in button labels).
5. **Contrast Hierarchy:** One clear primary hero balance; subdued secondary metadata.
