# Colour contrast report, November 2026

Issue IO-210. Checked against WCAG 2.2: 1.4.3 text (4.5:1, large text 3:1), 1.4.11 non-text (3:1), 1.4.1 colour is not the only cue.
Source of truth: `web/src/lib/contrast-pairs.ts`, checked by `web/src/lib/contrast.test.ts` in `web` CI.
Page states: `e2e/mock/contrast.spec.ts` (Playwright, mock mode).
Ratios below are WCAG 2.x relative luminance of the token values in `web/src/styles/tokens.css` after this change.

## Summary

- 142 pairs: all 142 pass (18 of them within 0.3 of the limit), none fails, none is waived.
- Fixed in tokens: `--color-placeholder` `#8a97a8` to `#677689` (2.97:1 to 4.64:1 on white); `--color-blue-400` `#6e9be6` to `#4a80d8` (done progress step 2.28:1 to 3.91:1 on white, KPI hover border 2.80:1 to 3.91:1 on white).
- IO-226: the risk-scale solids and their `-on` text moved (VL `#10b981` to `#059669`, L `#84cc16` to `#65a30d`, M `#facc15` to `#d97706`, H `#f97316` to `#c2410c`, VH `#dc2626` to `#b91c1c`; `-on` VL `#021a10`, L `#102303`, M `#2b1d00`, H white). Solids reach 3:1 on cards, `-on` text 4.5:1. Tints and chips are unchanged. The destructive hover and pressed colours moved one step darker (`#991b1b`, `#7f1d1d`) so they differ from the new VH.
- Open: dashboard search field focus in forced colours (IO-221).

## Failures and near misses

No pair fails and none is waived.


Near misses (pass, within 0.3 of the limit):

- color-placeholder on color-white, input and select placeholder: 4.64:1 (needs 4.5:1)
- color-placeholder on color-surface, input and select placeholder: 4.52:1 (needs 4.5:1)
- color-success on color-canvas, field message, toast icon, step and status text: 4.55:1 (needs 4.5:1)
- color-warning on color-canvas, field message, toast icon, step and status text: 4.55:1 (needs 4.5:1)
- color-success on color-success-bg, success chip and alert: 4.54:1 (needs 4.5:1)
- color-warning on color-warning-bg, warning chip and alert: 4.60:1 (needs 4.5:1)
- color-warning on color-orange-50, orange KPI icon: 4.54:1 (needs 4.5:1)
- level-l on color-white, level l bar, donut segment, legend dot: 3.09:1 (needs 3:1)
- level-l on color-surface, level l bar, donut segment, legend dot: 3.01:1 (needs 3:1)
- level-m on color-white, level m bar, donut segment, legend dot: 3.19:1 (needs 3:1)
- level-m on color-surface, level m bar, donut segment, legend dot: 3.10:1 (needs 3:1)
- level-vl-text on level-vl-tint, level vl chip: 4.80:1 (needs 4.5:1)
- level-l-text on level-l-tint, level l chip: 4.52:1 (needs 4.5:1)
- level-h-text on level-h-tint, level h chip: 4.68:1 (needs 4.5:1)
- dim-ev on dim-ev-tint, dimension ev chip: 4.67:1 (needs 4.5:1)
- color-warning on color-warning-bg, TRANSFER idle: 4.60:1 (needs 4.5:1)
- color-field-border on color-canvas, input, select, checkbox, radio, chip border: 3.10:1 (needs 3:1)
- color-field-border on color-disabled-bg, segmented control edge: 3.02:1 (needs 3:1)

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

## Every pair

