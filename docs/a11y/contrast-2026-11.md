# Colour contrast report, November 2026

Issues IO-210 (light) and IO-255 (dark). Checked against WCAG 2.2: 1.4.3 text (4.5:1, large text 3:1), 1.4.11 non-text (3:1), 1.4.1 colour is not the only cue.
Source of truth: `web/src/lib/contrast-pairs.ts`, checked by `web/src/lib/contrast.test.ts` in `web` CI.
Page states: `e2e/mock/contrast.spec.ts` (Playwright, mock mode).
Ratios below are WCAG 2.x relative luminance of the token values in `web/src/styles/tokens.css` after this change: the light `:root` values first, then the dark values of `:root[data-theme='dark']` (section "Dark theme").

## Summary

- 142 pairs: all 142 pass (18 of them within 0.3 of the limit), none fails, none is waived.
- Fixed in tokens: `--color-placeholder` `#8a97a8` to `#677689` (2.97:1 to 4.64:1 on white); `--color-blue-400` `#6e9be6` to `#4a80d8` (done progress step 2.28:1 to 3.91:1 on white, KPI hover border 2.80:1 to 3.91:1 on white).
- IO-226: the risk-scale solids and their `-on` text moved (VL `#10b981` to `#059669`, L `#84cc16` to `#65a30d`, M `#facc15` to `#d97706`, H `#f97316` to `#c2410c`, VH `#dc2626` to `#b91c1c`; `-on` VL `#021a10`, L `#102303`, M `#2b1d00`, H white). Solids reach 3:1 on cards, `-on` text 4.5:1. Tints and chips are unchanged. The destructive hover and pressed colours moved one step darker (`#991b1b`, `#7f1d1d`) so they differ from the new VH.
- IO-255: `--color-white` is split into `--color-card` (card, input and popup background) and `--color-on-solid` (text and icons on a solid fill). Both stay `#ffffff` in light, so no light ratio changed; the pairs are renamed to say which one they mean. `--color-white` remains a deprecated alias of `--color-card` until IO-261.
- Open: dashboard search field focus in forced colours (IO-221).

## Failures and near misses

No pair fails and none is waived.


Near misses (pass, within 0.3 of the limit):

- color-placeholder on color-card, input and select placeholder: 4.64:1 (needs 4.5:1)
- color-placeholder on color-surface, input and select placeholder: 4.52:1 (needs 4.5:1)
- color-success on color-canvas, field message, toast icon, step and status text: 4.55:1 (needs 4.5:1)
- color-warning on color-canvas, field message, toast icon, step and status text: 4.55:1 (needs 4.5:1)
- color-success on color-success-bg, success chip and alert: 4.54:1 (needs 4.5:1)
- color-warning on color-warning-bg, warning chip and alert: 4.60:1 (needs 4.5:1)
- color-warning on color-orange-50, orange KPI icon: 4.54:1 (needs 4.5:1)
- level-vl-text on level-vl-tint, level vl chip: 4.80:1 (needs 4.5:1)
- level-l-text on level-l-tint, level l chip: 4.52:1 (needs 4.5:1)
- level-h-text on level-h-tint, level h chip: 4.68:1 (needs 4.5:1)
- dim-ev on dim-ev-tint, dimension ev chip: 4.67:1 (needs 4.5:1)
- color-warning on color-warning-bg, TRANSFER idle: 4.60:1 (needs 4.5:1)
- color-field-border on color-canvas, input, select, checkbox, radio, chip border: 3.10:1 (needs 3:1)
- color-field-border on color-disabled-bg, segmented control edge: 3.02:1 (needs 3:1)
- level-l on color-card, level l bar, donut segment, legend dot: 3.09:1 (needs 3:1)
- level-l on color-surface, level l bar, donut segment, legend dot: 3.01:1 (needs 3:1)
- level-m on color-card, level m bar, donut segment, legend dot: 3.19:1 (needs 3:1)
- level-m on color-surface, level m bar, donut segment, legend dot: 3.10:1 (needs 3:1)

Design observations, not contrast failures (a decision for the design owner):

- The AVOID strategy reuses the EC dimension violet (`--dim-ec`), so the two cannot be told apart by colour. The strategy name is always printed, so 1.4.1 holds.
- Under colour-blind simulation EC (violet) is close to the primary blue, and EV (teal) is close to the success green. The dimension code is always printed next to the colour.

## Tokens not checked

| Token | Reason |
| --- | --- |
| `--color-blue-200` | Decorative: hover and pressed fills, no text. |
| `--color-orange-500` | Accent mark, never carries text or a boundary. |
| `--color-divider` | Decorative row separator. |
| `--chart-grid` | Decorative chart grid and axis tick lines: every value is printed. Target at least 2:1, not 3:1 (2.15:1 on white, 2.09:1 on surface). |
| `--color-disabled` | Inactive component text and the stepper connector are exempt (1.4.3, 1.4.11). |
| `--color-success-border` | Decorative edge of a chip that also has its background and text. |
| `--color-warning-border` | Decorative edge of a chip that also has its background and text. |
| `--color-error-border` | Decorative edge of a chip that also has its background and text. |
| `--color-info-border` | Decorative edge of a chip that also has its background and text. |

## Every pair (light)

