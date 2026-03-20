import { expect, test } from '@playwright/test';

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:5174';

function mockAuthStorageScript() {
  return () => {
    const authData = {
      state: {
        user: {
          id: 'sort-user',
          email: 'sort-user@test.com',
          emailVerified: true,
          status: 'active',
          createdAt: '',
          updatedAt: '',
        },
        accessToken: 'sort-token',
        isAuthenticated: true,
      },
      version: 0,
    };

    localStorage.setItem('auth-storage', JSON.stringify(authData));
    localStorage.setItem('accessToken', 'sort-token');
  };
}

test('dashboard card todos keep due items first and sort undated items by createdAt desc after create', async ({ page }) => {
  const now = Date.now();
  const todosData = [
    {
      id: 'todo-due-later',
      userId: 'sort-user',
      cardId: 'card-1',
      content: '有截止时间-较晚',
      dueAt: new Date(now + 1000 * 60 * 60 * 24 * 2).toISOString(),
      status: 'todo',
      tags: [],
      createdAt: new Date(now - 1000 * 60 * 60 * 4).toISOString(),
      updatedAt: new Date(now - 1000 * 60 * 60 * 4).toISOString(),
    },
    {
      id: 'todo-due-soon',
      userId: 'sort-user',
      cardId: 'card-1',
      content: '有截止时间-较早',
      dueAt: new Date(now + 1000 * 60 * 60 * 12).toISOString(),
      status: 'todo',
      tags: [],
      createdAt: new Date(now - 1000 * 60 * 60 * 3).toISOString(),
      updatedAt: new Date(now - 1000 * 60 * 60 * 3).toISOString(),
    },
    {
      id: 'todo-no-due-old',
      userId: 'sort-user',
      cardId: 'card-1',
      content: '无截止时间-旧',
      status: 'todo',
      tags: [],
      createdAt: new Date(now - 1000 * 60 * 60 * 2).toISOString(),
      updatedAt: new Date(now - 1000 * 60 * 60 * 2).toISOString(),
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
          id: 'sort-user',
          email: 'sort-user@test.com',
          nickname: '排序测试',
          emailVerified: true,
          status: 'active',
          createdAt: new Date(now).toISOString(),
          updatedAt: new Date(now).toISOString(),
        },
      }),
    });
  });

  await page.route(/\/todos\/?(?:\?.*)?$/, async (route) => {
    if (route.request().method() === 'POST') {
      const requestBody = route.request().postDataJSON() as { content?: string; cardId?: string } | null;
      const createdTodo = {
        id: 'todo-no-due-new',
        userId: 'sort-user',
        cardId: requestBody?.cardId ?? 'card-1',
        content: requestBody?.content ?? '新建无截止时间待办',
        status: 'todo' as const,
        tags: [],
        createdAt: new Date(now + 1000 * 60).toISOString(),
        updatedAt: new Date(now + 1000 * 60).toISOString(),
      };
      todosData.push(createdTodo);
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 0,
          message: 'ok',
          data: createdTodo,
        }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 0,
        message: 'ok',
        data: todosData,
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
            id: 'card-1',
            userId: 'sort-user',
            name: '排序验证卡片',
            cardType: 'personal',
            sortBy: 'due_at',
            sortOrder: 'asc',
            x: 0,
            y: 0,
            w: 4,
            h: 3,
            pluginType: 'local_todo',
            participants: [],
            tags: [],
            createdAt: new Date(now).toISOString(),
            updatedAt: new Date(now).toISOString(),
          },
        ],
      }),
    });
  });

  await page.route(/\/tags$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 0, message: 'ok', data: [] }),
    });
  });

  await page.goto(BASE_URL);
  await page.waitForLoadState('domcontentloaded');
  await page.evaluate(mockAuthStorageScript());
  await page.goto(`${BASE_URL}/dashboard`);
  await page.waitForLoadState('networkidle');

  const card = page.locator('.grid-card-inner', { hasText: '排序验证卡片' }).first();
  await expect(card).toBeVisible();

  await expect(card.locator('.todo-text')).toHaveText([
    '有截止时间-较早',
    '有截止时间-较晚',
    '无截止时间-旧',
  ]);

  await card.locator('button[title="添加待办"]').click();
  await page.locator('textarea[placeholder="输入待办内容..."]').fill('无截止时间-新');
  await page.getByRole('button', { name: '创建' }).click();

  await expect(card.locator('.todo-text')).toHaveText([
    '有截止时间-较早',
    '有截止时间-较晚',
    '无截止时间-新',
    '无截止时间-旧',
  ]);
});
