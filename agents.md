# Capital — Core Agent Rules

PWA/Android (Capacitor) offline-first personal finance tracker.
Stack: Vanilla JS (ES6+), Tailwind CSS, Firebase Firestore. Mobile-only viewport (380–412px).

## 1. Commands

- Run dev server: `npm run dev`
- Lint changed files: `npx eslint $(git diff --name-only origin/main -- '*.js') --fix`
- Sync assets to Android: `npx cap sync android`
- Never run full-project `npm run check` or `eslint .` (legacy files exist).

## 2. Hard Architectural Invariants

- **window.Cache integrity:** NEVER overwrite `window.Cache` directly (breaks UI subscriptions). Mutate inner properties.
- **Transactions cache structure:** `Cache.transactions` is an array of month objects `[{ id: 'YYYY-MM', items: [...] }]`, NOT a flat list.
- **Database queries:** Always use `getUserCol(tableName)` from `core.js`.
- **Numbers & Money:** Strictly use `Math.round(val * 100) / 100`, `formatMoney(sum)` and CSS class `tabular-nums`.
- **Dates:** Strict calendar format `'YYYY-MM-DD'`. Never rely on UTC parsing for local month shifts.

## 3. Mobile UI & Anti-Slop Guidelines

- **Strictly Mobile (380–412px):** Touch target >= 44x44px. No desktop patterns: no drag-and-drop, no visible scrollbars (`scrollbar-none`), no hover-dependent actions. Modals max-height: `92vh`.
- **Single Source of Truth (No Redundancy):** Do not repeat data. Never duplicate slider values above and below it. Never add redundant status tags (e.g., no "Transfer" tag inside the Transfers tab, no "Indefinite" tag on deposits).
- **Clean Controls:** If a button contains an icon (e.g. plus), its text label is a single noun without symbols.
- **Flat Card Hierarchy:** Do not nest mini-cards inside cards. Use clean flat rows with `border-white/[0.05]`.
- Design tokens & button classes: Refer to `design-system/capital/MASTER.md`. Do not invent new colors.

## 4. Visual Verification & Design Critique

- **Capture Screenshot (Native Mock Mode):**
  - Run: `node scripts/screenshot.cjs --tab=<capital|budget|transactions> --out=scripts/preview.png`
  - Zero mock-setup overhead: uses native `?mock=1` mode in `mock-mode.js`.
- **When to Run Design Critique (Triggers):**
  - **RUN:** New screen, new modal dialog, or major card/list layout refactoring.
  - **SKIP:** Bug fixes, calculation logic, text/translation tweaks, or minor CSS color fixes.
- **Design Critic Workflow:**
  - Delegate screenshot audit to a fresh `subagent` using `prompts/visual-design-critic.md` as prompt template (avoids self-review bias).
  - Focus is anti-slop: removing redundant numbers, obvious badges, nested cards, and button clutter.
- **Anti-Loop Policy (Strict Budget = 1 Pass):**
  - Exactly ONE critic pass per task.
  - Apply the critic's simplifications to code.
  - Present result directly to the user. Never run a second critic pass on the same task.
- **Delivery:**
  - Push clean commits to `origin/main` when verified.