| Kind | Foreground | Background | Used for | Ratio | Result |
| --- | --- | --- | --- | --- | --- |
| Text 4.5:1 | `color-text` #0f1e33 | `color-card` #ffffff | body, label, table and helper text | 16.75 | pass |
| Text 4.5:1 | `color-text` #0f1e33 | `color-surface` #fbfcfe | body, label, table and helper text | 16.32 | pass |
| Text 4.5:1 | `color-text` #0f1e33 | `color-canvas` #f1f4f8 | body, label, table and helper text | 15.18 | pass |
| Text 4.5:1 | `color-text` #0f1e33 | `color-subtle` #f6f8fb | body, label, table and helper text | 15.74 | pass |
| Text 4.5:1 | `color-text` #0f1e33 | `color-blue-50` #eaf1fd | body, label, table and helper text | 14.75 | pass |
| Text 4.5:1 | `color-text` #0f1e33 | `color-disabled-bg` #eef1f5 | body, label, table and helper text | 14.78 | pass |
| Text 4.5:1 | `color-text-secondary` #475569 | `color-card` #ffffff | body, label, table and helper text | 7.58 | pass |
| Text 4.5:1 | `color-text-secondary` #475569 | `color-surface` #fbfcfe | body, label, table and helper text | 7.38 | pass |
| Text 4.5:1 | `color-text-secondary` #475569 | `color-canvas` #f1f4f8 | body, label, table and helper text | 6.87 | pass |
| Text 4.5:1 | `color-text-secondary` #475569 | `color-subtle` #f6f8fb | body, label, table and helper text | 7.12 | pass |
| Text 4.5:1 | `color-text-secondary` #475569 | `color-blue-50` #eaf1fd | body, label, table and helper text | 6.68 | pass |
| Text 4.5:1 | `color-text-secondary` #475569 | `color-disabled-bg` #eef1f5 | body, label, table and helper text | 6.69 | pass |
| Text 4.5:1 | `color-text-muted` #57677d | `color-card` #ffffff | body, label, table and helper text | 5.77 | pass |
| Text 4.5:1 | `color-text-muted` #57677d | `color-surface` #fbfcfe | body, label, table and helper text | 5.62 | pass |
| Text 4.5:1 | `color-text-muted` #57677d | `color-canvas` #f1f4f8 | body, label, table and helper text | 5.23 | pass |
| Text 4.5:1 | `color-text-muted` #57677d | `color-subtle` #f6f8fb | body, label, table and helper text | 5.42 | pass |
| Text 4.5:1 | `color-text-muted` #57677d | `color-blue-50` #eaf1fd | body, label, table and helper text | 5.08 | pass |
| Text 4.5:1 | `color-text-muted` #57677d | `color-disabled-bg` #eef1f5 | body, label, table and helper text | 5.09 | pass |
| Text 4.5:1 | `color-text` #0f1e33 | `color-border` #e3e8ef | secondary button pressed | 13.60 | pass |
| Text 4.5:1 | `color-blue-600` #1e5bc6 | `color-card` #ffffff | link and ghost button text | 6.24 | pass |
| Text 4.5:1 | `color-blue-600` #1e5bc6 | `color-surface` #fbfcfe | link and ghost button text | 6.08 | pass |
| Text 4.5:1 | `color-blue-600` #1e5bc6 | `color-canvas` #f1f4f8 | link and ghost button text | 5.65 | pass |
| Text 4.5:1 | `color-blue-600` #1e5bc6 | `color-blue-50` #eaf1fd | link and ghost button text | 5.49 | pass |
| Text 4.5:1 | `color-blue-700` #174a9f | `color-blue-50` #eaf1fd | selected tab, ghost hover, KPI tag, pager | 7.35 | pass |
| Text 4.5:1 | `color-blue-700` #174a9f | `color-blue-100` #dce8fc | selected tab, ghost hover, KPI tag, pager | 6.75 | pass |
| Text 4.5:1 | `color-blue-700` #174a9f | `color-card` #ffffff | selected tab text | 8.34 | pass |
| Text 4.5:1 | `color-on-solid` #ffffff | `color-blue-600` #1e5bc6 | primary button, chosen chip, step number | 6.24 | pass |
| Text 4.5:1 | `color-on-solid` #ffffff | `color-blue-700` #174a9f | primary button, chosen chip, step number | 8.34 | pass |
| Text 4.5:1 | `color-on-solid` #ffffff | `color-blue-800` #133b77 | primary button, chosen chip, step number | 10.94 | pass |
| Text 4.5:1 | `color-on-solid` #ffffff | `color-navy-900` #0f2a4a | tooltip | 14.48 | pass |
| Text 4.5:1 | `color-on-solid` #ffffff | `color-success` #15803d | step "ดาวน์โหลดแล้ว" number | 5.02 | pass |
| Text 4.5:1 | `color-on-solid` #ffffff | `level-vh` #b91c1c | destructive button | 6.47 | pass |
| Text 4.5:1 | `color-on-solid` #ffffff | `color-danger-hover` #991b1b | destructive hover | 8.31 | pass |
| Text 4.5:1 | `color-on-solid` #ffffff | `color-danger-pressed` #7f1d1d | destructive pressed | 10.02 | pass |
| Text 4.5:1 | `color-on-solid` #ffffff | `color-error` #b91c1c | filled error mark | 6.47 | pass |
| Text 4.5:1 | `color-placeholder` #677689 | `color-card` #ffffff | input and select placeholder | 4.64 | pass (near) |
| Text 4.5:1 | `color-placeholder` #677689 | `color-surface` #fbfcfe | input and select placeholder | 4.52 | pass (near) |
| Text 4.5:1 | `color-error` #b91c1c | `color-card` #ffffff | field message, toast icon, step and status text | 6.47 | pass |
| Text 4.5:1 | `color-error` #b91c1c | `color-surface` #fbfcfe | field message, toast icon, step and status text | 6.30 | pass |
| Text 4.5:1 | `color-error` #b91c1c | `color-canvas` #f1f4f8 | field message, toast icon, step and status text | 5.86 | pass |
| Text 4.5:1 | `color-success` #15803d | `color-card` #ffffff | field message, toast icon, step and status text | 5.02 | pass |
| Text 4.5:1 | `color-success` #15803d | `color-surface` #fbfcfe | field message, toast icon, step and status text | 4.89 | pass |
| Text 4.5:1 | `color-success` #15803d | `color-canvas` #f1f4f8 | field message, toast icon, step and status text | 4.55 | pass (near) |
| Text 4.5:1 | `color-warning` #b45309 | `color-card` #ffffff | field message, toast icon, step and status text | 5.02 | pass |
| Text 4.5:1 | `color-warning` #b45309 | `color-surface` #fbfcfe | field message, toast icon, step and status text | 4.89 | pass |
| Text 4.5:1 | `color-warning` #b45309 | `color-canvas` #f1f4f8 | field message, toast icon, step and status text | 4.55 | pass (near) |
| Text 4.5:1 | `color-info` #1e5bc6 | `color-card` #ffffff | field message, toast icon, step and status text | 6.24 | pass |
| Text 4.5:1 | `color-info` #1e5bc6 | `color-surface` #fbfcfe | field message, toast icon, step and status text | 6.08 | pass |
| Text 4.5:1 | `color-info` #1e5bc6 | `color-canvas` #f1f4f8 | field message, toast icon, step and status text | 5.65 | pass |
| Text 4.5:1 | `color-success` #15803d | `color-success-bg` #e9f7ef | success chip and alert | 4.54 | pass (near) |
| Text 4.5:1 | `color-warning` #b45309 | `color-warning-bg` #fef4e2 | warning chip and alert | 4.60 | pass (near) |
| Text 4.5:1 | `color-error` #b91c1c | `color-error-bg` #fdecec | error chip and alert | 5.66 | pass |
| Text 4.5:1 | `color-info` #1e5bc6 | `color-info-bg` #eaf1fd | info chip and alert | 5.49 | pass |
| Text 4.5:1 | `color-warning` #b45309 | `color-orange-50` #fff1e6 | orange KPI icon | 4.54 | pass (near) |
| Text 4.5:1 | `color-text` #0f1e33 | `color-error-bg` #fdecec | invalid chip | 14.66 | pass |
| Text 4.5:1 | `color-text-secondary` #475569 | `color-warning-bg` #fef4e2 | warning body | 6.95 | pass |
| Text 4.5:1 | `level-vl-text` #0e7a4f | `level-vl-tint` #e6f6ee | level vl chip | 4.80 | pass (near) |
| Text 4.5:1 | `level-vl-text` #0e7a4f | `color-card` #ffffff | level vl text on a card | 5.36 | pass |
| Text 4.5:1 | `level-vl-on` #021a10 | `level-vl` #059669 | label inside a level vl bar | 4.81 | pass |
| Text 4.5:1 | `level-l-text` #4d7c0f | `level-l-tint` #eef7e0 | level l chip | 4.52 | pass (near) |
| Text 4.5:1 | `level-l-text` #4d7c0f | `color-card` #ffffff | level l text on a card | 4.99 | pass |
| Text 4.5:1 | `level-l-on` #102303 | `level-l` #65a30d | label inside a level l bar | 5.38 | pass |
| Text 4.5:1 | `level-m-text` #8a6100 | `level-m-tint` #fdf6d8 | level m chip | 5.10 | pass |
| Text 4.5:1 | `level-m-text` #8a6100 | `color-card` #ffffff | level m text on a card | 5.54 | pass |
| Text 4.5:1 | `level-m-on` #2b1d00 | `level-m` #d97706 | label inside a level m bar | 5.16 | pass |
| Text 4.5:1 | `level-h-text` #c2410c | `level-h-tint` #fff1e6 | level h chip | 4.68 | pass (near) |
| Text 4.5:1 | `level-h-text` #c2410c | `color-card` #ffffff | level h text on a card | 5.18 | pass |
| Text 4.5:1 | `level-h-on` #ffffff | `level-h` #c2410c | label inside a level h bar | 5.18 | pass |
| Text 4.5:1 | `level-vh-text` #b42318 | `level-vh-tint` #fde7e5 | level vh chip | 5.55 | pass |
| Text 4.5:1 | `level-vh-text` #b42318 | `color-card` #ffffff | level vh text on a card | 6.57 | pass |
| Text 4.5:1 | `level-vh-on` #ffffff | `level-vh` #b91c1c | label inside a level vh bar | 6.47 | pass |
| Text 4.5:1 | `dim-ec` #4c2a92 | `color-card` #ffffff | dimension ec text | 10.23 | pass |
| Text 4.5:1 | `dim-ec` #4c2a92 | `color-surface` #fbfcfe | dimension ec text | 9.96 | pass |
| Text 4.5:1 | `dim-ec` #4c2a92 | `dim-ec-tint` #edeaf4 | dimension ec chip | 8.61 | pass |
| Text 4.5:1 | `color-text` #0f1e33 | `dim-ec-tint` #edeaf4 | dimension ec group header | 14.10 | pass |
| Non-text 3:1 | `dim-ec` #4c2a92 | `color-surface` #fbfcfe | dimension ec 4 px side bar | 9.96 | pass |
| Non-text 3:1 | `dim-ec` #4c2a92 | `dim-ec-tint` #edeaf4 | dimension ec bar on its tint | 8.61 | pass |
| Text 4.5:1 | `dim-so` #a8327a | `color-card` #ffffff | dimension so text | 6.17 | pass |
| Text 4.5:1 | `dim-so` #a8327a | `color-surface` #fbfcfe | dimension so text | 6.01 | pass |
| Text 4.5:1 | `dim-so` #a8327a | `dim-so-tint` #f6eaf2 | dimension so chip | 5.28 | pass |
| Text 4.5:1 | `color-text` #0f1e33 | `dim-so-tint` #f6eaf2 | dimension so group header | 14.33 | pass |
| Non-text 3:1 | `dim-so` #a8327a | `color-surface` #fbfcfe | dimension so 4 px side bar | 6.01 | pass |
| Non-text 3:1 | `dim-so` #a8327a | `dim-so-tint` #f6eaf2 | dimension so bar on its tint | 5.28 | pass |
| Text 4.5:1 | `dim-ev` #0e7490 | `color-card` #ffffff | dimension ev text | 5.36 | pass |
| Text 4.5:1 | `dim-ev` #0e7490 | `color-surface` #fbfcfe | dimension ev text | 5.22 | pass |
| Text 4.5:1 | `dim-ev` #0e7490 | `dim-ev-tint` #e7f1f4 | dimension ev chip | 4.67 | pass (near) |
| Text 4.5:1 | `color-text` #0f1e33 | `dim-ev-tint` #e7f1f4 | dimension ev group header | 14.58 | pass |
| Non-text 3:1 | `dim-ev` #0e7490 | `color-surface` #fbfcfe | dimension ev 4 px side bar | 5.22 | pass |
| Non-text 3:1 | `dim-ev` #0e7490 | `dim-ev-tint` #e7f1f4 | dimension ev bar on its tint | 4.67 | pass |
| Text 4.5:1 | `color-blue-700` #174a9f | `color-blue-50` #eaf1fd | REDUCE idle | 7.35 | pass |
| Text 4.5:1 | `dim-ec` #4c2a92 | `dim-ec-tint` #edeaf4 | AVOID idle (reuses the EC violet) | 8.61 | pass |
| Text 4.5:1 | `color-warning` #b45309 | `color-warning-bg` #fef4e2 | TRANSFER idle | 4.60 | pass (near) |
| Text 4.5:1 | `color-text-secondary` #475569 | `color-subtle` #f6f8fb | ACCEPT idle | 7.12 | pass |
| Text 4.5:1 | `color-on-solid` #ffffff | `color-blue-700` #174a9f | strategy chosen | 8.34 | pass |
| Non-text 3:1 | `color-blue-700` #174a9f | `color-surface` #fbfcfe | strategy border | 8.13 | pass |
| Text 4.5:1 | `color-on-solid` #ffffff | `dim-ec` #4c2a92 | strategy chosen | 10.23 | pass |
| Non-text 3:1 | `dim-ec` #4c2a92 | `color-surface` #fbfcfe | strategy border | 9.96 | pass |
| Text 4.5:1 | `color-on-solid` #ffffff | `color-warning` #b45309 | strategy chosen | 5.02 | pass |
| Non-text 3:1 | `color-warning` #b45309 | `color-surface` #fbfcfe | strategy border | 4.89 | pass |
| Text 4.5:1 | `color-on-solid` #ffffff | `color-text-secondary` #475569 | strategy chosen | 7.58 | pass |
| Non-text 3:1 | `color-text-secondary` #475569 | `color-surface` #fbfcfe | strategy border | 7.38 | pass |
| Large text 3:1 | `color-text` #0f1e33 | `color-surface` #fbfcfe | KPI number | 16.32 | pass |
| Large text 3:1 | `color-text` #0f1e33 | `color-card` #ffffff | KPI number, selected | 16.75 | pass |
| Large text 3:1 | `color-text` #0f1e33 | `color-card` #ffffff | donut centre value | 16.75 | pass |
| Non-text 3:1 | `color-field-border` #7f8c9e | `color-card` #ffffff | input, select, checkbox, radio, chip border | 3.42 | pass |
| Non-text 3:1 | `color-error` #b91c1c | `color-card` #ffffff | invalid input border | 6.47 | pass |
| Non-text 3:1 | `color-success` #15803d | `color-card` #ffffff | valid input border | 5.02 | pass |
| Non-text 3:1 | `color-blue-600` #1e5bc6 | `color-card` #ffffff | focus ring, tab indicator, checked box | 6.24 | pass |
| Non-text 3:1 | `color-text-muted` #57677d | `color-card` #ffffff | input hover border | 5.77 | pass |
| Non-text 3:1 | `color-field-border` #7f8c9e | `color-surface` #fbfcfe | input, select, checkbox, radio, chip border | 3.33 | pass |
| Non-text 3:1 | `color-error` #b91c1c | `color-surface` #fbfcfe | invalid input border | 6.30 | pass |
| Non-text 3:1 | `color-success` #15803d | `color-surface` #fbfcfe | valid input border | 4.89 | pass |
| Non-text 3:1 | `color-blue-600` #1e5bc6 | `color-surface` #fbfcfe | focus ring, tab indicator, checked box | 6.08 | pass |
| Non-text 3:1 | `color-text-muted` #57677d | `color-surface` #fbfcfe | input hover border | 5.62 | pass |
| Non-text 3:1 | `color-field-border` #7f8c9e | `color-canvas` #f1f4f8 | input, select, checkbox, radio, chip border | 3.10 | pass (near) |
| Non-text 3:1 | `color-error` #b91c1c | `color-canvas` #f1f4f8 | invalid input border | 5.86 | pass |
| Non-text 3:1 | `color-success` #15803d | `color-canvas` #f1f4f8 | valid input border | 4.55 | pass |
| Non-text 3:1 | `color-blue-600` #1e5bc6 | `color-canvas` #f1f4f8 | focus ring, tab indicator, checked box | 5.65 | pass |
| Non-text 3:1 | `color-text-muted` #57677d | `color-canvas` #f1f4f8 | input hover border | 5.23 | pass |
| Non-text 3:1 | `color-field-border` #7f8c9e | `color-disabled-bg` #eef1f5 | segmented control edge | 3.02 | pass (near) |
| Non-text 3:1 | `color-on-solid` #ffffff | `color-blue-600` #1e5bc6 | checkmark and dash in a checked box | 6.24 | pass |
| Non-text 3:1 | `color-blue-600` #1e5bc6 | `color-blue-50` #eaf1fd | selected option, pager edge | 5.49 | pass |
| Non-text 3:1 | `color-blue-600` #1e5bc6 | `color-border` #e3e8ef | selected tab edge, current progress step | 5.07 | pass |
| Non-text 3:1 | `color-blue-400` #4a80d8 | `color-card` #ffffff | done progress step | 3.91 | pass |
| Non-text 3:1 | `color-blue-400` #4a80d8 | `color-card` #ffffff | KPI hover border, compare series | 3.91 | pass |
| Non-text 3:1 | `color-blue-600` #1e5bc6 | `color-card` #ffffff | slider range and thumb border | 6.24 | pass |
| Non-text 3:1 | `color-field-border` #7f8c9e | `color-card` #ffffff | slider track edge (1 px border on the blue-100 fill) | 3.42 | pass |
| Non-text 3:1 | `color-field-border` #7f8c9e | `color-surface` #fbfcfe | progress track (steps not yet done) | 3.33 | pass |
| Non-text 3:1 | `color-success` #15803d | `color-card` #ffffff | toast success edge and icon | 5.02 | pass |
| Non-text 3:1 | `color-error` #b91c1c | `color-card` #ffffff | toast error edge and icon | 6.47 | pass |
| Non-text 3:1 | `color-info` #1e5bc6 | `color-card` #ffffff | toast info edge and icon | 6.24 | pass |
| Non-text 3:1 | `color-warning` #b45309 | `color-card` #ffffff | toast warning edge and icon | 5.02 | pass |
| Non-text 3:1 | `level-vl` #059669 | `color-card` #ffffff | level vl bar, donut segment, legend dot | 3.77 | pass |
| Non-text 3:1 | `level-vl` #059669 | `color-surface` #fbfcfe | level vl bar, donut segment, legend dot | 3.67 | pass |
| Non-text 3:1 | `level-l` #65a30d | `color-card` #ffffff | level l bar, donut segment, legend dot | 3.09 | pass (near) |
| Non-text 3:1 | `level-l` #65a30d | `color-surface` #fbfcfe | level l bar, donut segment, legend dot | 3.01 | pass (near) |
| Non-text 3:1 | `level-m` #d97706 | `color-card` #ffffff | level m bar, donut segment, legend dot | 3.19 | pass (near) |
| Non-text 3:1 | `level-m` #d97706 | `color-surface` #fbfcfe | level m bar, donut segment, legend dot | 3.10 | pass (near) |
| Non-text 3:1 | `level-h` #c2410c | `color-card` #ffffff | level h bar, donut segment, legend dot | 5.18 | pass |
| Non-text 3:1 | `level-h` #c2410c | `color-surface` #fbfcfe | level h bar, donut segment, legend dot | 5.04 | pass |
| Non-text 3:1 | `level-vh` #b91c1c | `color-card` #ffffff | level vh bar, donut segment, legend dot | 6.47 | pass |
| Non-text 3:1 | `level-vh` #b91c1c | `color-surface` #fbfcfe | level vh bar, donut segment, legend dot | 6.30 | pass |

