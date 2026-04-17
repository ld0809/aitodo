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

test('phase9: list mode persists, quick create respects tag scope, and progress can be added from detail panel', async ({ page }) => {
  const now = new Date().toISOString();
  const tags = [
    {
      id: 'tag-ui',
      userId: 'phase9-owner',
      name: '前端',
      color: '#3b82f6',
      createdAt: now,
      updatedAt: now,
    },
  ];
  let todoSeed = 2;
  const progressEntriesByTodoId: Record<string, Array<{
    id: string;
    todoId: string;
    userId: string;
    content: string;
    createdAt: string;
  }>> = {
    'todo-1': [],
  };
  let todos = [
    {
      id: 'todo-1',
      userId: 'phase9-owner',
      cardId: null,
      content: '已有未分类待办',
      status: 'todo',
      progressCount: 0,
      tags: [],
      createdAt: now,
      updatedAt: now,
    },
  ];
  const capturedCreatePayloads: Array<Record<string, unknown>> = [];
  let capturedProgressPayload: { todoId: string; content: string } | null = null;

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

  await page.route(/\/cards\?viewport=.*$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 0, message: 'ok', data: [] }),
    });
  });

  await page.route(/\/tags\/?(?:\?.*)?$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 0, message: 'ok', data: tags }),
    });
  });

  await page.route(/\/todos\/?(?:\?.*)?$/, async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ code: 0, message: 'ok', data: todos }),
      });
      return;
    }

    if (route.request().method() === 'POST') {
      const payload = route.request().postDataJSON() as { content?: string; tagIds?: string[]; cardId?: string };
      capturedCreatePayloads.push(payload);
      const nextId = `todo-${todoSeed++}`;
      const matchedTags = Array.isArray(payload.tagIds)
        ? tags.filter((tag) => payload.tagIds?.includes(tag.id))
        : [];
      const createdTodo = {
        id: nextId,
        userId: 'phase9-owner',
        cardId: payload.cardId ?? null,
        content: payload.content ?? '',
        status: 'todo',
        progressCount: 0,
        tags: matchedTags,
        createdAt: now,
        updatedAt: now,
      };
      todos = [createdTodo, ...todos];
      progressEntriesByTodoId[nextId] = [];

      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ code: 0, message: 'ok', data: createdTodo }),
      });
    }
  });

  await page.route(/\/todos\/([^/]+)\/progress$/, async (route) => {
    const match = route.request().url().match(/\/todos\/([^/]+)\/progress/);
    const todoId = match?.[1] ?? '';

    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ code: 0, message: 'ok', data: progressEntriesByTodoId[todoId] ?? [] }),
      });
      return;
    }

    const payload = route.request().postDataJSON() as { content?: string };
    const entry = {
      id: `progress-${todoId}-1`,
      todoId,
      userId: 'phase9-owner',
      content: payload.content ?? '',
      createdAt: now,
    };
    capturedProgressPayload = { todoId, content: payload.content ?? '' };
    progressEntriesByTodoId[todoId] = [entry, ...(progressEntriesByTodoId[todoId] ?? [])];
    todos = todos.map((todo) =>
      todo.id === todoId
        ? {
            ...todo,
            progressCount: (todo.progressCount ?? 0) + 1,
            updatedAt: now,
          }
        : todo,
    );

    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 0,
        message: 'ok',
        data: {
          ...entry,
          progressCount: 1,
        },
      }),
    });
  });

  await page.route(/\/todos\/[^/]+$/, async (route) => {
    if (route.request().method() !== 'PATCH') {
      await route.fallback();
      return;
    }

    const match = route.request().url().match(/\/todos\/([^/]+)$/);
    const todoId = match?.[1] ?? '';
    const payload = route.request().postDataJSON() as Record<string, unknown>;
    todos = todos.map((todo) =>
      todo.id === todoId
        ? {
            ...todo,
            ...payload,
            tags: Array.isArray(payload.tagIds)
              ? tags.filter((tag) => (payload.tagIds as string[]).includes(tag.id))
              : todo.tags,
            updatedAt: now,
          }
        : todo,
    );

    const updatedTodo = todos.find((todo) => todo.id === todoId);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 0, message: 'ok', data: updatedTodo }),
    });
  });

  await page.addInitScript(injectAuthStorage());
  await page.goto(`${BASE_URL}/dashboard`);
  await page.waitForLoadState('networkidle');

  await page.locator('.avatar').click();
  await page.getByText('首页视图').click();
  await page.getByRole('button', { name: '列表模式' }).click();
  await expect(page.locator('.list-mode-quick-create__input')).toBeVisible();

  await page.reload();
  await page.waitForLoadState('networkidle');
  await expect(page.locator('.list-mode-quick-create__input')).toBeVisible();

  await page.locator('.list-mode-quick-create__input').fill('全部范围待办');
  await page.locator('.list-mode-quick-create__input').press('Enter');
  await expect(page.locator('.list-mode-todo-list .todo-text', { hasText: '全部范围待办' })).toBeVisible();
  expect(capturedCreatePayloads[0]?.tagIds).toBeUndefined();
  expect(capturedCreatePayloads[0]?.cardId).toBeUndefined();

  await page.locator('.list-mode-tag-item', { hasText: '前端' }).click();
  await page.locator('.list-mode-quick-create__input').fill('前端范围待办');
  await page.locator('.list-mode-quick-create__input').press('Enter');
  await expect(page.locator('.list-mode-todo-list .todo-text', { hasText: '前端范围待办' })).toBeVisible();
  expect(capturedCreatePayloads[1]?.tagIds).toEqual(['tag-ui']);
  expect(capturedCreatePayloads[1]?.cardId).toBeUndefined();

  await page.locator('.list-mode-todo-list .todo-item', { hasText: '前端范围待办' }).click();
  await page.getByRole('button', { name: '新增进度' }).click();
  await expect(page.getByRole('heading', { name: '更新进度' })).toBeVisible();
  await page.locator('.overlay.open textarea.goal-input').fill('已完成列表模式第九阶段联调');
  await page.getByRole('button', { name: '保存进度' }).click();
  await expect(page.getByText('已完成列表模式第九阶段联调')).toBeVisible();
  expect(capturedProgressPayload).toEqual({
    todoId: 'todo-3',
    content: '已完成列表模式第九阶段联调',
  });
});

