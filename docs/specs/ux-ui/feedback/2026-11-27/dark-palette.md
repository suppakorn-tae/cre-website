# Dark mode palette (proposed 27 Nov, approved 28 Nov 2026)

Status: **approved by Tae, 28 Nov 2026.** Built in IO-255 (foundation), IO-256 – IO-260 (per area) and IO-261 (clean-up). Theme choice: follows the system by default; switch "ตามระบบ / สว่าง / มืด" in the account menu.

Checked with the same rules as `docs/a11y/contrast-2026-11.md` (WCAG 2.2: 1.4.3 text 4.5:1, large text 3:1, 1.4.11 non-text 3:1) on the same pair list as `web/src/lib/contrast-pairs.ts`, plus the new chart tokens.

## Result

- **light**: 144 pairs, 0 fail, 17 near misses (within 0.3). Lowest text 4.52:1 (`color-placeholder` on `color-surface`), lowest non-text 3.01:1 (`level-l` on `color-surface`).
- **dark**: 144 pairs, 0 fail, 0 near misses (within 0.3). Lowest text 4.95:1 (`color-on-solid` on `level-vh`), lowest non-text 3.78:1 (`color-field-border` on `color-disabled-bg`).
- `chart-grid` is decorative (every value is printed), so it is not held to 3:1. Target ≥ 2:1 so the lines are clearly seen: light 2.15:1 (today `color-divider` is 1.14:1), dark 2.22:1.

## Approach

- Same token names; dark values in `:root[data-theme="dark"]`. Default follows `prefers-color-scheme`; a theme switch (system / light / dark) is remembered per browser.
- Dark solids are light tones with dark text on them (Material-style). So today's `--color-white` must be split first, because it is used both as a card background and as text on solid fills:
  - `--color-card` (card and input background): light `#ffffff`, dark `#141f31`.
  - `--color-on-solid` (text and icons on primary, chosen chip, tooltip, destructive, strategy chosen): light `#ffffff`, dark `#0b1320`.
- Elevation goes up by lightness: canvas `#0b1320` < surface `#111b2b` < card `#141f31` < subtle `#172336`. No pure black; text is `#e7edf5`, not pure white, to cut glare.
- Risk scale keeps one meaning per hue (VL green → VH red); bars get brighter solids, chips get dark tints with light text. The level code is always printed (1.4.1).
- Tooltip and the nickname chip invert (light chip, dark text).
- Stays light in dark mode: the PDF report, the Google button mark, the brand logo files.

## Tokens

### Surfaces and text

| Token | Light | Dark |
| --- | --- | --- |
| `--color-canvas` | `#f1f4f8` | `#0b1320` |
| `--color-surface` | `#fbfcfe` | `#111b2b` |
| `--color-card` | `#ffffff` | `#141f31` |
| `--color-subtle` | `#f6f8fb` | `#172336` |
| `--color-disabled-bg` | `#eef1f5` | `#1a2537` |
| `--color-divider` | `#edf1f5` | `#1e2a3e` |
| `--color-border` | `#e3e8ef` | `#28364d` |
| `--color-field-border` | `#7f8c9e` | `#6f7f96` |
| `--color-disabled` | `#9aa6b6` | `#55637a` |
| `--color-placeholder` | `#677689` | `#8d9bb0` |
| `--color-text-muted` | `#57677d` | `#9dabbf` |
| `--color-text-secondary` | `#475569` | `#b8c3d2` |
| `--color-text` | `#0f1e33` | `#e7edf5` |
| `--color-on-solid` | `#ffffff` | `#0b1320` |

### Brand

| Token | Light | Dark |
| --- | --- | --- |
| `--color-blue-50` | `#eaf1fd` | `#15284a` |
| `--color-blue-100` | `#dce8fc` | `#1c3463` |
| `--color-blue-200` | `#c9dbfa` | `#244079` |
| `--color-blue-400` | `#4a80d8` | `#5f8fe0` |
| `--color-blue-600` | `#1e5bc6` | `#7eaaf5` |
| `--color-blue-700` | `#174a9f` | `#a6c5fa` |
| `--color-blue-800` | `#133b77` | `#c4d9fc` |
| `--color-navy-900` | `#0f2a4a` | `#dbe4ef` |
| `--color-orange-50` | `#fff1e6` | `#2e1d0e` |
| `--color-orange-500` | `#f28c28` | `#f5a04d` |

