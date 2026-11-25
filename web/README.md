# Web

Next.js app for the CRE tool. Checks: `pnpm lint` (ESLint and i18n lint), `pnpm typecheck`,
`pnpm test`, `pnpm format:check` and `pnpm build`.

## Styling rules

The look of the app comes from `src/styles/tokens.css`, the single source of truth for
colours, spacing, radius, shadows and type. It is taken from the hi-fi page "00 Foundations".

**Tokens only.** Never write a hex value, a pixel size from nowhere or a font stack in a
component. Use a token. If a token is missing, ask for it in a `ui` issue; do not add a one-off.

**Tailwind or a CSS module.**

- Use Tailwind utilities for new and reworked markup: layout, spacing, colour, type, the
  styling of Radix parts. Names match the tokens: `bg-primary`, `text-text-secondary`,
  `border-border`, `rounded-card`, `shadow-floating`, `text-body`, `font-semibold`,
  `p-4` (is `--space-4`), `h-control-md`, `bg-level-h-tint`, `text-level-h-text`.
  The theme is in `src/app/globals.css` (`@theme inline`) and holds nothing but
  `var(--token)` references. Only token-backed names exist: `bg-red-500` or `p-[13px]` is a
  review comment. Add `focus-ring` to anything focusable that Radix does not style for you.
- Keep a CSS module for components with their own layout or drawing: the assessment table,
  the charts, the heat map, the stepper and the level bars. Do not convert them for the sake of it.
- Do not mix both for one property on one element. Utilities sit in a cascade layer, so a
  CSS module rule for the same property wins.
- Preflight is off, so Tailwind does not reset the browser defaults. Elements are not
  border-box unless you say so: add `box-border` to a sized element that has padding.

**Icons.** Use `Icon` from `@/components/ui` with a named import from `@tabler/icons-react`
(never the namespace or the whole package):

```tsx
import { IconTrash } from '@tabler/icons-react';
import { Icon } from '@/components/ui';

<Icon icon={IconTrash} size={20} />                 // decorative: aria-hidden
<Icon icon={IconTrash} size={20} label={t('delete')} /> // the only content: role="img"
```

Sizes: 16 inline, 18 in inputs and menus, 20 in buttons and navigation (default), 24 in
empty states. The stroke is 1.75. A button that holds only an icon needs an `aria-label`.

**Radix for interactive primitives.** Slider, toast, popover, dropdown menu, accordion,
tooltip and visually-hidden text come from `@radix-ui/react-*`: they own the focus,
keyboard and ARIA behaviour. Style the parts with token utilities. Do not rebuild them by
hand. `/dev/components` has one example of each. `ConfirmDialog` and `Tabs` stay as they are.
We do not use shadcn/ui as a dependency; copying one of its patterns into `components/ui`
is fine.

**Font.** IBM Plex Sans Thai (400, 500, 600, 700) is self-hosted through `@fontsource`, so
the build makes no network request. The fallback is `system-ui, sans-serif`. Take size and
line-height together from the type scale (`text-body`, `text-small`, ...); Thai body text
must keep a line-height of 1.5 or more.

**Text.** All user-facing text comes from `messages/th/<feature>.json`.
