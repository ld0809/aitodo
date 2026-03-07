import { expect, test } from '@playwright/test';

const BASE_URL = 'http://127.0.0.1:5174';

function mockAuthStorageScript() {
  return () => {
    const authData = {
      state: {
        user: {
          id: 'phase4-owner',
          email: 'phase4-owner@test.com',
          emailVerified: true,
          status: 'active',
          createdAt: '',
          updatedAt: '',
        },
        accessToken: 'phase4-token',
        isAuthenticated: true,
      },
      version: 0,
    };
    localStorage.setItem('auth-storage', JSON.stringify(authData));
    localStorage.setItem('accessToken', 'phase4-token');
  };
}

test('phase4: shared card participants copy + @mention suggestion', async ({ page }) => {
  const sharedParticipants = [
    { id: 'member-1', email: 'member.one@test.com', nickname: '成员甲', mentionKey: 'memberone' },
    { id: 'member-2', email: 'member.two@test.com', nickname: '成员乙', mentionKey: 'membertwo' },
  ];

  const cardsData = [
    {
      id: 'shared-source',
      userId: 'phase4-owner',
      name: '共享模板卡片',
      cardType: 'shared',
      sortBy: 'created_at',
      sortOrder: 'desc',
      x: 0,
      y: 0,
      w: 4,
      h: 3,
      pluginType: 'local_todo',
      participants: sharedParticipants,
      tags: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'shared-main',
      userId: 'phase4-owner',
      name: '共享主卡片',
      cardType: 'shared',
      sortBy: 'created_at',
      sortOrder: 'desc',
      x: 4,
      y: 0,
      w: 4,
      h: 3,
      pluginType: 'local_todo',
      participants: sharedParticipants,
      tags: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
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
          id: 'phase4-owner',
          email: 'phase4-owner@test.com',
          emailVerified: true,
          status: 'active',
          target: '完成第四阶段',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      }),
    });
  });

  await page.route(/\/todos\/?(?:\?.*)?$/, async (route) => {
    if (route.request().method() === 'POST') {
      const requestBody = route.request().postDataJSON() as { content?: string } | null;
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 0,
          message: 'ok',
          data: {
            id: 'todo-created',
            userId: 'phase4-owner',
            cardId: 'shared-main',
            content: requestBody?.content ?? 'mock-content',
            status: 'todo',
            tags: [],
            assignees: sharedParticipants,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 0, message: 'ok', data: [] }),
    });
  });

  await page.route(/\/cards\/?(?:\?.*)?$/, async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 0,
          message: 'ok',
          data: {
            id: 'shared-created',
            userId: 'phase4-owner',
            name: '复制参与人卡片',
            cardType: 'shared',
            sortBy: 'due_at',
            sortOrder: 'asc',
            x: 0,
            y: 1,
            w: 4,
            h: 3,
            pluginType: 'local_todo',
            participants: sharedParticipants,
            tags: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
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
        data: cardsData,
      }),
    });
  });

  await page.route(/\/cards\/shared-(source|main)\/todos$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 0, message: 'ok', data: [] }),
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

  await page.getByRole('button', { name: '新建卡片' }).click();
  await page.locator('input[placeholder="输入卡片名称..."]').fill('复制参与人卡片');

  const cardTypeSelect = page.locator('label:has-text("卡片类型") + select');
  await cardTypeSelect.selectOption('shared');

  const copySelect = page.locator('label:has-text("从共享卡片复制参与人员") + .participant-copy-row select');
  await copySelect.selectOption('shared-source');
  await page.locator('label:has-text("从共享卡片复制参与人员") + .participant-copy-row button').click();

  const createCardRequest = page.waitForRequest((request) => request.url().includes('/cards') && request.method() === 'POST');
  await page.getByRole('button', { name: '创建' }).click();
  const cardRequest = await createCardRequest;
  const cardRequestPayload = cardRequest.postDataJSON() as { cardType?: string; participantEmails?: string[] };
  expect(cardRequestPayload.cardType).toBe('shared');
  expect(cardRequestPayload.participantEmails ?? []).toContain('member.one@test.com');
  expect(cardRequestPayload.participantEmails ?? []).toContain('member.two@test.com');

  const sharedMainCard = page.locator('.grid-card-inner', { hasText: '共享主卡片' }).first();
  await sharedMainCard.locator('button[title="添加待办"]').click();

  const todoInput = page.locator('textarea[placeholder="输入待办内容..."]');
  await todoInput.fill('请 @');
  await expect(page.locator('.mention-dropdown')).toBeVisible();
  await expect(page.locator('.mention-option').first()).toContainText('memberone');

  await todoInput.press('Enter');
  await expect(todoInput).toHaveValue(/@memberone /);

  const createTodoRequest = page.waitForRequest((request) => request.url().includes('/todos') && request.method() === 'POST');
  await page.getByRole('button', { name: '创建' }).last().click();
  const todoRequest = await createTodoRequest;
  const todoRequestPayload = todoRequest.postDataJSON() as { cardId?: string; content?: string };
  expect(todoRequestPayload.cardId).toBe('shared-main');
  expect(todoRequestPayload.content).toContain('@memberone');
});
