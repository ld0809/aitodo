import { expect, test } from '@playwright/test';

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:5173';

function injectAuthStorage() {
  return () => {
    const authData = {
      state: {
        user: {
          id: 'phase8-owner',
          email: 'phase8-owner@test.com',
          emailVerified: true,
          status: 'active',
          createdAt: '',
          updatedAt: '',
        },
        accessToken: 'phase8-token',
        isAuthenticated: true,
      },
      version: 0,
    };
    localStorage.setItem('auth-storage', JSON.stringify(authData));
    localStorage.setItem('accessToken', 'phase8-token');
  };
}

test('phase8: add shared card participants from organization members', async ({ page }) => {
  const now = new Date().toISOString();
  const organizations = [
    {
      id: 'org-1',
      name: '测试组织',
      ownerId: 'phase8-owner',
      memberCount: 2,
      createdAt: now,
      updatedAt: now,
    },
  ];
  const organizationMembers = [
    {
      id: 'phase8-owner',
      email: 'phase8-owner@test.com',
      nickname: '负责人',
    },
    {
      id: 'phase8-member',
      email: 'phase8-member@test.com',
      nickname: '成员甲',
    },
  ];
  const cardsData = [
    {
      id: 'shared-template',
      userId: 'phase8-owner',
      name: '共享模板卡片',
      cardType: 'shared',
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

  await page.route(/\/users\/me$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 0,
        message: 'ok',
        data: {
          id: 'phase8-owner',
          email: 'phase8-owner@test.com',
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

  await page.route(/\/api\/v1\/organizations\/org-1\/members$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 0,
        message: 'ok',
        data: organizationMembers,
      }),
    });
  });

  await page.route(/\/api\/v1\/organizations$/, async (route) => {
    if (route.request().method() === 'POST') {
      const payload = route.request().postDataJSON() as { name?: string };
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 0,
          message: 'ok',
          data: {
            id: 'org-created',
            name: payload.name ?? '新组织',
            ownerId: 'phase8-owner',
            memberCount: 1,
            createdAt: now,
            updatedAt: now,
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
        data: organizations,
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

  await page.route(/\/cards\/?(?:\?.*)?$/, async (route) => {
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

  await page.route(/\/cards\/shared-template$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 0,
        message: 'ok',
        data: {
          id: 'shared-template',
          userId: 'phase8-owner',
          name: '阶段八共享卡片',
          cardType: 'shared',
          sortBy: 'due_at',
          sortOrder: 'asc',
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
      }),
    });
  });

  await page.route(/\/cards\/shared-template\/todos$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 0, message: 'ok', data: [] }),
    });
  });

  await page.goto(BASE_URL);
  await page.waitForLoadState('domcontentloaded');
  await page.evaluate(injectAuthStorage());
  await page.goto(`${BASE_URL}/dashboard`);
  await page.waitForLoadState('networkidle');

  const sharedTemplateCard = page.locator('.grid-card-inner', { hasText: '共享模板卡片' }).first();
  await sharedTemplateCard.getByRole('button', { name: '✎' }).click();
  const participantSelects = page.locator('.participant-copy-row select');
  await participantSelects.nth(0).selectOption('org-1');
  await page.getByRole('button', { name: '从组织添加' }).click();
  await expect(page.getByText('从组织添加成员')).toBeVisible();
  await page.getByText('负责人').click();
  await page.getByText('成员甲').click();
  await page.getByRole('button', { name: '确认添加' }).click();
  await page.locator('input[placeholder="输入邮箱后回车或点击添加"]').fill('manual@test.com');
  await page.getByRole('button', { name: '添加', exact: true }).click();

  await expect(page.locator('.participant-chip')).toContainText([
    'phase8-owner@test.com',
    'phase8-member@test.com',
    'manual@test.com',
  ]);

  const updateCardRequest = page.waitForRequest((request) => request.url().includes('/cards/shared-template') && request.method() === 'PATCH');
  await page.getByRole('button', { name: '保存' }).click();
  const cardRequest = await updateCardRequest;
  const payload = cardRequest.postDataJSON() as { participantEmails?: string[]; cardType?: string };
  expect(payload.cardType).toBe('shared');
  expect(payload.participantEmails ?? []).toEqual(expect.arrayContaining([
    'phase8-owner@test.com',
    'phase8-member@test.com',
    'manual@test.com',
  ]));
});