| Kind | Foreground | Background | Used for | Ratio | Result |
| --- | --- | --- | --- | --- | --- |
| Text 4.5:1 | `color-text` #0f1e33 | `color-white` #ffffff | body, label, table and helper text | 16.75 | pass |
| Text 4.5:1 | `color-text` #0f1e33 | `color-surface` #fbfcfe | body, label, table and helper text | 16.32 | pass |
| Text 4.5:1 | `color-text` #0f1e33 | `color-canvas` #f1f4f8 | body, label, table and helper text | 15.18 | pass |
| Text 4.5:1 | `color-text` #0f1e33 | `color-subtle` #f6f8fb | body, label, table and helper text | 15.74 | pass |
| Text 4.5:1 | `color-text` #0f1e33 | `color-blue-50` #eaf1fd | body, label, table and helper text | 14.75 | pass |
| Text 4.5:1 | `color-text` #0f1e33 | `color-disabled-bg` #eef1f5 | body, label, table and helper text | 14.78 | pass |
| Text 4.5:1 | `color-text-secondary` #475569 | `color-white` #ffffff | body, label, table and helper text | 7.58 | pass |
| Text 4.5:1 | `color-text-secondary` #475569 | `color-surface` #fbfcfe | body, label, table and helper text | 7.38 | pass |
| Text 4.5:1 | `color-text-secondary` #475569 | `color-canvas` #f1f4f8 | body, label, table and helper text | 6.87 | pass |
| Text 4.5:1 | `color-text-secondary` #475569 | `color-subtle` #f6f8fb | body, label, table and helper text | 7.12 | pass |
| Text 4.5:1 | `color-text-secondary` #475569 | `color-blue-50` #eaf1fd | body, label, table and helper text | 6.68 | pass |
| Text 4.5:1 | `color-text-secondary` #475569 | `color-disabled-bg` #eef1f5 | body, label, table and helper text | 6.69 | pass |
| Text 4.5:1 | `color-text-muted` #57677d | `color-white` #ffffff | body, label, table and helper text | 5.77 | pass |
| Text 4.5:1 | `color-text-muted` #57677d | `color-surface` #fbfcfe | body, label, table and helper text | 5.62 | pass |
| Text 4.5:1 | `color-text-muted` #57677d | `color-canvas` #f1f4f8 | body, label, table and helper text | 5.23 | pass |
| Text 4.5:1 | `color-text-muted` #57677d | `color-subtle` #f6f8fb | body, label, table and helper text | 5.42 | pass |
| Text 4.5:1 | `color-text-muted` #57677d | `color-blue-50` #eaf1fd | body, label, table and helper text | 5.08 | pass |
| Text 4.5:1 | `color-text-muted` #57677d | `color-disabled-bg` #eef1f5 | body, label, table and helper text | 5.09 | pass |
| Text 4.5:1 | `color-text` #0f1e33 | `color-border` #e3e8ef | secondary button pressed | 13.60 | pass |
| Text 4.5:1 | `color-blue-600` #1e5bc6 | `color-white` #ffffff | link and ghost button text | 6.24 | pass |
| Text 4.5:1 | `color-blue-600` #1e5bc6 | `color-surface` #fbfcfe | link and ghost button text | 6.08 | pass |
| Text 4.5:1 | `color-blue-600` #1e5bc6 | `color-canvas` #f1f4f8 | link and ghost button text | 5.65 | pass |
| Text 4.5:1 | `color-blue-600` #1e5bc6 | `color-blue-50` #eaf1fd | link and ghost button text | 5.49 | pass |
| Text 4.5:1 | `color-blue-700` #174a9f | `color-blue-50` #eaf1fd | selected tab, ghost hover, KPI tag, pager | 7.35 | pass |
| Text 4.5:1 | `color-blue-700` #174a9f | `color-blue-100` #dce8fc | selected tab, ghost hover, KPI tag, pager | 6.75 | pass |
| Text 4.5:1 | `color-blue-700` #174a9f | `color-white` #ffffff | selected tab text | 8.34 | pass |
| Text 4.5:1 | `color-white` #ffffff | `color-blue-600` #1e5bc6 | primary button, chosen chip, step number | 6.24 | pass |
| Text 4.5:1 | `color-white` #ffffff | `color-blue-700` #174a9f | primary button, chosen chip, step number | 8.34 | pass |
| Text 4.5:1 | `color-white` #ffffff | `color-blue-800` #133b77 | primary button, chosen chip, step number | 10.94 | pass |
| Text 4.5:1 | `color-white` #ffffff | `color-navy-900` #0f2a4a | tooltip | 14.48 | pass |
| Text 4.5:1 | `color-white` #ffffff | `color-success` #15803d | step "ดาวน์โหลดแล้ว" number | 5.02 | pass |
| Text 4.5:1 | `color-white` #ffffff | `level-vh` #b91c1c | destructive button | 6.47 | pass |
| Text 4.5:1 | `color-white` #ffffff | `color-danger-hover` #991b1b | destructive hover | 8.31 | pass |
| Text 4.5:1 | `color-white` #ffffff | `color-danger-pressed` #7f1d1d | destructive pressed | 10.02 | pass |
| Text 4.5:1 | `color-white` #ffffff | `color-error` #b91c1c | filled error mark | 6.47 | pass |
| Text 4.5:1 | `color-placeholder` #677689 | `color-white` #ffffff | input and select placeholder | 4.64 | pass (near) |
| Text 4.5:1 | `color-placeholder` #677689 | `color-surface` #fbfcfe | input and select placeholder | 4.52 | pass (near) |
| Text 4.5:1 | `color-error` #b91c1c | `color-white` #ffffff | field message, toast icon, step and status text | 6.47 | pass |
| Text 4.5:1 | `color-error` #b91c1c | `color-surface` #fbfcfe | field message, toast icon, step and status text | 6.30 | pass |
| Text 4.5:1 | `color-error` #b91c1c | `color-canvas` #f1f4f8 | field message, toast icon, step and status text | 5.86 | pass |
| Text 4.5:1 | `color-success` #15803d | `color-white` #ffffff | field message, toast icon, step and status text | 5.02 | pass |
| Text 4.5:1 | `color-success` #15803d | `color-surface` #fbfcfe | field message, toast icon, step and status text | 4.89 | pass |
| Text 4.5:1 | `color-success` #15803d | `color-canvas` #f1f4f8 | field message, toast icon, step and status text | 4.55 | pass (near) |
| Text 4.5:1 | `color-warning` #b45309 | `color-white` #ffffff | field message, toast icon, step and status text | 5.02 | pass |
| Text 4.5:1 | `color-warning` #b45309 | `color-surface` #fbfcfe | field message, toast icon, step and status text | 4.89 | pass |
| Text 4.5:1 | `color-warning` #b45309 | `color-canvas` #f1f4f8 | field message, toast icon, step and status text | 4.55 | pass (near) |
| Text 4.5:1 | `color-info` #1e5bc6 | `color-white` #ffffff | field message, toast icon, step and status text | 6.24 | pass |
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
| Text 4.5:1 | `level-vl-text` #0e7a4f | `color-white` #ffffff | level vl text on a card | 5.36 | pass |
| Text 4.5:1 | `level-vl-on` #021a10 | `level-vl` #059669 | label inside a level vl bar | 4.81 | pass |
| Text 4.5:1 | `level-l-text` #4d7c0f | `level-l-tint` #eef7e0 | level l chip | 4.52 | pass (near) |
| Text 4.5:1 | `level-l-text` #4d7c0f | `color-white` #ffffff | level l text on a card | 4.99 | pass |
| Text 4.5:1 | `level-l-on` #102303 | `level-l` #65a30d | label inside a level l bar | 5.38 | pass |
| Text 4.5:1 | `level-m-text` #8a6100 | `level-m-tint` #fdf6d8 | level m chip | 5.10 | pass |
| Text 4.5:1 | `level-m-text` #8a6100 | `color-white` #ffffff | level m text on a card | 5.54 | pass |
| Text 4.5:1 | `level-m-on` #2b1d00 | `level-m` #d97706 | label inside a level m bar | 5.16 | pass |
| Text 4.5:1 | `level-h-text` #c2410c | `level-h-tint` #fff1e6 | level h chip | 4.68 | pass (near) |
| Text 4.5:1 | `level-h-text` #c2410c | `color-white` #ffffff | level h text on a card | 5.18 | pass |
| Text 4.5:1 | `level-h-on` #ffffff | `level-h` #c2410c | label inside a level h bar | 5.18 | pass |
| Text 4.5:1 | `level-vh-text` #b42318 | `level-vh-tint` #fde7e5 | level vh chip | 5.55 | pass |
| Text 4.5:1 | `level-vh-text` #b42318 | `color-white` #ffffff | level vh text on a card | 6.57 | pass |
| Text 4.5:1 | `level-vh-on` #ffffff | `level-vh` #b91c1c | label inside a level vh bar | 6.47 | pass |
| Text 4.5:1 | `dim-ec` #4c2a92 | `color-white` #ffffff | dimension ec text | 10.23 | pass |
| Text 4.5:1 | `dim-ec` #4c2a92 | `color-surface` #fbfcfe | dimension ec text | 9.96 | pass |
| Text 4.5:1 | `dim-ec` #4c2a92 | `dim-ec-tint` #edeaf4 | dimension ec chip | 8.61 | pass |
| Text 4.5:1 | `color-text` #0f1e33 | `dim-ec-tint` #edeaf4 | dimension ec group header | 14.10 | pass |
| Non-text 3:1 | `dim-ec` #4c2a92 | `color-surface` #fbfcfe | dimension ec 4 px side bar | 9.96 | pass |
| Non-text 3:1 | `dim-ec` #4c2a92 | `dim-ec-tint` #edeaf4 | dimension ec bar on its tint | 8.61 | pass |
| Text 4.5:1 | `dim-so` #a8327a | `color-white` #ffffff | dimension so text | 6.17 | pass |
| Text 4.5:1 | `dim-so` #a8327a | `color-surface` #fbfcfe | dimension so text | 6.01 | pass |
| Text 4.5:1 | `dim-so` #a8327a | `dim-so-tint` #f6eaf2 | dimension so chip | 5.28 | pass |
| Text 4.5:1 | `color-text` #0f1e33 | `dim-so-tint` #f6eaf2 | dimension so group header | 14.33 | pass |
| Non-text 3:1 | `dim-so` #a8327a | `color-surface` #fbfcfe | dimension so 4 px side bar | 6.01 | pass |
| Non-text 3:1 | `dim-so` #a8327a | `dim-so-tint` #f6eaf2 | dimension so bar on its tint | 5.28 | pass |
| Text 4.5:1 | `dim-ev` #0e7490 | `color-white` #ffffff | dimension ev text | 5.36 | pass |
| Text 4.5:1 | `dim-ev` #0e7490 | `color-surface` #fbfcfe | dimension ev text | 5.22 | pass |
| Text 4.5:1 | `dim-ev` #0e7490 | `dim-ev-tint` #e7f1f4 | dimension ev chip | 4.67 | pass (near) |
| Text 4.5:1 | `color-text` #0f1e33 | `dim-ev-tint` #e7f1f4 | dimension ev group header | 14.58 | pass |
| Non-text 3:1 | `dim-ev` #0e7490 | `color-surface` #fbfcfe | dimension ev 4 px side bar | 5.22 | pass |
| Non-text 3:1 | `dim-ev` #0e7490 | `dim-ev-tint` #e7f1f4 | dimension ev bar on its tint | 4.67 | pass |
| Text 4.5:1 | `color-blue-700` #174a9f | `color-blue-50` #eaf1fd | REDUCE idle | 7.35 | pass |
| Text 4.5:1 | `dim-ec` #4c2a92 | `dim-ec-tint` #edeaf4 | AVOID idle (reuses the EC violet) | 8.61 | pass |
| Text 4.5:1 | `color-warning` #b45309 | `color-warning-bg` #fef4e2 | TRANSFER idle | 4.60 | pass (near) |
| Text 4.5:1 | `color-text-secondary` #475569 | `color-subtle` #f6f8fb | ACCEPT idle | 7.12 | pass |
| Text 4.5:1 | `color-white` #ffffff | `color-blue-700` #174a9f | strategy chosen | 8.34 | pass |
| Non-text 3:1 | `color-blue-700` #174a9f | `color-surface` #fbfcfe | strategy border | 8.13 | pass |
| Text 4.5:1 | `color-white` #ffffff | `dim-ec` #4c2a92 | strategy chosen | 10.23 | pass |
| Non-text 3:1 | `dim-ec` #4c2a92 | `color-surface` #fbfcfe | strategy border | 9.96 | pass |
| Text 4.5:1 | `color-white` #ffffff | `color-warning` #b45309 | strategy chosen | 5.02 | pass |
| Non-text 3:1 | `color-warning` #b45309 | `color-surface` #fbfcfe | strategy border | 4.89 | pass |
| Text 4.5:1 | `color-white` #ffffff | `color-text-secondary` #475569 | strategy chosen | 7.58 | pass |
| Non-text 3:1 | `color-text-secondary` #475569 | `color-surface` #fbfcfe | strategy border | 7.38 | pass |
| Large text 3:1 | `color-text` #0f1e33 | `color-surface` #fbfcfe | KPI number | 16.32 | pass |
| Large text 3:1 | `color-text` #0f1e33 | `color-white` #ffffff | KPI number, selected | 16.75 | pass |
| Large text 3:1 | `color-text` #0f1e33 | `color-white` #ffffff | donut centre value | 16.75 | pass |
| Non-text 3:1 | `color-field-border` #7f8c9e | `color-white` #ffffff | input, select, checkbox, radio, chip border | 3.42 | pass |
| Non-text 3:1 | `color-error` #b91c1c | `color-white` #ffffff | invalid input border | 6.47 | pass |
| Non-text 3:1 | `color-success` #15803d | `color-white` #ffffff | valid input border | 5.02 | pass |
| Non-text 3:1 | `color-blue-600` #1e5bc6 | `color-white` #ffffff | focus ring, tab indicator, checked box | 6.24 | pass |
| Non-text 3:1 | `color-text-muted` #57677d | `color-white` #ffffff | input hover border | 5.77 | pass |
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
| Non-text 3:1 | `color-white` #ffffff | `color-blue-600` #1e5bc6 | focus ring gap and checkmark | 6.24 | pass |
| Non-text 3:1 | `color-blue-600` #1e5bc6 | `color-blue-50` #eaf1fd | selected option, pager edge | 5.49 | pass |
| Non-text 3:1 | `color-blue-600` #1e5bc6 | `color-border` #e3e8ef | selected tab edge, current progress step | 5.07 | pass |
| Non-text 3:1 | `color-blue-400` #4a80d8 | `color-white` #ffffff | done progress step | 3.91 | pass |
| Non-text 3:1 | `color-blue-400` #4a80d8 | `color-white` #ffffff | KPI hover border, compare series | 3.91 | pass |
| Non-text 3:1 | `color-blue-600` #1e5bc6 | `color-white` #ffffff | slider range and thumb border | 6.24 | pass |
| Non-text 3:1 | `color-field-border` #7f8c9e | `color-white` #ffffff | slider track edge (1 px border on the blue-100 fill) | 3.42 | pass |
| Non-text 3:1 | `color-field-border` #7f8c9e | `color-surface` #fbfcfe | progress track (steps not yet done) | 3.33 | pass |
| Non-text 3:1 | `color-success` #15803d | `color-white` #ffffff | toast success edge and icon | 5.02 | pass |
| Non-text 3:1 | `color-error` #b91c1c | `color-white` #ffffff | toast error edge and icon | 6.47 | pass |
| Non-text 3:1 | `color-info` #1e5bc6 | `color-white` #ffffff | toast info edge and icon | 6.24 | pass |
| Non-text 3:1 | `color-warning` #b45309 | `color-white` #ffffff | toast warning edge and icon | 5.02 | pass |
| Non-text 3:1 | `level-vl` #059669 | `color-white` #ffffff | level vl bar, donut segment, legend dot | 3.77 | pass |
| Non-text 3:1 | `level-vl` #059669 | `color-surface` #fbfcfe | level vl bar, donut segment, legend dot | 3.67 | pass |
| Non-text 3:1 | `level-l` #65a30d | `color-white` #ffffff | level l bar, donut segment, legend dot | 3.09 | pass (near) |
| Non-text 3:1 | `level-l` #65a30d | `color-surface` #fbfcfe | level l bar, donut segment, legend dot | 3.01 | pass (near) |
| Non-text 3:1 | `level-m` #d97706 | `color-white` #ffffff | level m bar, donut segment, legend dot | 3.19 | pass (near) |
| Non-text 3:1 | `level-m` #d97706 | `color-surface` #fbfcfe | level m bar, donut segment, legend dot | 3.10 | pass (near) |
| Non-text 3:1 | `level-h` #c2410c | `color-white` #ffffff | level h bar, donut segment, legend dot | 5.18 | pass |
| Non-text 3:1 | `level-h` #c2410c | `color-surface` #fbfcfe | level h bar, donut segment, legend dot | 5.04 | pass |
| Non-text 3:1 | `level-vh` #b91c1c | `color-white` #ffffff | level vh bar, donut segment, legend dot | 6.47 | pass |
| Non-text 3:1 | `level-vh` #b91c1c | `color-surface` #fbfcfe | level vh bar, donut segment, legend dot | 6.30 | pass |

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