### Status

| Token | Light | Dark |
| --- | --- | --- |
| `--color-success` | `#15803d` | `#4ade80` |
| `--color-success-bg` | `#e9f7ef` | `#0f2a1c` |
| `--color-warning` | `#b45309` | `#fbbf24` |
| `--color-warning-bg` | `#fef4e2` | `#2d2110` |
| `--color-error` | `#b91c1c` | `#f87171` |
| `--color-error-bg` | `#fdecec` | `#331619` |
| `--color-info` | `#1e5bc6` | `#7eaaf5` |
| `--color-info-bg` | `#eaf1fd` | `#15284a` |
| `--color-danger-hover` | `#991b1b` | `#fca5a5` |
| `--color-danger-pressed` | `#7f1d1d` | `#fecaca` |

### Risk scale

| Token | Light | Dark |
| --- | --- | --- |
| `--level-vl` | `#059669` | `#10b981` |
| `--level-vl-on` | `#021a10` | `#02140c` |
| `--level-vl-tint` | `#e6f6ee` | `#0e2a20` |
| `--level-vl-text` | `#0e7a4f` | `#6ee7b7` |
| `--level-l` | `#65a30d` | `#84cc16` |
| `--level-l-on` | `#102303` | `#111d02` |
| `--level-l-tint` | `#eef7e0` | `#1c2a0c` |
| `--level-l-text` | `#4d7c0f` | `#a3e635` |
| `--level-m` | `#d97706` | `#f59e0b` |
| `--level-m-on` | `#2b1d00` | `#231700` |
| `--level-m-tint` | `#fdf6d8` | `#2d2410` |
| `--level-m-text` | `#8a6100` | `#fcd34d` |
| `--level-h` | `#c2410c` | `#f97316` |
| `--level-h-on` | `#ffffff` | `#1f0c02` |
| `--level-h-tint` | `#fff1e6` | `#33190b` |
| `--level-h-text` | `#c2410c` | `#fdba74` |
| `--level-vh` | `#b91c1c` | `#ef4444` |
| `--level-vh-on` | `#ffffff` | `#1f0505` |
| `--level-vh-tint` | `#fde7e5` | `#361416` |
| `--level-vh-text` | `#b42318` | `#fca5a5` |

### Dimensions

| Token | Light | Dark |
| --- | --- | --- |
| `--dim-ec` | `#4c2a92` | `#b9a4f0` |
| `--dim-ec-tint` | `#edeaf4` | `#241d3d` |
| `--dim-so` | `#a8327a` | `#f19acb` |
| `--dim-so-tint` | `#f6eaf2` | `#331a2b` |
| `--dim-ev` | `#0e7490` | `#5ccde6` |
| `--dim-ev-tint` | `#e7f1f4` | `#0f2a33` |

### Charts (new)

| Token | Light | Dark |
| --- | --- | --- |
| `--chart-grid` | `#a7b2c1` | `#46566f` |
| `--factor-rl` | `#7f8c9e` | `#6f7f96` |
| `--factor-ri` | `#4f5d70` | `#a9b6c8` |

## Every dark pair

