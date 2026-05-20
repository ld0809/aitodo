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
            cardId: 'local-card-1',
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

  await page.route(/\/cards(?:\?.*)?$/, async (route) => {
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

  await page.addInitScript(mockAuthStorageScript());
  await page.goto(`${BASE_URL}/dashboard`);
  await page.waitForLoadState('networkidle');

  await page.locator('.header').hover();
  await expect(page.locator('.header-actions').getByRole('button', { name: 'AI报告' })).toBeVisible();
  await expect(page.locator('button[title="更新进度"]')).toHaveCount(1);

  await page.locator('button[title="更新进度"]').click();
  await expect(page.locator('.modal-title', { hasText: '更新进度' })).toBeVisible();
  await page.locator('textarea').first().fill('已同步 AI 报告需求');
  await page.getByRole('button', { name: '保存进度' }).click();
  await expect(page.locator('.modal-title', { hasText: '更新进度' })).toHaveCount(0);
  expect(progressSavedPayload).toContain('已同步 AI 报告需求');

  await page.locator('.header').hover();
  await page.locator('.header-actions').getByRole('button', { name: 'AI报告' }).click();
  await expect(page.getByText('默认时间段为上周（周一到周日）。')).toBeVisible();
  await page.getByRole('button', { name: '生成报告' }).click();
  await expect(page.locator('.report-result pre')).toContainText('总结概览');
  expect(reportRequestPayload).toContain('startAt');
  expect(reportRequestPayload).toContain('endAt');
});

