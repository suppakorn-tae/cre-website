import { expect, test, type Locator, type Page } from '@playwright/test';

// Colour contrast of the rendered pages (WCAG 2.2 1.4.3, 1.4.11, 1.4.1), on the mock api.
// axe skips text on gradients and images, hover / focus / disabled states and all non-text
// contrast, so this reads the computed colours itself. The token pairs are checked in
// web/src/lib/contrast.test.ts; this proves the pages really use them.
//
// States per page: default (all visible text and control edges), hover (every kind of
// interactive element, first of its kind), focus-visible (a Tab walk), selected, error and
// disabled (listed, exempt from 1.4.3). One run with forced colours.

const PROJECT = '0193a5c2-7b1e-7c3a-9d4f-000000000001';
const V3 = '0193a5c2-0000-7000-8000-000000000103';

const PAGES: { name: string; path: string; ready: string | RegExp }[] = [
  { name: 'dashboard', path: '/dashboard', ready: 'การกระจายระดับความเสี่ยง' },
  { name: 'projects', path: '/projects', ready: 'ท่าเรือเกาะเต่า ระยะที่ 2' },
  { name: 'project', path: `/projects/${PROJECT}`, ready: 'เวอร์ชันล่าสุด' },
  { name: 'project versions', path: `/projects/${PROJECT}?tab=versions`, ready: 'แนวโน้มข้ามเวอร์ชัน' },
  {
    name: 'project versions RM',
    path: `/projects/${PROJECT}?tab=versions&view=rm`,
    ready: 'RM รายตัวชี้วัด',
  },
  { name: 'new project', path: '/projects/new', ready: 'สร้างโครงการก่อสร้างใหม่' },
  { name: 'edit project', path: `/projects/${PROJECT}/edit`, ready: 'แก้ไขโครงการ' },
  {
    name: 'assessment',
    path: `/projects/${PROJECT}/versions/${V3}/assess`,
    ready: 'ตอบครบ 55 จาก 55 ตัวชี้วัด',
  },
  { name: 'results', path: `/projects/${PROJECT}/versions/${V3}/results`, ready: 'Heat Map' },
  { name: 'plan', path: `/projects/${PROJECT}/versions/${V3}/plan`, ready: /แผน|กลยุทธ์/ },
  { name: 'account', path: '/account', ready: 'วิธีเข้าสู่ระบบ' },
  { name: 'admin users', path: '/admin/users', ready: 'จัดการผู้ใช้' },
  { name: 'admin thresholds', path: '/admin/thresholds', ready: 'เกณฑ์ RL (a–e)' },
  { name: 'admin impact', path: '/admin/impact-thresholds', ready: 'เกณฑ์ผลกระทบ' },
  { name: 'admin advice', path: '/admin/advice', ready: 'คำแนะนำตัวชี้วัด' },
  { name: 'admin audit', path: '/admin/audit', ready: 'บันทึกการกระทำ' },
  { name: 'admin export', path: '/admin/export', ready: 'ส่งออกข้อมูลวิจัย' },
];

const INTERACTIVE =
  'a[href], button, input, select, textarea, [role="tab"], [role="radio"], [role="checkbox"], [role="switch"], [role="combobox"], [role="slider"], summary';

type Rgba = [number, number, number, number];