## Dark theme

Palette: `docs/specs/ux-ui/feedback/2026-11-27/dark-palette.md`, approved 28 Nov 2026. Same token names; the dark values are in `:root[data-theme='dark']`. `contrast.test.ts` checks every pair above against both themes, checks that every colour token has a dark value, and that dark has no near miss.

- 142 pairs: all pass, none within 0.3 of the limit, none waived.
- Lowest text: 4.95:1 (`color-on-solid` on `level-vh`, the destructive button). Lowest non-text: 3.78:1 (`color-field-border` on `color-disabled-bg`, the segmented control edge).
- Dark solids are light tones with dark text on them, so `color-on-solid` is `#0b1320` in dark (white in light).
- `chart-grid` is decorative (every value is printed) and targets 2:1, not 3:1: 2.22:1 on the card, 2.32:1 on the surface (light 2.15:1 and 2.09:1).
- Not in the palette, so chosen here, and not checked (decorative, as in light): the chip borders `color-success-border` `#1d5136`, `color-warning-border` `#5c4415`, `color-error-border` `#5e2529`, `color-info-border` `#244079` (the dark `color-blue-200`, as in light). `color-blue-200`, `color-orange-500`, `color-divider` and `color-disabled` have the palette values and are not checked for the same reasons as in light.
- `factor-rl` and `factor-ri` from the palette are added with their pairs in IO-259, where the factor chart moves onto theme tokens.

