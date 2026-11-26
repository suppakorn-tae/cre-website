import { expect, test } from '@playwright/test';

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
});