/** Runs in the page: collects text and control-edge contrast findings under `root`. */
async function measure(
  root: Locator,
): Promise<{ problems: string[]; checked: number; skipped: string[] }> {
  return root.evaluate((el: Element) => {
    const parse = (value: string): Rgba | null => {
      const m = /^rgba?\(([^)]+)\)$/.exec(value.trim());
      if (m) {
        const p = m[1]!
          .split(/[ ,/]+/)
          .filter(Boolean)
          .map(Number);
        return [p[0]!, p[1]!, p[2]!, p[3] ?? 1];
      }
      return null;
    };
    const over = (top: Rgba, below: Rgba): Rgba => {
      const a = top[3] + below[3] * (1 - top[3]);
      if (a === 0) return [0, 0, 0, 0];
      const mix = (i: number) => (top[i]! * top[3] + below[i]! * below[3] * (1 - top[3])) / a;
      return [mix(0), mix(1), mix(2), a];
    };
    const lum = (c: Rgba) => {
      const [r, g, b] = c.slice(0, 3).map((v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      }) as [number, number, number];
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const ratio = (a: Rgba, b: Rgba) => {
      const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
      return (hi + 0.05) / (lo + 0.05);
    };
    const hex = (c: Rgba) =>
      '#' +
      c
        .slice(0, 3)
        .map((v) => Math.round(v).toString(16).padStart(2, '0'))
        .join('');
    const name = (e: Element) =>
      `${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''} "${(e.textContent ?? '').trim().slice(0, 30)}"`;

    /** Background under an element; null when a gradient or image sits behind it. */
    const backdrop = (e: Element): Rgba | 'image' => {
      const layers: Rgba[] = [];
      for (let n: Element | null = e; n; n = n.parentElement) {
        const cs = getComputedStyle(n);
        if (cs.backgroundImage !== 'none') return 'image';
        const bg = parse(cs.backgroundColor);
        if (bg && bg[3] > 0) {
          layers.push(bg);
          if (bg[3] === 1) break;
        }
      }
      let acc: Rgba = [255, 255, 255, 1];
      for (const l of layers.reverse()) acc = over(l, acc);
      return acc;
    };
    const visible = (e: Element) => {
      const r = e.getBoundingClientRect();
      const cs = getComputedStyle(e);
      return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
    };
    const inactive = (e: Element) =>
      !!e.closest('[disabled], [aria-disabled="true"], fieldset:disabled');

    const problems: string[] = [];
    const skipped: string[] = [];
    let checked = 0;

    const nodes = [el, ...Array.from(el.querySelectorAll('*'))];
    for (const e of nodes) {
      if (!visible(e) || e.closest('[aria-hidden="true"]')) continue;
      const cs = getComputedStyle(e);

      // Text (1.4.3): elements that own a text node.
      const ownText = Array.from(e.childNodes).some(
        (n) => n.nodeType === 3 && (n.textContent ?? '').trim() !== '',
      );
      if (ownText && !inactive(e) && !['SCRIPT', 'STYLE'].includes(e.tagName)) {
        const bg = backdrop(e);
        if (bg === 'image') {
          skipped.push(`text on gradient or image: ${name(e)}`);
        } else {
          const fg = parse(cs.color);
          if (fg) {
            checked++;
            const solid = over(fg, bg);
            const size = parseFloat(cs.fontSize);
            const large = size >= 24 || (size >= 18.66 && Number(cs.fontWeight) >= 700);
            const need = large ? 3 : 4.5;
            const r = ratio(solid, bg);
            if (r < need - 0.005) {
              problems.push(
                `text ${name(e)} ${hex(solid)} on ${hex(bg)} = ${r.toFixed(2)} < ${need}`,
              );
            }
          }
        }
      }

      // Control edges (1.4.11): a bordered form control must show its edge at 3:1.
      if (
        e.matches(
          'input:not([type=checkbox]):not([type=radio]):not([type=hidden]), select, textarea, [role="combobox"]',
        ) &&
        !inactive(e)
      ) {
        const width = parseFloat(cs.borderTopWidth);
        const border = parse(cs.borderTopColor);
        const parent = e.parentElement ? backdrop(e.parentElement) : 'image';
        const own = backdrop(e);
        if (width > 0 && border && border[3] > 0 && parent !== 'image' && own !== 'image') {
          checked++;
          const edge = ratio(over(border, own), parent);
          const fill = ratio(own, parent);
          if (edge < 2.995 && fill < 2.995) {
            problems.push(
              `control edge ${name(e)} ${hex(border)} on ${hex(parent)} = ${edge.toFixed(2)} < 3`,
            );
          }
        }
      }
    }
    return { problems, checked, skipped };
  });
}