Near misses: none.

### Every pair (dark)

| Kind | Foreground | Background | Used for | Ratio | Result |
| --- | --- | --- | --- | --- | --- |
| Text 4.5:1 | `color-text` #e7edf5 | `color-card` #141f31 | body, label, table and helper text | 14.04 | pass |
| Text 4.5:1 | `color-text` #e7edf5 | `color-surface` #111b2b | body, label, table and helper text | 14.67 | pass |
| Text 4.5:1 | `color-text` #e7edf5 | `color-canvas` #0b1320 | body, label, table and helper text | 15.80 | pass |
| Text 4.5:1 | `color-text` #e7edf5 | `color-subtle` #172336 | body, label, table and helper text | 13.40 | pass |
| Text 4.5:1 | `color-text` #e7edf5 | `color-blue-50` #15284a | body, label, table and helper text | 12.43 | pass |
| Text 4.5:1 | `color-text` #e7edf5 | `color-disabled-bg` #1a2537 | body, label, table and helper text | 13.07 | pass |
| Text 4.5:1 | `color-text-secondary` #b8c3d2 | `color-card` #141f31 | body, label, table and helper text | 9.27 | pass |
| Text 4.5:1 | `color-text-secondary` #b8c3d2 | `color-surface` #111b2b | body, label, table and helper text | 9.69 | pass |
| Text 4.5:1 | `color-text-secondary` #b8c3d2 | `color-canvas` #0b1320 | body, label, table and helper text | 10.44 | pass |
| Text 4.5:1 | `color-text-secondary` #b8c3d2 | `color-subtle` #172336 | body, label, table and helper text | 8.85 | pass |
| Text 4.5:1 | `color-text-secondary` #b8c3d2 | `color-blue-50` #15284a | body, label, table and helper text | 8.21 | pass |
| Text 4.5:1 | `color-text-secondary` #b8c3d2 | `color-disabled-bg` #1a2537 | body, label, table and helper text | 8.63 | pass |
| Text 4.5:1 | `color-text-muted` #9dabbf | `color-card` #141f31 | body, label, table and helper text | 7.09 | pass |
| Text 4.5:1 | `color-text-muted` #9dabbf | `color-surface` #111b2b | body, label, table and helper text | 7.41 | pass |
| Text 4.5:1 | `color-text-muted` #9dabbf | `color-canvas` #0b1320 | body, label, table and helper text | 7.99 | pass |
| Text 4.5:1 | `color-text-muted` #9dabbf | `color-subtle` #172336 | body, label, table and helper text | 6.77 | pass |
| Text 4.5:1 | `color-text-muted` #9dabbf | `color-blue-50` #15284a | body, label, table and helper text | 6.28 | pass |
| Text 4.5:1 | `color-text-muted` #9dabbf | `color-disabled-bg` #1a2537 | body, label, table and helper text | 6.61 | pass |
| Text 4.5:1 | `color-text` #e7edf5 | `color-border` #28364d | secondary button pressed | 10.34 | pass |
| Text 4.5:1 | `color-blue-600` #7eaaf5 | `color-card` #141f31 | link and ghost button text | 7.05 | pass |
| Text 4.5:1 | `color-blue-600` #7eaaf5 | `color-surface` #111b2b | link and ghost button text | 7.37 | pass |
| Text 4.5:1 | `color-blue-600` #7eaaf5 | `color-canvas` #0b1320 | link and ghost button text | 7.94 | pass |
| Text 4.5:1 | `color-blue-600` #7eaaf5 | `color-blue-50` #15284a | link and ghost button text | 6.24 | pass |
| Text 4.5:1 | `color-blue-700` #a6c5fa | `color-blue-50` #15284a | selected tab, ghost hover, KPI tag, pager | 8.36 | pass |
| Text 4.5:1 | `color-blue-700` #a6c5fa | `color-blue-100` #1c3463 | selected tab, ghost hover, KPI tag, pager | 6.97 | pass |
| Text 4.5:1 | `color-blue-700` #a6c5fa | `color-card` #141f31 | selected tab text | 9.44 | pass |
| Text 4.5:1 | `color-on-solid` #0b1320 | `color-blue-600` #7eaaf5 | primary button, chosen chip, step number | 7.94 | pass |
| Text 4.5:1 | `color-on-solid` #0b1320 | `color-blue-700` #a6c5fa | primary button, chosen chip, step number | 10.63 | pass |
| Text 4.5:1 | `color-on-solid` #0b1320 | `color-blue-800` #c4d9fc | primary button, chosen chip, step number | 13.01 | pass |
| Text 4.5:1 | `color-on-solid` #0b1320 | `color-navy-900` #dbe4ef | tooltip | 14.50 | pass |
| Text 4.5:1 | `color-on-solid` #0b1320 | `color-success` #4ade80 | step "ดาวน์โหลดแล้ว" number | 10.68 | pass |
| Text 4.5:1 | `color-on-solid` #0b1320 | `level-vh` #ef4444 | destructive button | 4.95 | pass |
| Text 4.5:1 | `color-on-solid` #0b1320 | `color-danger-hover` #fca5a5 | destructive hover | 9.81 | pass |
| Text 4.5:1 | `color-on-solid` #0b1320 | `color-danger-pressed` #fecaca | destructive pressed | 12.87 | pass |
| Text 4.5:1 | `color-on-solid` #0b1320 | `color-error` #f87171 | filled error mark | 6.73 | pass |
| Text 4.5:1 | `color-placeholder` #8d9bb0 | `color-card` #141f31 | input and select placeholder | 5.86 | pass |
| Text 4.5:1 | `color-placeholder` #8d9bb0 | `color-surface` #111b2b | input and select placeholder | 6.13 | pass |
| Text 4.5:1 | `color-error` #f87171 | `color-card` #141f31 | field message, toast icon, step and status text | 5.98 | pass |
| Text 4.5:1 | `color-error` #f87171 | `color-surface` #111b2b | field message, toast icon, step and status text | 6.25 | pass |
| Text 4.5:1 | `color-error` #f87171 | `color-canvas` #0b1320 | field message, toast icon, step and status text | 6.73 | pass |
| Text 4.5:1 | `color-success` #4ade80 | `color-card` #141f31 | field message, toast icon, step and status text | 9.49 | pass |
| Text 4.5:1 | `color-success` #4ade80 | `color-surface` #111b2b | field message, toast icon, step and status text | 9.91 | pass |
| Text 4.5:1 | `color-success` #4ade80 | `color-canvas` #0b1320 | field message, toast icon, step and status text | 10.68 | pass |
| Text 4.5:1 | `color-warning` #fbbf24 | `color-card` #141f31 | field message, toast icon, step and status text | 9.90 | pass |
| Text 4.5:1 | `color-warning` #fbbf24 | `color-surface` #111b2b | field message, toast icon, step and status text | 10.35 | pass |
| Text 4.5:1 | `color-warning` #fbbf24 | `color-canvas` #0b1320 | field message, toast icon, step and status text | 11.15 | pass |
| Text 4.5:1 | `color-info` #7eaaf5 | `color-card` #141f31 | field message, toast icon, step and status text | 7.05 | pass |
| Text 4.5:1 | `color-info` #7eaaf5 | `color-surface` #111b2b | field message, toast icon, step and status text | 7.37 | pass |
| Text 4.5:1 | `color-info` #7eaaf5 | `color-canvas` #0b1320 | field message, toast icon, step and status text | 7.94 | pass |
| Text 4.5:1 | `color-success` #4ade80 | `color-success-bg` #0f2a1c | success chip and alert | 8.81 | pass |
| Text 4.5:1 | `color-warning` #fbbf24 | `color-warning-bg` #2d2110 | warning chip and alert | 9.41 | pass |
| Text 4.5:1 | `color-error` #f87171 | `color-error-bg` #331619 | error chip and alert | 5.98 | pass |
| Text 4.5:1 | `color-info` #7eaaf5 | `color-info-bg` #15284a | info chip and alert | 6.24 | pass |
| Text 4.5:1 | `color-warning` #fbbf24 | `color-orange-50` #2e1d0e | orange KPI icon | 9.69 | pass |
| Text 4.5:1 | `color-text` #e7edf5 | `color-error-bg` #331619 | invalid chip | 14.04 | pass |
| Text 4.5:1 | `color-text-secondary` #b8c3d2 | `color-warning-bg` #2d2110 | warning body | 8.81 | pass |
| Text 4.5:1 | `level-vl-text` #6ee7b7 | `level-vl-tint` #0e2a20 | level vl chip | 10.05 | pass |
| Text 4.5:1 | `level-vl-text` #6ee7b7 | `color-card` #141f31 | level vl text on a card | 10.85 | pass |
| Text 4.5:1 | `level-vl-on` #02140c | `level-vl` #10b981 | label inside a level vl bar | 7.47 | pass |
| Text 4.5:1 | `level-l-text` #a3e635 | `level-l-tint` #1c2a0c | level l chip | 10.05 | pass |
| Text 4.5:1 | `level-l-text` #a3e635 | `color-card` #141f31 | level l text on a card | 10.97 | pass |
| Text 4.5:1 | `level-l-on` #111d02 | `level-l` #84cc16 | label inside a level l bar | 8.85 | pass |
| Text 4.5:1 | `level-m-text` #fcd34d | `level-m-tint` #2d2410 | level m chip | 10.62 | pass |
| Text 4.5:1 | `level-m-text` #fcd34d | `color-card` #141f31 | level m text on a card | 11.47 | pass |
| Text 4.5:1 | `level-m-on` #231700 | `level-m` #f59e0b | label inside a level m bar | 8.19 | pass |
| Text 4.5:1 | `level-h-text` #fdba74 | `level-h-tint` #33190b | level h chip | 9.69 | pass |
| Text 4.5:1 | `level-h-text` #fdba74 | `color-card` #141f31 | level h text on a card | 9.80 | pass |
| Text 4.5:1 | `level-h-on` #1f0c02 | `level-h` #f97316 | label inside a level h bar | 6.74 | pass |
| Text 4.5:1 | `level-vh-text` #fca5a5 | `level-vh-tint` #361416 | level vh chip | 8.72 | pass |
| Text 4.5:1 | `level-vh-text` #fca5a5 | `color-card` #141f31 | level vh text on a card | 8.71 | pass |
| Text 4.5:1 | `level-vh-on` #1f0505 | `level-vh` #ef4444 | label inside a level vh bar | 5.16 | pass |
| Text 4.5:1 | `dim-ec` #b9a4f0 | `color-card` #141f31 | dimension ec text | 7.58 | pass |
| Text 4.5:1 | `dim-ec` #b9a4f0 | `color-surface` #111b2b | dimension ec text | 7.92 | pass |
| Text 4.5:1 | `dim-ec` #b9a4f0 | `dim-ec-tint` #241d3d | dimension ec chip | 7.31 | pass |
| Text 4.5:1 | `color-text` #e7edf5 | `dim-ec-tint` #241d3d | dimension ec group header | 13.53 | pass |
| Non-text 3:1 | `dim-ec` #b9a4f0 | `color-surface` #111b2b | dimension ec 4 px side bar | 7.92 | pass |
| Non-text 3:1 | `dim-ec` #b9a4f0 | `dim-ec-tint` #241d3d | dimension ec bar on its tint | 7.31 | pass |
| Text 4.5:1 | `dim-so` #f19acb | `color-card` #141f31 | dimension so text | 8.05 | pass |
| Text 4.5:1 | `dim-so` #f19acb | `color-surface` #111b2b | dimension so text | 8.41 | pass |
| Text 4.5:1 | `dim-so` #f19acb | `dim-so-tint` #331a2b | dimension so chip | 7.73 | pass |
| Text 4.5:1 | `color-text` #e7edf5 | `dim-so-tint` #331a2b | dimension so group header | 13.47 | pass |
| Non-text 3:1 | `dim-so` #f19acb | `color-surface` #111b2b | dimension so 4 px side bar | 8.41 | pass |
| Non-text 3:1 | `dim-so` #f19acb | `dim-so-tint` #331a2b | dimension so bar on its tint | 7.73 | pass |
| Text 4.5:1 | `dim-ev` #5ccde6 | `color-card` #141f31 | dimension ev text | 8.92 | pass |
| Text 4.5:1 | `dim-ev` #5ccde6 | `color-surface` #111b2b | dimension ev text | 9.32 | pass |
| Text 4.5:1 | `dim-ev` #5ccde6 | `dim-ev-tint` #0f2a33 | dimension ev chip | 8.10 | pass |
| Text 4.5:1 | `color-text` #e7edf5 | `dim-ev-tint` #0f2a33 | dimension ev group header | 12.74 | pass |
| Non-text 3:1 | `dim-ev` #5ccde6 | `color-surface` #111b2b | dimension ev 4 px side bar | 9.32 | pass |
| Non-text 3:1 | `dim-ev` #5ccde6 | `dim-ev-tint` #0f2a33 | dimension ev bar on its tint | 8.10 | pass |
| Text 4.5:1 | `color-blue-700` #a6c5fa | `color-blue-50` #15284a | REDUCE idle | 8.36 | pass |
| Text 4.5:1 | `dim-ec` #b9a4f0 | `dim-ec-tint` #241d3d | AVOID idle (reuses the EC violet) | 7.31 | pass |
| Text 4.5:1 | `color-warning` #fbbf24 | `color-warning-bg` #2d2110 | TRANSFER idle | 9.41 | pass |
| Text 4.5:1 | `color-text-secondary` #b8c3d2 | `color-subtle` #172336 | ACCEPT idle | 8.85 | pass |
| Text 4.5:1 | `color-on-solid` #0b1320 | `color-blue-700` #a6c5fa | strategy chosen | 10.63 | pass |
| Non-text 3:1 | `color-blue-700` #a6c5fa | `color-surface` #111b2b | strategy border | 9.86 | pass |
| Text 4.5:1 | `color-on-solid` #0b1320 | `dim-ec` #b9a4f0 | strategy chosen | 8.54 | pass |
| Non-text 3:1 | `dim-ec` #b9a4f0 | `color-surface` #111b2b | strategy border | 7.92 | pass |
| Text 4.5:1 | `color-on-solid` #0b1320 | `color-warning` #fbbf24 | strategy chosen | 11.15 | pass |
| Non-text 3:1 | `color-warning` #fbbf24 | `color-surface` #111b2b | strategy border | 10.35 | pass |
| Text 4.5:1 | `color-on-solid` #0b1320 | `color-text-secondary` #b8c3d2 | strategy chosen | 10.44 | pass |
| Non-text 3:1 | `color-text-secondary` #b8c3d2 | `color-surface` #111b2b | strategy border | 9.69 | pass |
| Large text 3:1 | `color-text` #e7edf5 | `color-surface` #111b2b | KPI number | 14.67 | pass |
| Large text 3:1 | `color-text` #e7edf5 | `color-card` #141f31 | KPI number, selected | 14.04 | pass |
| Large text 3:1 | `color-text` #e7edf5 | `color-card` #141f31 | donut centre value | 14.04 | pass |
| Non-text 3:1 | `color-field-border` #6f7f96 | `color-card` #141f31 | input, select, checkbox, radio, chip border | 4.06 | pass |
| Non-text 3:1 | `color-error` #f87171 | `color-card` #141f31 | invalid input border | 5.98 | pass |
| Non-text 3:1 | `color-success` #4ade80 | `color-card` #141f31 | valid input border | 9.49 | pass |
| Non-text 3:1 | `color-blue-600` #7eaaf5 | `color-card` #141f31 | focus ring, tab indicator, checked box | 7.05 | pass |
| Non-text 3:1 | `color-text-muted` #9dabbf | `color-card` #141f31 | input hover border | 7.09 | pass |
| Non-text 3:1 | `color-field-border` #6f7f96 | `color-surface` #111b2b | input, select, checkbox, radio, chip border | 4.24 | pass |
| Non-text 3:1 | `color-error` #f87171 | `color-surface` #111b2b | invalid input border | 6.25 | pass |
| Non-text 3:1 | `color-success` #4ade80 | `color-surface` #111b2b | valid input border | 9.91 | pass |
| Non-text 3:1 | `color-blue-600` #7eaaf5 | `color-surface` #111b2b | focus ring, tab indicator, checked box | 7.37 | pass |
| Non-text 3:1 | `color-text-muted` #9dabbf | `color-surface` #111b2b | input hover border | 7.41 | pass |
| Non-text 3:1 | `color-field-border` #6f7f96 | `color-canvas` #0b1320 | input, select, checkbox, radio, chip border | 4.57 | pass |
| Non-text 3:1 | `color-error` #f87171 | `color-canvas` #0b1320 | invalid input border | 6.73 | pass |
| Non-text 3:1 | `color-success` #4ade80 | `color-canvas` #0b1320 | valid input border | 10.68 | pass |
| Non-text 3:1 | `color-blue-600` #7eaaf5 | `color-canvas` #0b1320 | focus ring, tab indicator, checked box | 7.94 | pass |
| Non-text 3:1 | `color-text-muted` #9dabbf | `color-canvas` #0b1320 | input hover border | 7.99 | pass |
| Non-text 3:1 | `color-field-border` #6f7f96 | `color-disabled-bg` #1a2537 | segmented control edge | 3.78 | pass |
| Non-text 3:1 | `color-on-solid` #0b1320 | `color-blue-600` #7eaaf5 | checkmark and dash in a checked box | 7.94 | pass |
| Non-text 3:1 | `color-blue-600` #7eaaf5 | `color-blue-50` #15284a | selected option, pager edge | 6.24 | pass |
| Non-text 3:1 | `color-blue-600` #7eaaf5 | `color-border` #28364d | selected tab edge, current progress step | 5.19 | pass |
| Non-text 3:1 | `color-blue-400` #5f8fe0 | `color-card` #141f31 | done progress step | 5.11 | pass |
| Non-text 3:1 | `color-blue-400` #5f8fe0 | `color-card` #141f31 | KPI hover border, compare series | 5.11 | pass |
| Non-text 3:1 | `color-blue-600` #7eaaf5 | `color-card` #141f31 | slider range and thumb border | 7.05 | pass |
| Non-text 3:1 | `color-field-border` #6f7f96 | `color-card` #141f31 | slider track edge (1 px border on the blue-100 fill) | 4.06 | pass |
| Non-text 3:1 | `color-field-border` #6f7f96 | `color-surface` #111b2b | progress track (steps not yet done) | 4.24 | pass |
| Non-text 3:1 | `color-success` #4ade80 | `color-card` #141f31 | toast success edge and icon | 9.49 | pass |
| Non-text 3:1 | `color-error` #f87171 | `color-card` #141f31 | toast error edge and icon | 5.98 | pass |
| Non-text 3:1 | `color-info` #7eaaf5 | `color-card` #141f31 | toast info edge and icon | 7.05 | pass |
| Non-text 3:1 | `color-warning` #fbbf24 | `color-card` #141f31 | toast warning edge and icon | 9.90 | pass |
| Non-text 3:1 | `level-vl` #10b981 | `color-card` #141f31 | level vl bar, donut segment, legend dot | 6.52 | pass |
| Non-text 3:1 | `level-vl` #10b981 | `color-surface` #111b2b | level vl bar, donut segment, legend dot | 6.81 | pass |
| Non-text 3:1 | `level-l` #84cc16 | `color-card` #141f31 | level l bar, donut segment, legend dot | 8.37 | pass |
| Non-text 3:1 | `level-l` #84cc16 | `color-surface` #111b2b | level l bar, donut segment, legend dot | 8.75 | pass |
| Non-text 3:1 | `level-m` #f59e0b | `color-card` #141f31 | level m bar, donut segment, legend dot | 7.70 | pass |
| Non-text 3:1 | `level-m` #f59e0b | `color-surface` #111b2b | level m bar, donut segment, legend dot | 8.04 | pass |
| Non-text 3:1 | `level-h` #f97316 | `color-card` #141f31 | level h bar, donut segment, legend dot | 5.90 | pass |
| Non-text 3:1 | `level-h` #f97316 | `color-surface` #111b2b | level h bar, donut segment, legend dot | 6.16 | pass |
| Non-text 3:1 | `level-vh` #ef4444 | `color-card` #141f31 | level vh bar, donut segment, legend dot | 4.39 | pass |
| Non-text 3:1 | `level-vh` #ef4444 | `color-surface` #111b2b | level vh bar, donut segment, legend dot | 4.59 | pass |

