import { expect, test } from '@playwright/test';

const BASE_URL = 'http://127.0.0.1:5174';

function mockAuthStorageScript() {
  return () => {
    const authData = {
      state: {
        user: {
          id: 'phase3-user',
          email: 'phase3@example.com',
          emailVerified: true,
          status: 'active',
          createdAt: '',
          updatedAt: '',
        },
        accessToken: 'phase3-token',
        isAuthenticated: true,
      },
      version: 0,
    };
    localStorage.setItem('auth-storage', JSON.stringify(authData));
    localStorage.setItem('accessToken', 'phase3-token');
  };
}

test('phase3: progress update + ai report entry', async ({ page }) => {
  let progressSavedPayload = '';
  let reportRequestPayload = '';

  await page.route(/\/users\/me$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 0,
        message: 'ok',
        data: {
          id: 'phase3-user',
          email: 'phase3@example.com',
          emailVerified: true,
          status: 'active',
          target: '本周完成第三阶段联调',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      }),
    });
  });

  await page.route(/\/todos$/, async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 0, message: 'ok', data: [] }) });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 0,
        message: 'ok',
        data: [
          {
            id: 'local-todo-1',
            userId: 'phase3-user',
            content: '本地待办：补充周报素材',
            status: 'todo',
            progressCount: 2,
            tags: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
      }),
    });
  });

  await page.route(/\/cards$/, async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 0, message: 'ok', data: {} }) });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 0,
        message: 'ok',
        data: [
          {
            id: 'local-card-1',
            userId: 'phase3-user',
            name: '本地卡片',
            sortBy: 'created_at',
            sortOrder: 'desc',
            x: 0,
            y: 0,
            w: 4,
            h: 3,
            pluginType: 'local_todo',
            tags: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          {
            id: 'tapd-card-1',
            userId: 'phase3-user',
            name: 'TAPD卡片',
            sortBy: 'created_at',
            sortOrder: 'desc',
            x: 4,
            y: 0,
            w: 4,
            h: 3,
            pluginType: 'tapd',
            tags: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
      }),
    });
  });

  await page.route(/\/cards\/tapd-card-1\/todos$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 0,
        message: 'ok',
        data: [
          {
            id: 'tapd-1',
            content: 'TAPD待办示例',
            status: 'todo',
            tags: [],
          },
        ],
      }),
    });
  });

  await page.route(/\/tags$/, async (route) => {
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

  await page.route(/\/todos\/local-todo-1\/progress$/, async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 0,
          message: 'ok',
          data: [
            {
              id: 'progress-1',
              todoId: 'local-todo-1',
              userId: 'phase3-user',
              content: '已完成需求梳理',
              createdAt: new Date().toISOString(),
            },
          ],
        }),
      });
      return;
    }

    progressSavedPayload = route.request().postData() || '';
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 0,
        message: 'ok',
        data: {
          id: 'progress-2',
          todoId: 'local-todo-1',
          userId: 'phase3-user',
          content: '已同步 AI 报告需求',
          createdAt: new Date().toISOString(),
          progressCount: 3,
        },
      }),
    });
  });

  await page.route(/\/reports\/ai$/, async (route) => {
    reportRequestPayload = route.request().postData() || '';
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 0,
        message: 'ok',
        data: {
          provider: 'openclaw',
          period: {
            startAt: new Date().toISOString(),
            endAt: new Date().toISOString(),
            defaultedToLastWeek: false,
          },
          todoCount: 1,
          progressCount: 2,
          report: '总结概览\n- 本周推进顺利',
        },
      }),
    });
  });

  await page.goto(BASE_URL);
  await page.waitForLoadState('domcontentloaded');
  await page.evaluate(mockAuthStorageScript());
  await page.goto(`${BASE_URL}/dashboard`);
  await page.waitForLoadState('networkidle');

  await expect(page.getByRole('button', { name: 'AI报告' })).toBeVisible();
  await expect(page.locator('button[title="更新进度"]')).toHaveCount(1);

  await page.locator('button[title="更新进度"]').click();
  await expect(page.locator('.modal-title', { hasText: '更新进度' })).toBeVisible();
  await page.locator('textarea').first().fill('已同步 AI 报告需求');
  await page.getByRole('button', { name: '保存进度' }).click();
  await expect(page.locator('.modal-title', { hasText: '更新进度' })).toHaveCount(0);
  expect(progressSavedPayload).toContain('已同步 AI 报告需求');

  await page.getByRole('button', { name: 'AI报告' }).click();
  await expect(page.getByText('默认时间段为上周（周一到周日）。')).toBeVisible();
  await page.getByRole('button', { name: '生成报告' }).click();
  await expect(page.locator('.report-result pre')).toContainText('总结概览');
  expect(reportRequestPayload).toContain('startAt');
  expect(reportRequestPayload).toContain('endAt');
});
