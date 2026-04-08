import { expect, test } from '@playwright/test';

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:5173';

test('phase5 landing page should show feature highlights and auth entries', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      const text = message.text();
      if (!text.includes('favicon')) {
        consoleErrors.push(text);
      }
    }
  });

  await page.goto(BASE_URL);
  await expect(page.locator('.landing-page')).toBeVisible();
  await expect(page.getByText('简单快捷的任务中枢')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'TAPD 同步' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'AI 报告' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '多用户协作' })).toBeVisible();
  const loginLink = page.getByRole('link', { name: '登录', exact: true });
  const registerLink = page.getByRole('link', { name: '注册', exact: true });
  await expect(loginLink).toBeVisible();
  await expect(registerLink).toBeVisible();

  await loginLink.click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goBack();

  await registerLink.click();
  await expect(page).toHaveURL(/\/register$/);

  expect(consoleErrors).toEqual([]);
});

test('login failure should stay on page and show server error', async ({ page }) => {
  await page.route('**/api/v1/auth/login', async (route) => {
    await route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({
        message: '邮箱或密码错误',
      }),
    });
  });

  await page.goto(`${BASE_URL}/login`);
  await page.locator('input[type="email"]').fill('wrong@example.com');
  await page.locator('input[type="password"]').fill('wrong-password');
  await page.getByRole('button', { name: '登录' }).click();

  await expect(page).toHaveURL(/\/login$/);
  await expect(page.locator('.error-message')).toContainText('邮箱或密码错误');
  await expect(page.locator('input[type="email"]')).toHaveValue('wrong@example.com');
});