test('phase9: tapd card should appear in list filters with settings entry and load iframe detail', async ({ page }) => {
  const now = new Date().toISOString();
  const tapdCard = {
    id: 'tapd-card-1',
    userId: 'phase9-owner',
    name: 'TAPD 国际化',
    cardType: 'personal',
    status: 'active',
    sortBy: 'created_at',
    sortOrder: 'desc',
    x: 0,
    y: 0,
    w: 4,
    h: 3,
    pluginType: 'tapd',
    pluginConfigJson: JSON.stringify({
      workspaceId: '100001',
      contentType: 'all',
    }),
    participants: [],
    tags: [],
    createdAt: now,
    updatedAt: now,
  };
  const tapdTodos = [
    {
      id: 'tapd-story-1',
      userId: 'phase9-owner',
      cardId: null,
      content: '[进行中] 国际化埋点补充',
      status: 'todo',
      progressCount: 0,
      tags: [],
      url: 'https://www.tapd.cn/tapd_fe/100001/story/detail/123',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'tapd-bug-1',
      userId: 'phase9-owner',
      cardId: null,
      content: '[待处理] 多语言回归缺陷',
      status: 'todo',
      progressCount: 0,
      tags: [],
      url: 'https://www.tapd.cn/tapd_fe/100001/bug/detail/456',
      createdAt: now,
      updatedAt: now,
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
      body: JSON.stringify({ code: 0, message: 'ok', data: [] }),
    });
  });

  await page.route(/\/tags\/?(?:\?.*)?$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 0, message: 'ok', data: [] }),
    });
  });

  await page.route(/\/cards\?viewport=.*$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 0, message: 'ok', data: [tapdCard] }),
    });
  });

  await page.route(/\/cards\/tapd-card-1\/todos$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 0, message: 'ok', data: tapdTodos }),
    });
  });

  await page.addInitScript(injectAuthStorage());
  await page.goto(`${BASE_URL}/dashboard`);
  await page.waitForLoadState('networkidle');

  await page.locator('.avatar').click();
  await page.getByText('首页视图').click();
  await page.getByRole('button', { name: '列表模式' }).click();

  const tapdFilter = page.locator('.list-mode-tag-item-wrap', { hasText: 'TAPD 国际化' });
  await expect(tapdFilter).toContainText('TAPD');
  await expect(tapdFilter.locator('.list-mode-tag-item__settings')).toBeVisible();
  await tapdFilter.locator('.list-mode-tag-item__settings').click();
  await expect(page.locator('.modal-title', { hasText: '编辑卡片' })).toBeVisible();
  await page.locator('.modal-close').click();

  await tapdFilter.locator('.list-mode-tag-item').click();
  await expect(page.locator('.list-mode-todo-list .todo-text', { hasText: '国际化埋点补充' })).toBeVisible();
  await expect(page.locator('.list-mode-todo-list .todo-text', { hasText: '多语言回归缺陷' })).toBeVisible();

  await page.locator('.list-mode-todo-list .todo-item', { hasText: '国际化埋点补充' }).click();
  const iframe = page.locator('.list-mode-tapd-iframe');
  await expect(iframe).toBeVisible();
  await expect(iframe).toHaveAttribute('src', 'https://www.tapd.cn/tapd_fe/100001/story/detail/123');
});