| Kind | Foreground | Background | Used for | Ratio | Need |
| --- | --- | --- | --- | --- | --- |
| text | `color-text` #e7edf5 | `color-card` #141f31 | body text | 14.04 | 4.5 |
| text | `color-text` #e7edf5 | `color-surface` #111b2b | body text | 14.67 | 4.5 |
| text | `color-text` #e7edf5 | `color-canvas` #0b1320 | body text | 15.8 | 4.5 |
| text | `color-text` #e7edf5 | `color-subtle` #172336 | body text | 13.4 | 4.5 |
| text | `color-text` #e7edf5 | `color-blue-50` #15284a | body text | 12.43 | 4.5 |
| text | `color-text` #e7edf5 | `color-disabled-bg` #1a2537 | body text | 13.07 | 4.5 |
| text | `color-text-secondary` #b8c3d2 | `color-card` #141f31 | body text | 9.27 | 4.5 |
| text | `color-text-secondary` #b8c3d2 | `color-surface` #111b2b | body text | 9.69 | 4.5 |
| text | `color-text-secondary` #b8c3d2 | `color-canvas` #0b1320 | body text | 10.44 | 4.5 |
| text | `color-text-secondary` #b8c3d2 | `color-subtle` #172336 | body text | 8.85 | 4.5 |
| text | `color-text-secondary` #b8c3d2 | `color-blue-50` #15284a | body text | 8.21 | 4.5 |
| text | `color-text-secondary` #b8c3d2 | `color-disabled-bg` #1a2537 | body text | 8.63 | 4.5 |
| text | `color-text-muted` #9dabbf | `color-card` #141f31 | body text | 7.09 | 4.5 |
| text | `color-text-muted` #9dabbf | `color-surface` #111b2b | body text | 7.41 | 4.5 |
| text | `color-text-muted` #9dabbf | `color-canvas` #0b1320 | body text | 7.99 | 4.5 |
| text | `color-text-muted` #9dabbf | `color-subtle` #172336 | body text | 6.77 | 4.5 |
| text | `color-text-muted` #9dabbf | `color-blue-50` #15284a | body text | 6.28 | 4.5 |
| text | `color-text-muted` #9dabbf | `color-disabled-bg` #1a2537 | body text | 6.61 | 4.5 |
| text | `color-text` #e7edf5 | `color-border` #28364d | secondary pressed | 10.34 | 4.5 |
| text | `color-blue-600` #7eaaf5 | `color-card` #141f31 | link | 7.05 | 4.5 |
| text | `color-blue-600` #7eaaf5 | `color-surface` #111b2b | link | 7.37 | 4.5 |
| text | `color-blue-600` #7eaaf5 | `color-canvas` #0b1320 | link | 7.94 | 4.5 |
| text | `color-blue-600` #7eaaf5 | `color-blue-50` #15284a | link | 6.24 | 4.5 |
| text | `color-blue-700` #a6c5fa | `color-blue-50` #15284a | selected tab | 8.36 | 4.5 |
| text | `color-blue-700` #a6c5fa | `color-blue-100` #1c3463 | selected tab | 6.97 | 4.5 |
| text | `color-blue-700` #a6c5fa | `color-card` #141f31 | selected tab text | 9.44 | 4.5 |
| text | `color-on-solid` #0b1320 | `color-blue-600` #7eaaf5 | primary button | 7.94 | 4.5 |
| text | `color-on-solid` #0b1320 | `color-blue-700` #a6c5fa | primary button | 10.63 | 4.5 |
| text | `color-on-solid` #0b1320 | `color-blue-800` #c4d9fc | primary button | 13.01 | 4.5 |
| text | `color-on-solid` #0b1320 | `color-navy-900` #dbe4ef | on solid | 14.5 | 4.5 |
| text | `color-on-solid` #0b1320 | `color-success` #4ade80 | on solid | 10.68 | 4.5 |
| text | `color-on-solid` #0b1320 | `level-vh` #ef4444 | on solid | 4.95 | 4.5 |
| text | `color-on-solid` #0b1320 | `color-danger-hover` #fca5a5 | on solid | 9.81 | 4.5 |
| text | `color-on-solid` #0b1320 | `color-danger-pressed` #fecaca | on solid | 12.87 | 4.5 |
| text | `color-on-solid` #0b1320 | `color-error` #f87171 | on solid | 6.73 | 4.5 |
| text | `color-placeholder` #8d9bb0 | `color-card` #141f31 | placeholder | 5.86 | 4.5 |
| text | `color-placeholder` #8d9bb0 | `color-surface` #111b2b | placeholder | 6.13 | 4.5 |
| text | `color-error` #f87171 | `color-card` #141f31 | status text | 5.98 | 4.5 |
| text | `color-error` #f87171 | `color-surface` #111b2b | status text | 6.25 | 4.5 |
| text | `color-error` #f87171 | `color-canvas` #0b1320 | status text | 6.73 | 4.5 |
| text | `color-success` #4ade80 | `color-card` #141f31 | status text | 9.49 | 4.5 |
| text | `color-success` #4ade80 | `color-surface` #111b2b | status text | 9.91 | 4.5 |
| text | `color-success` #4ade80 | `color-canvas` #0b1320 | status text | 10.68 | 4.5 |
| text | `color-warning` #fbbf24 | `color-card` #141f31 | status text | 9.9 | 4.5 |
| text | `color-warning` #fbbf24 | `color-surface` #111b2b | status text | 10.35 | 4.5 |
| text | `color-warning` #fbbf24 | `color-canvas` #0b1320 | status text | 11.15 | 4.5 |
| text | `color-info` #7eaaf5 | `color-card` #141f31 | status text | 7.05 | 4.5 |
| text | `color-info` #7eaaf5 | `color-surface` #111b2b | status text | 7.37 | 4.5 |
| text | `color-info` #7eaaf5 | `color-canvas` #0b1320 | status text | 7.94 | 4.5 |
| text | `color-success` #4ade80 | `color-success-bg` #0f2a1c | success chip | 8.81 | 4.5 |
| text | `color-warning` #fbbf24 | `color-warning-bg` #2d2110 | warning chip | 9.41 | 4.5 |
| text | `color-error` #f87171 | `color-error-bg` #331619 | error chip | 5.98 | 4.5 |
| text | `color-info` #7eaaf5 | `color-info-bg` #15284a | info chip | 6.24 | 4.5 |
| text | `color-warning` #fbbf24 | `color-orange-50` #2e1d0e | orange KPI icon | 9.69 | 4.5 |
| text | `color-text` #e7edf5 | `color-error-bg` #331619 | invalid chip | 14.04 | 4.5 |
| text | `color-text-secondary` #b8c3d2 | `color-warning-bg` #2d2110 | warning body | 8.81 | 4.5 |
| text | `level-vl-text` #6ee7b7 | `level-vl-tint` #0e2a20 | level vl chip | 10.05 | 4.5 |
| text | `level-vl-text` #6ee7b7 | `color-card` #141f31 | level vl text on card | 10.85 | 4.5 |
| text | `level-vl-on` #02140c | `level-vl` #10b981 | label in vl bar | 7.47 | 4.5 |
| text | `level-l-text` #a3e635 | `level-l-tint` #1c2a0c | level l chip | 10.05 | 4.5 |
| text | `level-l-text` #a3e635 | `color-card` #141f31 | level l text on card | 10.97 | 4.5 |
| text | `level-l-on` #111d02 | `level-l` #84cc16 | label in l bar | 8.85 | 4.5 |
| text | `level-m-text` #fcd34d | `level-m-tint` #2d2410 | level m chip | 10.62 | 4.5 |
| text | `level-m-text` #fcd34d | `color-card` #141f31 | level m text on card | 11.47 | 4.5 |
| text | `level-m-on` #231700 | `level-m` #f59e0b | label in m bar | 8.19 | 4.5 |
| text | `level-h-text` #fdba74 | `level-h-tint` #33190b | level h chip | 9.69 | 4.5 |
| text | `level-h-text` #fdba74 | `color-card` #141f31 | level h text on card | 9.8 | 4.5 |
| text | `level-h-on` #1f0c02 | `level-h` #f97316 | label in h bar | 6.74 | 4.5 |
| text | `level-vh-text` #fca5a5 | `level-vh-tint` #361416 | level vh chip | 8.72 | 4.5 |
| text | `level-vh-text` #fca5a5 | `color-card` #141f31 | level vh text on card | 8.71 | 4.5 |
| text | `level-vh-on` #1f0505 | `level-vh` #ef4444 | label in vh bar | 5.16 | 4.5 |
| text | `dim-ec` #b9a4f0 | `color-card` #141f31 | dim text | 7.58 | 4.5 |
| text | `dim-ec` #b9a4f0 | `color-surface` #111b2b | dim text | 7.92 | 4.5 |
| text | `dim-ec` #b9a4f0 | `dim-ec-tint` #241d3d | dim chip | 7.31 | 4.5 |
| text | `color-text` #e7edf5 | `dim-ec-tint` #241d3d | dim header | 13.53 | 4.5 |
| ui | `dim-ec` #b9a4f0 | `color-surface` #111b2b | dim side bar | 7.92 | 3 |
| ui | `dim-ec` #b9a4f0 | `dim-ec-tint` #241d3d | dim bar on tint | 7.31 | 3 |
| text | `dim-so` #f19acb | `color-card` #141f31 | dim text | 8.05 | 4.5 |
| text | `dim-so` #f19acb | `color-surface` #111b2b | dim text | 8.41 | 4.5 |
| text | `dim-so` #f19acb | `dim-so-tint` #331a2b | dim chip | 7.73 | 4.5 |
| text | `color-text` #e7edf5 | `dim-so-tint` #331a2b | dim header | 13.47 | 4.5 |
| ui | `dim-so` #f19acb | `color-surface` #111b2b | dim side bar | 8.41 | 3 |
| ui | `dim-so` #f19acb | `dim-so-tint` #331a2b | dim bar on tint | 7.73 | 3 |
| text | `dim-ev` #5ccde6 | `color-card` #141f31 | dim text | 8.92 | 4.5 |
| text | `dim-ev` #5ccde6 | `color-surface` #111b2b | dim text | 9.32 | 4.5 |
| text | `dim-ev` #5ccde6 | `dim-ev-tint` #0f2a33 | dim chip | 8.1 | 4.5 |
| text | `color-text` #e7edf5 | `dim-ev-tint` #0f2a33 | dim header | 12.74 | 4.5 |
| ui | `dim-ev` #5ccde6 | `color-surface` #111b2b | dim side bar | 9.32 | 3 |
| ui | `dim-ev` #5ccde6 | `dim-ev-tint` #0f2a33 | dim bar on tint | 8.1 | 3 |
| text | `color-blue-700` #a6c5fa | `color-blue-50` #15284a | REDUCE idle | 8.36 | 4.5 |
| text | `dim-ec` #b9a4f0 | `dim-ec-tint` #241d3d | AVOID idle | 7.31 | 4.5 |
| text | `color-warning` #fbbf24 | `color-warning-bg` #2d2110 | TRANSFER idle | 9.41 | 4.5 |
| text | `color-text-secondary` #b8c3d2 | `color-subtle` #172336 | ACCEPT idle | 8.85 | 4.5 |
| text | `color-on-solid` #0b1320 | `color-blue-700` #a6c5fa | strategy chosen | 10.63 | 4.5 |
| ui | `color-blue-700` #a6c5fa | `color-surface` #111b2b | strategy border | 9.86 | 3 |
| text | `color-on-solid` #0b1320 | `dim-ec` #b9a4f0 | strategy chosen | 8.54 | 4.5 |
| ui | `dim-ec` #b9a4f0 | `color-surface` #111b2b | strategy border | 7.92 | 3 |
| text | `color-on-solid` #0b1320 | `color-warning` #fbbf24 | strategy chosen | 11.15 | 4.5 |
| ui | `color-warning` #fbbf24 | `color-surface` #111b2b | strategy border | 10.35 | 3 |
| text | `color-on-solid` #0b1320 | `color-text-secondary` #b8c3d2 | strategy chosen | 10.44 | 4.5 |
| ui | `color-text-secondary` #b8c3d2 | `color-surface` #111b2b | strategy border | 9.69 | 3 |
| large | `color-text` #e7edf5 | `color-surface` #111b2b | KPI | 14.67 | 3 |
| large | `color-text` #e7edf5 | `color-card` #141f31 | KPI sel | 14.04 | 3 |
| ui | `color-field-border` #6f7f96 | `color-card` #141f31 | field border | 4.06 | 3 |
| ui | `color-error` #f87171 | `color-card` #141f31 | invalid border | 5.98 | 3 |
| ui | `color-success` #4ade80 | `color-card` #141f31 | valid border | 9.49 | 3 |
| ui | `color-blue-600` #7eaaf5 | `color-card` #141f31 | focus ring | 7.05 | 3 |
| ui | `color-text-muted` #9dabbf | `color-card` #141f31 | input hover | 7.09 | 3 |
| ui | `color-field-border` #6f7f96 | `color-surface` #111b2b | field border | 4.24 | 3 |
| ui | `color-error` #f87171 | `color-surface` #111b2b | invalid border | 6.25 | 3 |
| ui | `color-success` #4ade80 | `color-surface` #111b2b | valid border | 9.91 | 3 |
| ui | `color-blue-600` #7eaaf5 | `color-surface` #111b2b | focus ring | 7.37 | 3 |
| ui | `color-text-muted` #9dabbf | `color-surface` #111b2b | input hover | 7.41 | 3 |
| ui | `color-field-border` #6f7f96 | `color-canvas` #0b1320 | field border | 4.57 | 3 |
| ui | `color-error` #f87171 | `color-canvas` #0b1320 | invalid border | 6.73 | 3 |
| ui | `color-success` #4ade80 | `color-canvas` #0b1320 | valid border | 10.68 | 3 |
| ui | `color-blue-600` #7eaaf5 | `color-canvas` #0b1320 | focus ring | 7.94 | 3 |
| ui | `color-text-muted` #9dabbf | `color-canvas` #0b1320 | input hover | 7.99 | 3 |
| ui | `color-field-border` #6f7f96 | `color-disabled-bg` #1a2537 | segmented edge | 3.78 | 3 |
| ui | `color-on-solid` #0b1320 | `color-blue-600` #7eaaf5 | checkmark | 7.94 | 3 |
| ui | `color-blue-600` #7eaaf5 | `color-blue-50` #15284a | selected option | 6.24 | 3 |
| ui | `color-blue-600` #7eaaf5 | `color-border` #28364d | selected tab edge | 5.19 | 3 |
| ui | `color-blue-400` #5f8fe0 | `color-card` #141f31 | done step | 5.11 | 3 |
| ui | `color-blue-600` #7eaaf5 | `color-card` #141f31 | slider | 7.05 | 3 |
| ui | `color-field-border` #6f7f96 | `color-card` #141f31 | slider edge | 4.06 | 3 |
| ui | `color-field-border` #6f7f96 | `color-surface` #111b2b | progress track | 4.24 | 3 |
| ui | `color-success` #4ade80 | `color-card` #141f31 | toast success | 9.49 | 3 |
| ui | `color-error` #f87171 | `color-card` #141f31 | toast error | 5.98 | 3 |
| ui | `color-info` #7eaaf5 | `color-card` #141f31 | toast info | 7.05 | 3 |
| ui | `color-warning` #fbbf24 | `color-card` #141f31 | toast warning | 9.9 | 3 |
| ui | `level-vl` #10b981 | `color-card` #141f31 | level vl bar | 6.52 | 3 |
| ui | `level-vl` #10b981 | `color-surface` #111b2b | level vl bar | 6.81 | 3 |
| ui | `level-l` #84cc16 | `color-card` #141f31 | level l bar | 8.37 | 3 |
| ui | `level-l` #84cc16 | `color-surface` #111b2b | level l bar | 8.75 | 3 |
| ui | `level-m` #f59e0b | `color-card` #141f31 | level m bar | 7.7 | 3 |
| ui | `level-m` #f59e0b | `color-surface` #111b2b | level m bar | 8.04 | 3 |
| ui | `level-h` #f97316 | `color-card` #141f31 | level h bar | 5.9 | 3 |
| ui | `level-h` #f97316 | `color-surface` #111b2b | level h bar | 6.16 | 3 |
| ui | `level-vh` #ef4444 | `color-card` #141f31 | level vh bar | 4.39 | 3 |
| ui | `level-vh` #ef4444 | `color-surface` #111b2b | level vh bar | 4.59 | 3 |
| ui | `chart-grid` #46566f | `color-card` #141f31 | chart grid line (new) | 2.22 | 2 (decorative) |
| ui | `chart-grid` #46566f | `color-surface` #111b2b | chart grid line (new) | 2.32 | 2 (decorative) |
| ui | `factor-rl` #6f7f96 | `color-card` #141f31 | RL bar (new) | 4.06 | 3 |
| ui | `factor-ri` #a9b6c8 | `color-card` #141f31 | RI_max bar (new) | 8.04 | 3 |
| ui | `factor-rl` #6f7f96 | `color-surface` #111b2b | RL bar (new) | 4.24 | 3 |
| ui | `factor-ri` #a9b6c8 | `color-surface` #111b2b | RI_max bar (new) | 8.4 | 3 |
