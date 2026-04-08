import { expect, test } from '@playwright/test';

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:5173';

function injectAuthStorage() {
  return () => {
    const authData = {
      state: {
        user: {
          id: 'phase5-user',
          email: 'phase5-user@test.com',
          emailVerified: true,
          status: 'active',
          createdAt: '',
          updatedAt: '',
        },
        accessToken: 'phase5-token',
        isAuthenticated: true,
      },
      version: 0,
    };
    localStorage.setItem('auth-storage', JSON.stringify(authData));
    localStorage.setItem('accessToken', 'phase5-token');
  };
}

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

test('tapd card should auto refresh every 5 minutes', async ({ page }) => {
  const now = new Date().toISOString();
  let tapdTodosRequestCount = 0;

  await page.clock.install({ time: new Date('2026-04-08T10:00:00.000Z') });

  await page.route(/\/users\/me$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 0,
        message: 'ok',
        data: {
          id: 'phase5-user',
          email: 'phase5-user@test.com',
          emailVerified: true,
          status: 'active',
          target: '',
          createdAt: now,
          updatedAt: now,
        },
      }),
    });
  });

  await page.route(/\/todos\/?(?:\?.*)?$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 0,
        message: 'ok',
        data: [],
      }),
    });
  });

  await page.route(/\/tags\/?(?:\?.*)?$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 0,
        message: 'ok',
        data: [],
      }),
    });
  });

  await page.route(/\/cards\/?(?:\?.*)?$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 0,
        message: 'ok',
        data: [
          {
            id: 'tapd-card-refresh',
            userId: 'phase5-user',
            name: 'TAPD 自动刷新卡片',
            cardType: 'personal',
            sortBy: 'created_at',
            sortOrder: 'desc',
            x: 0,
            y: 0,
            w: 4,
            h: 3,
            pluginType: 'tapd',
            tags: [],
            participants: [],
            createdAt: now,
            updatedAt: now,
          },
        ],
      }),
    });
  });

  await page.route(/\/cards\/tapd-card-refresh\/todos$/, async (route) => {
    tapdTodosRequestCount += 1;
    const content = tapdTodosRequestCount === 1 ? '旧 TAPD 数据' : '刷新后的 TAPD 数据';

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 0,
        message: 'ok',
        data: [
          {
            id: `tapd-todo-${tapdTodosRequestCount}`,
            content,
            status: 'todo',
            tags: [],
          },
        ],
      }),
    });
  });

  await page.addInitScript(injectAuthStorage());
  await page.goto(`${BASE_URL}/dashboard`);

  await expect(page.getByText('旧 TAPD 数据')).toBeVisible();
  expect(tapdTodosRequestCount).toBe(1);

  await page.clock.fastForward(300_000);

  await expect.poll(() => tapdTodosRequestCount).toBe(2);
  await expect(page.getByText('刷新后的 TAPD 数据')).toBeVisible();
});

test('tapd card item should show all handler names', async ({ page }) => {
  const now = new Date().toISOString();

  await page.route(/\/users\/me$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 0,
        message: 'ok',
        data: {
          id: 'phase5-user',
          email: 'phase5-user@test.com',
          emailVerified: true,
          status: 'active',
          target: '',
          createdAt: now,
          updatedAt: now,
        },
      }),
    });
  });

  await page.route(/\/todos\/?(?:\?.*)?$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 0,
        message: 'ok',
        data: [],
      }),
    });
  });

  await page.route(/\/tags\/?(?:\?.*)?$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 0,
        message: 'ok',
        data: [],
      }),
    });
  });

  await page.route(/\/cards\/?(?:\?.*)?$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 0,
        message: 'ok',
        data: [
          {
            id: 'tapd-card-owner-list',
            userId: 'phase5-user',
            name: 'TAPD 处理人卡片',
            cardType: 'personal',
            sortBy: 'created_at',
            sortOrder: 'desc',
            x: 0,
            y: 0,
            w: 4,
            h: 3,
            pluginType: 'tapd',
            tags: [],
            participants: [],
            createdAt: now,
            updatedAt: now,
          },
        ],
      }),
    });
  });

  await page.route(/\/cards\/tapd-card-owner-list\/todos$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 0,
        message: 'ok',
        data: [
          {
            id: 'tapd-owner-item-1',
            content: '[开发中] 修复登录失败流程',
            status: 'todo',
            tags: [],
            handlerNames: ['张三', '李四', '王五'],
          },
        ],
      }),
    });
  });

  await page.addInitScript(injectAuthStorage());
  await page.goto(`${BASE_URL}/dashboard`);

  await expect(page.getByText('[开发中] 修复登录失败流程')).toBeVisible();
  await expect(page.getByText('[张三 李四 王五]')).toBeVisible();
});