## Page states checked (Playwright, mock mode)

Run: `E2E_MOCK_PORT=<port> pnpm --dir e2e exec playwright test -c playwright.mock.config.ts contrast.spec.ts --workers=1`.

Pages: dashboard, projects, project (overview and versions tab, RM view), new and edit project, assessment, results, plan, account, and the six admin pages.

| State | What is read | Where |
| --- | --- | --- |
| Default | Computed text colour against the real background of every visible text element, with the large-text limit for 24 px or 18.66 px bold; computed border colour of every input, select and combobox against its surroundings. Text on a gradient or image is listed, not measured. | every page |
| Hover | The first element of each kind of interactive element, re-measured while hovered. | every page, desktop |
| Focus-visible | A Tab walk of up to 18 stops: the ring (outline or the token box-shadow band) against the nearest solid background must reach 3:1. | every page, desktop |
| Selected | Elements with aria-selected, aria-checked, aria-pressed or aria-current. | versions tab, plan |
| Error | Invalid fields of the new project form after a failed save, and the character counter over its limit (121 / 120): edge present, message in text, text contrast. | new project |
| Disabled | Exempt from 1.4.3 and 1.4.11. Listed only: the submitted assessment has disabled controls. | assessment |
| Forced colours | Controls keep a border or a text label, the focused element keeps an outline. | every page, desktop |
| Colour is not the only cue | Level codes (VL to VH), dimension codes (EC, SO, EV) and strategy names are text; each donut level row has a code and a count. | results, dashboard, plan |