/** Opens a page and waits for its mock data. */
async function open(page: Page, path: string, ready: string | RegExp) {
  await page.goto(path);
  await expect(page.getByText(ready).and(page.locator(':visible')).first()).toBeVisible();
  // Charts and counters animate for 700 ms; read the end colours.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await settle(page);
}

/** Resolves once the DOM has been quiet for 12 frames and no animation is running. */
async function settle(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        let quiet = 0;
        let changed = false;
        const observer = new MutationObserver(() => (changed = true));
        observer.observe(document.documentElement, {
          subtree: true,
          childList: true,
          attributes: true,
          characterData: true,
        });
        const frame = () => {
          if (changed || document.getAnimations().length > 0) quiet = 0;
          else quiet += 1;
          changed = false;
          if (quiet >= 12) {
            observer.disconnect();
            resolve();
          } else requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      }),
  );
}

// Every page state runs in both themes (IO-261). The theme comes from the system setting, as
// for a visitor who never picked one; the dark palette is in docs/specs/ux-ui/feedback/2026-11-27.
const THEMES = ['light', 'dark'] as const;

for (const theme of THEMES) {
  test.describe(`${theme} theme`, () => {
    test.use({ colorScheme: theme });

    for (const { name, path, ready } of PAGES) {
      test.describe(name, () => {
        test('default state: text and control edges', async ({ page }) => {
          await open(page, path, ready);
          const { problems, checked } = await measure(page.locator('body'));
          expect(checked).toBeGreaterThan(0);
          expect(problems).toEqual([]);
        });

        test('hover state: one of each interactive kind', async ({ page }, info) => {
          test.skip(info.project.name === 'mobile', 'hover needs a pointer');
          await open(page, path, ready);
          const problems: string[] = [];
          // Pick the first enabled element of each kind in one atomic read, as indexes into the
          // live query; each is then re-resolved from the page, never held as a handle.
          const live = page.locator(INTERACTIVE).and(page.locator(':visible'));
          const picks = await live.evaluateAll((els) => {
            const seen = new Set<string>();
            const out: number[] = [];
            els.forEach((e, i) => {
              const key = `${e.tagName}.${e.className}|${e.getAttribute('role') ?? ''}`;
              if (seen.has(key) || seen.size >= 14) return;
              seen.add(key);
              if (!e.matches(':disabled') && e.getAttribute('aria-disabled') !== 'true')
                out.push(i);
            });
            return out;
          });
          for (const index of picks) {
            // Hovering can re-render the control; read again until the page has settled.
            await expect(async () => {
              const el = live.nth(index);
              await el.scrollIntoViewIfNeeded({ timeout: 2000 });
              await el.hover({ timeout: 2000 }).catch(() => undefined);
              await settle(page);
              const found = (await measure(live.nth(index))).problems;
              problems.push(...found.map((p) => `hover ${p}`));
            }).toPass({ timeout: 10_000 });
          }
          expect(problems).toEqual([]);
        });

        test('focus-visible: a ring that reaches 3:1 against its surroundings', async ({
          page,
        }, info) => {
          test.skip(info.project.name === 'mobile', 'keyboard focus is a desktop path');
          await open(page, path, ready);
          const problems: string[] = [];
          let focused = 0;
          for (let i = 0; i < 18; i++) {
            await page.keyboard.press('Tab');
            const finding = await page.evaluate(() => {
              const focused = document.activeElement;
              // The Next.js dev overlay is not part of the app.
              if (!focused || focused === document.body || focused.tagName.includes('-'))
                return null;
              // A visually hidden control (the strategy radios) shows its ring on its label.
              const box = focused.getBoundingClientRect();
              const hostLabel = box.width <= 2 && box.height <= 2 ? focused.closest('label') : null;
              const labelOutline = hostLabel && getComputedStyle(hostLabel).outlineStyle !== 'none';
              const e = labelOutline ? hostLabel : focused;
              const cs = getComputedStyle(e);
              const parse = (v: string) =>
                /rgba?\(([^)]+)\)/
                  .exec(v)?.[1]
                  ?.split(/[ ,/]+/)
                  .map(Number) ?? null;
              const lum = (c: number[]) => {
                const [r, g, b] = c.slice(0, 3).map((x) => {
                  const s = x / 255;
                  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
                }) as [number, number, number];
                return 0.2126 * r + 0.7152 * g + 0.0722 * b;
              };
              const ratio = (a: number[], b: number[]) => {
                const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
                return (hi + 0.05) / (lo + 0.05);
              };
              let bg = [255, 255, 255];
              for (let n: Element | null = e.parentElement; n; n = n.parentElement) {
                const c = parse(getComputedStyle(n).backgroundColor);
                if (c && (c[3] ?? 1) === 1) {
                  bg = c;
                  break;
                }
              }
              const label = e.outerHTML.slice(0, 140);
              // A transparent outline is only the forced-colours fallback: the ring is the shadow.
              const outlineColour = parse(cs.outlineColor);
              const outline =
                cs.outlineStyle !== 'none' &&
                parseFloat(cs.outlineWidth) > 0 &&
                (outlineColour?.[3] ?? 1) > 0
                  ? outlineColour
                  : null;
              // The token ring is two shadows: a white gap, then the coloured band.
              const rings = [
                ...cs.boxShadow.matchAll(/rgba?\([^)]+\)\s+0px 0px 0px (\d+(?:\.\d+)?)px/g),
              ];
              const band = rings.length ? parse(rings[rings.length - 1]![0]) : null;
              // A control inside a bordered wrapper may show the ring on the wrapper.
              const wrap = e.parentElement?.closest(':focus-within');
              const wrapRings =
                wrap && wrap !== document.body && wrap.tagName !== 'HTML'
                  ? [
                      ...getComputedStyle(wrap).boxShadow.matchAll(
                        /rgba?\([^)]+\)\s+0px 0px 0px (\d+(?:\.\d+)?)px/g,
                      ),
                    ]
                  : [];
              const wrapBand = wrapRings.length ? parse(wrapRings[wrapRings.length - 1]![0]) : null;
              const ring = outline ?? band ?? wrapBand;
              if (!ring) return { label, none: true as const };
              return {
                label,
                ratio: ratio(ring, bg),
                ring: ring.slice(0, 3).join(','),
                bg: bg.slice(0, 3).join(','),
              };
            });
            if (!finding) continue;
            focused++;
            if ('none' in finding) problems.push(`no focus ring on ${finding.label}`);
            else if (finding.ratio < 2.995)
              problems.push(
                `focus ring ${finding.label} = ${finding.ratio.toFixed(2)} < 3 (ring ${finding.ring} on ${finding.bg})`,
              );
          }
          expect(focused).toBeGreaterThan(0);
          expect(problems).toEqual([]);
        });

        test('forced colours: controls keep an edge, the focus ring stays', async ({
          page,
        }, info) => {
          test.skip(theme === 'dark', 'forced colours replace the palette, so one theme is enough');
          test.skip(info.project.name === 'mobile', 'one run is enough');
          await page.emulateMedia({ forcedColors: 'active' });
          await page.goto(path);
          await expect(page.getByText(ready).and(page.locator(':visible')).first()).toBeVisible();
          const bare = await page.evaluate(() => {
            const out: string[] = [];
            const controls = document.querySelectorAll(
              'input:not([type=hidden]):not([type=checkbox]):not([type=radio]), select, textarea, button:not([class*="ghost"])',
            );
            for (const e of controls) {
              const r = e.getBoundingClientRect();
              if (r.width === 0 || r.height === 0 || (e as HTMLButtonElement).disabled) continue;
              const cs = getComputedStyle(e);
              const edge = cs.borderTopStyle !== 'none' && parseFloat(cs.borderTopWidth) > 0;
              const text = !!(e.textContent ?? '').trim() || !!e.querySelector('svg, img');
              // An input in a bordered wrapper (search field, date field) shows the wrapper's edge.
              const wrapped = [e.parentElement, e.parentElement?.parentElement].some(
                (n) =>
                  n &&
                  getComputedStyle(n).borderTopStyle !== 'none' &&
                  parseFloat(getComputedStyle(n).borderTopWidth) > 0,
              );
              // A borderless text or icon button is drawn in ButtonText; an input without an edge is lost.
              if (!edge && !text && !wrapped) out.push(e.outerHTML.slice(0, 140));
            }
            return out;
          });
          expect(bare).toEqual([]);
          await page.keyboard.press('Tab');
          const ring = await page.evaluate(() => {
            const e = document.activeElement;
            if (!e || e === document.body) return 'none-focused';
            const cs = getComputedStyle(e);
            return cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0
              ? 'outline'
              : 'missing';
          });
          expect(['outline', 'none-focused']).toContain(ring);
        });
      });
    }

    test.describe('states that need an action', () => {
      test('error: invalid fields keep a 3:1 edge and an error message in text', async ({
        page,
      }) => {
        await open(page, '/projects/new', 'สร้างโครงการก่อสร้างใหม่');
        await page
          .getByRole('button', { name: /บันทึก|สร้าง/ })
          .last()
          .click();
        const invalid = page.locator(
          'input[aria-invalid="true"], select[aria-invalid="true"], textarea[aria-invalid="true"], [role="combobox"][aria-invalid="true"]',
        );
        await expect(invalid.first()).toBeVisible();
        const problems: string[] = [];
        for (const el of await invalid.all()) {
          const edge = await el.evaluate((e) => {
            const cs = getComputedStyle(e);
            return {
              width: parseFloat(cs.borderTopWidth),
              colour: cs.borderTopColor,
              html: e.outerHTML.slice(0, 160),
            };
          });
          expect(edge.width, edge.html).toBeGreaterThan(0);
          problems.push(...(await measure(el)).problems);
        }
        // The message under the field is text, so colour is not the only cue (1.4.1).
        const alerts = page.locator('[role="alert"], [id$="-error"]');
        expect(await alerts.count()).toBeGreaterThan(0);
        problems.push(...(await measure(page.locator('main'))).problems);
        expect(problems).toEqual([]);
      });

      test('error: the character counter turns red over the limit and keeps 4.5:1', async ({
        page,
      }) => {
        await open(page, '/projects/new', 'สร้างโครงการก่อสร้างใหม่');
        const name = page.locator('#project-description');
        await name.fill('ก'.repeat(1001));
        // 1,001 / 1,000: the counter is in the error colour and the field carries the message.
        const counter = page.getByText(/^1,001 \/ 1,000$/);
        await expect(counter).toBeVisible();
        await expect(name).toHaveAttribute('aria-invalid', 'true');
        const problems = [
          ...(await measure(counter)).problems,
          ...(await measure(name)).problems,
          ...(await measure(page.locator('main'))).problems,
        ];
        expect(problems).toEqual([]);
      });

      test('selected: tabs, view switch and chosen strategy keep their contrast', async ({
        page,
      }) => {
        await open(page, `/projects/${PROJECT}?tab=versions`, 'แนวโน้มข้ามเวอร์ชัน');
        const selected = page.locator(
          '[aria-selected="true"], [aria-checked="true"], [aria-current]',
        );
        expect(await selected.count()).toBeGreaterThan(0);
        const problems: string[] = [];
        for (const el of await selected.all()) {
          if (await el.isVisible()) problems.push(...(await measure(el)).problems);
        }
        expect(problems).toEqual([]);

        await open(page, `/projects/${PROJECT}/versions/${V3}/plan`, /แผน|กลยุทธ์/);
        const pressed = page.locator('[aria-checked="true"], [aria-pressed="true"]');
        for (const el of await pressed.all()) {
          if (await el.isVisible()) problems.push(...(await measure(el)).problems);
        }
        expect(problems).toEqual([]);
      });
    });
  });
}

