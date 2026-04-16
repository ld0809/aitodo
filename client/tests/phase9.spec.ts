import { expect, test } from '@playwright/test';

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:5173';

function injectAuthStorage() {
  return () => {
    const authData = {
      state: {
        user: {
          id: 'phase9-owner',
          email: 'phase9-owner@test.com',
          emailVerified: true,
          status: 'active',
          createdAt: '',
          updatedAt: '',
        },
        accessToken: 'phase9-token',
        isAuthenticated: true,
      },
      version: 0,
    };
    localStorage.setItem('auth-storage', JSON.stringify(authData));
    localStorage.setItem('accessToken', 'phase9-token');
  };
}

test('phase9: archive card from more menu and view archived cards from avatar menu', async ({ page }) => {
  const now = new Date().toISOString();
  let dashboardCards = [
    {
      id: 'active-card-1',
      userId: 'phase9-owner',
      name: '待归档卡片',
      cardType: 'personal',
      status: 'active',
      sortBy: 'created_at',
      sortOrder: 'desc',
      x: 0,
      y: 0,
      w: 4,
      h: 3,
      pluginType: 'local_todo',
      participants: [],
      tags: [],
      createdAt: now,
      updatedAt: now,
    },
  ];
  const archivedCards = [
    {
      id: 'archived-card-1',
      userId: 'phase9-owner',
      name: '已归档卡片',
      cardType: 'personal',
      status: 'archived',
      sortBy: 'created_at',
      sortOrder: 'desc',
      x: 0,
      y: 0,
      w: 4,
      h: 3,
      pluginType: 'local_todo',
      participants: [],
      tags: [],
      createdAt: now,
      updatedAt: now,
    },
  ];
  const archivedTodos = [
    {
      id: 'archived-todo-1',
      userId: 'phase9-owner',
      cardId: 'archived-card-1',
      content: '归档卡片里的待办',
      status: 'todo',
      progressCount: 2,
      tags: [],
      createdAt: now,
      updatedAt: now,
    },
  ];
  const progressEntries = [
    {
      id: 'progress-1',
      todoId: 'archived-todo-1',
      userId: 'phase9-owner',
      content: '已完成第一轮整理',
      createdAt: now,
    },
  ];

  await page.route(/\/users\/me$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 0,
        message: 'ok',
        data: {
          id: 'phase9-owner',
          email: 'phase9-owner@test.com',
          nickname: '负责人',
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
      body: JSON.stringify({ code: 0, message: 'ok', data: archivedTodos }),
    });
  });

  await page.route(/\/tags\/?(?:\?.*)?$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 0, message: 'ok', data: [] }),
    });
  });

  await page.route(/\/todos\/archived-todo-1\/progress$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 0, message: 'ok', data: progressEntries }),
    });
  });

  await page.route(/\/cards\?viewport=.*status=archived|\/cards\?status=archived.*viewport=/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 0,
        message: 'ok',
        data: archivedCards,
      }),
    });
  });

  await page.route(/\/cards\?viewport=.*$/, async (route) => {
    const url = route.request().url();
    if (url.includes('status=archived')) {
      await route.fallback();
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 0,
        message: 'ok',
        data: dashboardCards,
      }),
    });
  });

  await page.route(/\/cards\/active-card-1\/archive$/, async (route) => {
    dashboardCards = [];
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 0,
        message: 'ok',
        data: {
          id: 'active-card-1',
          status: 'archived',
        },
      }),
    });
  });

  await page.addInitScript(injectAuthStorage());
  await page.goto(`${BASE_URL}/dashboard`);
  await page.waitForLoadState('networkidle');

  const card = page.locator('.grid-card-inner', { hasText: '待归档卡片' }).first();
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: '更多' }).click();
  await expect(page.getByRole('menuitem', { name: '归档卡片' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: '删除卡片' })).toBeVisible();

  const archiveRequest = page.waitForRequest((request) => request.url().includes('/cards/active-card-1/archive') && request.method() === 'PATCH');
  await page.getByRole('menuitem', { name: '归档卡片' }).click();
  await archiveRequest;
  await expect(page.locator('.grid-card-inner', { hasText: '待归档卡片' })).toHaveCount(0);

  await page.locator('.avatar').click();
  await page.getByText('我的归档').click();
  await page.waitForLoadState('networkidle');

  await expect(page.getByRole('heading', { name: '我的归档卡片' })).toBeVisible();
  await expect(page.getByText('已归档卡片')).toBeVisible();
  await expect(page.getByText('归档卡片里的待办')).toBeVisible();
  await page.getByRole('button', { name: '查看进度' }).click();
  await expect(page.getByRole('heading', { name: '查看进度' })).toBeVisible();
  await expect(page.getByText('已完成第一轮整理')).toBeVisible();
});
