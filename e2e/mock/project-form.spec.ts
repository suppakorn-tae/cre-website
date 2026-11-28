import { expect, test } from '../helpers/test';

// The project form on the mock api (MSW), see web/src/features/projects.
const PROJECT = '0193a5c2-7b1e-7c3a-9d4f-000000000001';

test.describe('project form', () => {
  test('progress slider and number box stay in sync, by keyboard', async ({ page }) => {
    await page.goto('/projects/new');
    const slider = page.getByRole('slider', { name: 'ความก้าวหน้าปัจจุบัน' });
    const box = page.getByRole('textbox', { name: /ความก้าวหน้าปัจจุบัน/ });
    await expect(slider).toHaveAttribute('aria-valuenow', '0');

    await box.fill('45');
    await expect(slider).toHaveAttribute('aria-valuenow', '45');
    await expect(slider).toHaveAttribute('aria-valuetext', '45 %');

    await slider.focus();
    await page.keyboard.press('ArrowRight');
    await expect(box).toHaveValue('46');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await expect(box).toHaveValue('44');
    await page.keyboard.press('PageUp');
    await expect(box).toHaveValue('54');
    await page.keyboard.press('PageDown');
    await expect(box).toHaveValue('44');
    await page.keyboard.press('End');
    await expect(box).toHaveValue('100');
    await expect(slider).toHaveAttribute('aria-valuetext', '100 %');
    await page.keyboard.press('Home');
    await expect(box).toHaveValue('0');
  });

  test('shows the planned marker and helper once both dates are valid', async ({ page }) => {
    await page.goto('/projects/new');
    await expect(page.getByText('กรอกวันเริ่มและวันสิ้นสุดเพื่อดูความก้าวหน้าตามแผน')).toBeVisible();
    await page.locator('#project-startDate').fill('01/01/2569');
    await page.locator('#project-endDate').fill('31/12/2569');
    await expect(page.getByText(/ตามแผน ณ วันนี้ \(.*\) ควรอยู่ที่ \d+ %/)).toBeVisible();
    await expect(page.getByText(/^ตามแผน \d+ %$/).first()).toBeVisible();
  });

  test('the thumb snaps to the planned tick when dragged near it, not by keyboard', async ({
    page,
    isMobile,
  }) => {
    // A mouse drag; the touch emulation of the mobile project sends no mouse events.
    test.skip(isMobile, 'drag is mouse driven');
    await page.goto('/projects/new');
    await page.locator('#project-startDate').fill('01/01/2569');
    await page.locator('#project-endDate').fill('31/12/2569');
    const slider = page.getByRole('slider', { name: 'ความก้าวหน้าปัจจุบัน' });
    const box = page.getByRole('textbox', { name: /ความก้าวหน้าปัจจุบัน/ });
    const planned = Number(
      (
        await page
          .getByText(/^ตามแผน \d+ %$/)
          .first()
          .innerText()
      ).match(/\d+/)?.[0],
    );
    await slider.scrollIntoViewIfNeeded();
    const track = (await page.locator('span.touch-none').boundingBox())!;
    // Drag onto a point 1 % away from the tick: it lands on the tick.
    const at = (pct: number) => track.x + 10 + ((track.width - 20) * pct) / 100;
    const y = track.y + track.height / 2;
    await page.mouse.move(at(0), y);
    await page.mouse.down();
    await page.mouse.move(at(planned - 1), y, { steps: 8 });
    await page.mouse.up();
    await expect(box).toHaveValue(String(planned));

    // The arrow keys still move by 1, even next to the tick.
    await slider.focus();
    await page.keyboard.press('ArrowRight');
    await expect(box).toHaveValue(String(planned + 1));
  });

  test('shows the counters and the error while typing', async ({ page }) => {
    await page.goto('/projects/new');
    await page.locator('#project-name').fill('ก'.repeat(120));
    await expect(page.getByText('120 / 120')).toBeVisible();
    await page.locator('#project-description').fill('ก'.repeat(1001));
    await expect(page.getByText('1,001 / 1,000')).toBeVisible();
    await expect(page.getByText('รายละเอียดยาวได้ไม่เกิน 1,000 ตัวอักษร')).toBeVisible();
    await page.locator('#project-progress').fill('12.3');
    await expect(page.getByText(/ต้องเป็นจำนวนเต็มระหว่าง 0–100 %/)).toBeVisible();
  });

  test('creating a project lands on the assessment of its version 1', async ({ page }) => {
    await page.goto('/projects/new');
    await page.locator('#project-name').fill('ทดสอบแบบฟอร์ม');
    await page.locator('#project-nickname').fill('TST');
    await page.getByRole('radio', { name: 'เกาะเต่า' }).check();
    await page.getByRole('radio', { name: 'ท่าเรือ' }).check();
    await page.locator('#project-value').fill('1000000');
    await page.locator('#project-startDate').fill('01/01/2569');
    await page.locator('#project-endDate').fill('31/12/2569');
    await page.getByRole('button', { name: /บันทึก และไปขั้นประเมินความเสี่ยง/ }).click();
    await page.waitForURL(/\/projects\/[^/]+\/versions\/[^/]+\/assess$/);
  });

  test('editing keeps the project page as the destination', async ({ page }) => {
    await page.goto(`/projects/${PROJECT}/edit`);
    await expect(page.getByRole('button', { name: 'บันทึกการแก้ไข' })).toBeVisible();
    await page.getByRole('button', { name: 'บันทึกการแก้ไข' }).click();
    await page.waitForURL(`**/projects/${PROJECT}`);
  });

  test('has no horizontal scroll', async ({ page }) => {
    for (const path of ['/projects/new', `/projects/${PROJECT}/edit`]) {
      await page.goto(path);
      await expect(page.getByRole('slider', { name: 'ความก้าวหน้าปัจจุบัน' })).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    }
  });
  test('stops typing at the limits and keeps the page inside the viewport', async ({ page }) => {
    const long = 'ก'.repeat(200);
    const numbers = '1'.repeat(200);
    for (const path of ['/projects/new', `/projects/${PROJECT}/edit`]) {
      await page.goto(path);
      await expect(page.getByRole('slider', { name: 'ความก้าวหน้าปัจจุบัน' })).toBeVisible();
      await page.getByRole('radio', { name: 'อื่น ๆ' }).first().check({ force: true });
      await page.getByRole('radio', { name: 'อื่น ๆ' }).last().check({ force: true });
      const fields = [
        { id: '#project-name', max: 120 },
        { id: '#project-islandOther', max: 60 },
        { id: '#project-typeOther', max: 60 },
      ];
      for (const { id, max } of fields) {
        const input = page.locator(id);
        await input.fill('');
        await input.focus();
        // Typing and an insert (what a paste does) both stop at the limit.
        await page.keyboard.insertText(long);
        expect((await input.inputValue()).length).toBe(max);
        await input.fill('');
        await page.keyboard.insertText(numbers.slice(0, max + 20));
        expect((await input.inputValue()).length).toBe(max);
        await expect(page.getByText(`${max} / ${max}`).first()).toBeVisible();
      }
      for (const width of [320, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow).toBeLessThanOrEqual(0);
      }
    }
  });

  test('the nickname chip in the preview stays on one line', async ({ page }) => {
    await page.goto('/projects/new');
    const chip = page.getByRole('complementary').getByText('ชื่อเล่น', { exact: true });
    await expect(chip).toBeVisible();
    for (const width of [320, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      const lines = await chip.evaluate((el) => {
        const lineHeight = parseFloat(getComputedStyle(el).lineHeight);
        return Math.round(el.getBoundingClientRect().height / lineHeight);
      });
      expect(lines).toBe(1);
    }
  });
});