test('phase3: todo ai chat can apply progress suggestion', async ({ page }) => {
  const now = new Date().toISOString();
  let sentAiMessagePayload = '';
  let appliedSuggestion = false;
  let resolveAiMessage: (() => void) | null = null;
  let progressEntries = [
    {
      id: 'progress-ai-1',
      todoId: 'local-todo-ai',
      userId: 'phase3-user',
      content: '已完成初始调研',
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
          id: 'phase3-user',
          email: 'phase3@example.com',
          emailVerified: true,
          status: 'active',
          target: '',
          createdAt: now,
          updatedAt: now,
        },
      }),
    });
  });

  await page.route(/\/todos$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 0,
        message: 'ok',
        data: [
          {
            id: 'local-todo-ai',
            userId: 'phase3-user',
            cardId: 'local-card-ai',
            content: '本地待办：接入单待办 AI 对话',
            status: 'todo',
            progressCount: appliedSuggestion ? 2 : 1,
            tags: [],
            createdAt: now,
            updatedAt: now,
          },
        ],
      }),
    });
  });

  await page.route(/\/cards(?:\?.*)?$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 0,
        message: 'ok',
        data: [
          {
            id: 'local-card-ai',
            userId: 'phase3-user',
            name: 'AI 卡片',
            cardType: 'personal',
            status: 'active',
            sortBy: 'created_at',
            sortOrder: 'desc',
            x: 0,
            y: 0,
            w: 4,
            h: 3,
            pluginType: 'local_todo',
            tags: [],
            createdAt: now,
            updatedAt: now,
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

  await page.route(/\/todos\/local-todo-ai\/progress$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 0, message: 'ok', data: progressEntries }),
    });
  });

  await page.route(/\/todos\/local-todo-ai\/ai\/session$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 0,
        message: 'ok',
        data: {
          session: {
            id: 'ai-session-1',
            todoId: 'local-todo-ai',
            sessionKey: 'aitodo:todo:local-todo-ai',
            status: 'active',
            lastMessageAt: now,
            createdAt: now,
            updatedAt: now,
          },
          messages: sentAiMessagePayload
            ? [
                {
                  id: 'ai-message-user-1',
                  sessionId: 'ai-session-1',
                  todoId: 'local-todo-ai',
                  userId: 'phase3-user',
                  role: 'user',
                  content: '帮我拆一下下一步',
                  openClawDispatchId: null,
                  createdAt: now,
                },
                {
                  id: 'ai-message-assistant-1',
                  sessionId: 'ai-session-1',
                  todoId: 'local-todo-ai',
                  userId: 'phase3-user',
                  role: 'assistant',
                  content: '建议先补接口再接前端。\n建议沉淀为进度：已明确单待办 AI 对话下一步，优先补接口和前端抽屉。',
                  openClawDispatchId: 'dispatch-ai-1',
                  createdAt: now,
                },
              ]
            : [],
          suggestions: sentAiMessagePayload && !appliedSuggestion
            ? [
                {
                  id: 'suggestion-ai-1',
                  sessionId: 'ai-session-1',
                  todoId: 'local-todo-ai',
                  messageId: 'ai-message-assistant-1',
                  createdByUserId: 'phase3-user',
                  type: 'progress',
                  status: 'pending',
                  content: '已明确单待办 AI 对话下一步，优先补接口和前端抽屉。',
                  appliedByUserId: null,
                  appliedProgressEntryId: null,
                  appliedAt: null,
                  createdAt: now,
                  updatedAt: now,
                },
              ]
            : [],
        },
      }),
    });
  });

  await page.route(/\/todos\/local-todo-ai\/ai\/messages$/, async (route) => {
    sentAiMessagePayload = route.request().postData() || '';
    await new Promise<void>((resolve) => {
      resolveAiMessage = resolve;
    });
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 0,
        message: 'ok',
        data: {
          session: {
            id: 'ai-session-1',
            todoId: 'local-todo-ai',
            sessionKey: 'aitodo:todo:local-todo-ai',
            status: 'active',
            lastMessageAt: now,
            createdAt: now,
            updatedAt: now,
          },
          userMessage: {
            id: 'ai-message-user-1',
            sessionId: 'ai-session-1',
            todoId: 'local-todo-ai',
            userId: 'phase3-user',
            role: 'user',
            content: '帮我拆一下下一步',
            openClawDispatchId: null,
            createdAt: now,
          },
          assistantMessage: {
            id: 'ai-message-assistant-1',
            sessionId: 'ai-session-1',
            todoId: 'local-todo-ai',
            userId: 'phase3-user',
            role: 'assistant',
            content: '建议先补接口再接前端。\n建议沉淀为进度：已明确单待办 AI 对话下一步，优先补接口和前端抽屉。',
            openClawDispatchId: 'dispatch-ai-1',
            createdAt: now,
          },
          suggestions: [
            {
              id: 'suggestion-ai-1',
              sessionId: 'ai-session-1',
              todoId: 'local-todo-ai',
              messageId: 'ai-message-assistant-1',
              createdByUserId: 'phase3-user',
              type: 'progress',
              status: 'pending',
              content: '已明确单待办 AI 对话下一步，优先补接口和前端抽屉。',
              appliedByUserId: null,
              appliedProgressEntryId: null,
              appliedAt: null,
              createdAt: now,
              updatedAt: now,
            },
          ],
        },
      }),
    });
  });

  await page.route(/\/todos\/local-todo-ai\/ai\/suggestions\/suggestion-ai-1\/apply$/, async (route) => {
    appliedSuggestion = true;
    progressEntries = [
      {
        id: 'progress-ai-2',
        todoId: 'local-todo-ai',
        userId: 'phase3-user',
        content: '已明确单待办 AI 对话下一步，优先补接口和前端抽屉。',
        createdAt: now,
      },
      ...progressEntries,
    ];
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 0,
        message: 'ok',
        data: {
          suggestion: {
            id: 'suggestion-ai-1',
            status: 'applied',
          },
          progress: {
            id: 'progress-ai-2',
            todoId: 'local-todo-ai',
            userId: 'phase3-user',
            content: '已明确单待办 AI 对话下一步，优先补接口和前端抽屉。',
            createdAt: now,
            progressCount: 2,
          },
        },
      }),
    });
  });

  await page.addInitScript(mockAuthStorageScript());
  await page.goto(`${BASE_URL}/dashboard`);
  await page.waitForLoadState('networkidle');

  await page.getByRole('button', { name: 'AI 对话' }).click();
  await expect(page.getByRole('dialog', { name: '待办 AI 对话' })).toBeVisible();
  await page.locator('.todo-ai-drawer__composer textarea').fill('帮我拆一下下一步');
  await page.getByRole('button', { name: '发送' }).click();
  await expect(page.locator('.todo-ai-drawer__composer textarea')).toHaveValue('');
  await expect(page.locator('.todo-ai-message--user .todo-ai-message__content')).toContainText('帮我拆一下下一步');
  resolveAiMessage?.();
  await expect(page.getByText('建议先补接口再接前端。')).toBeVisible();
  await expect(page.getByText('可沉淀进度')).toBeVisible();
  expect(sentAiMessagePayload).toContain('帮我拆一下下一步');

  await page.getByRole('button', { name: '沉淀' }).click();
  await expect(page.getByText('可沉淀进度')).toHaveCount(0);
  expect(appliedSuggestion).toBe(true);
});