// The search field draws its ring on the wrapper with a box-shadow, which forced colours
// removes, so the wrapper keeps a transparent outline (IO-221).
test('search field keeps a focus indicator in forced colours', async ({ page }, info) => {
  test.skip(info.project.name === 'mobile', 'keyboard focus is a desktop path');
  await page.emulateMedia({ forcedColors: 'active' });
  await page.goto('/dashboard');
  const search = page.getByPlaceholder('ค้นหาโครงการหรือเกาะ');
  await expect(search).toBeVisible();
  await search.focus();
  const outlined = await search.evaluate((e) => {
    const wrap = e.parentElement!;
    const has = (el: Element) =>
      getComputedStyle(el).outlineStyle !== 'none' &&
      parseFloat(getComputedStyle(el).outlineWidth) > 0;
    return has(e) || has(wrap);
  });
  expect(outlined).toBe(true);
});

test.describe('colour is never the only cue (1.4.1)', () => {
  test('risk levels, dimensions and chart series carry text', async ({ page }) => {
    await open(page, `/projects/${PROJECT}/versions/${V3}/results`, 'Heat Map');
    const body = await page.locator('main').innerText();
    for (const code of ['VH', 'H', 'M']) expect(body).toMatch(new RegExp(`\\b${code}\\b`));
    for (const dim of ['EC', 'SO', 'EV']) expect(body).toContain(dim);

    await open(page, '/dashboard', 'การกระจายระดับความเสี่ยง');
    // The donut has a legend: a code, a count and a share per level.
    const legend = page.locator('li[data-level]');
    expect(await legend.count()).toBe(5);
    for (const row of await legend.all()) {
      await expect(row).toContainText(/\b(VL|L|M|H|VH)\b/);
      await expect(row).toContainText(/\d/);
    }
  });

  test('strategies show their name', async ({ page }) => {
    await open(page, `/projects/${PROJECT}/versions/${V3}/plan`, /แผน|กลยุทธ์/);
    const body = await page.locator('main').innerText();
    for (const name of ['REDUCE', 'AVOID', 'TRANSFER', 'ACCEPT']) {
      expect(body.toUpperCase()).toContain(name);
    }
  });

  test('breadcrumb links are underlined at rest', async ({ page }) => {
    // The links sit in a line of muted text and differ from it by less than 3:1, so
    // colour alone would not mark them (axe link-in-text-block).
    const crumbs: [string, string | RegExp][] = [
      ['/projects/new', 'สร้างโครงการก่อสร้างใหม่'],
      [`/projects/${PROJECT}/edit`, 'แก้ไขโครงการ'],
      [`/admin/users/${PROJECT}`, 'ข้อมูลบัญชี'],
      [`/projects/${PROJECT}`, 'เวอร์ชันล่าสุด'],
      [`/projects/${PROJECT}?tab=versions`, 'แนวโน้มข้ามเวอร์ชัน'],
      [`/projects/${PROJECT}/versions/${V3}/results`, 'Heat Map'],
      [`/projects/${PROJECT}/versions/${V3}/plan`, /แผน|กลยุทธ์/],
    ];
    for (const [path, ready] of crumbs) {
      await open(page, path, ready);
      const links = page.locator('nav[aria-label="เส้นทางหน้า"] a, p[class*="breadcrumb"] a');
      expect(await links.count(), path).toBeGreaterThan(0);
      for (const link of await links.all()) {
        const line = await link.evaluate((e) => getComputedStyle(e).textDecorationLine);
        expect(line, `${path} ${await link.innerText()}`).toContain('underline');
      }
    }
  });
});
