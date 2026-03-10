import { expect, test } from '@playwright/test';

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:5173';

function injectAuthStorage() {
  return () => {
    const authData = {
      state: {
        user: {
          id: 'layout-owner',
          email: 'layout-owner@test.com',
          emailVerified: true,
          status: 'active',
          createdAt: '',
          updatedAt: '',
        },
        accessToken: 'layout-token',
        isAuthenticated: true,
      },
      version: 0,
    };
    localStorage.setItem('auth-storage', JSON.stringify(authData));
    localStorage.setItem('accessToken', 'layout-token');
  };
}

test('dashboard layout should render more than 3 cards in first row on wide viewport', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });

  const now = new Date().toISOString();
  const cards = Array.from({ length: 10 }).map((_, index) => ({
    id: `layout-card-${index + 1}`,
    userId: 'layout-owner',
    name: `布局卡片-${index + 1}`,
    cardType: 'personal',
    sortBy: 'due_at',
    sortOrder: 'asc',
    x: (index % 3) * 4,
    y: Math.floor(index / 3) * 3,
    w: 4,
    h: 3,
    pluginType: 'local_todo',
    pluginConfigJson: null,
    tags: [],
    participants: [],
    createdAt: now,
    updatedAt: now,
  }));

  await page.route(/\/users\/me$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 0,
        message: 'ok',
        data: {
          id: 'layout-owner',
          email: 'layout-owner@test.com',
          emailVerified: true,
          status: 'active',
          target: '',
          createdAt: now,
          updatedAt: now,
        },
      }),
    });
  });

  await page.route(/\/cards\/?(?:\?.*)?$/, async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 0,
          message: 'ok',
          data: cards,
        }),
      });
      return;
    }

    await route.fallback();
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

  await page.addInitScript(injectAuthStorage());
  await page.goto(`${BASE_URL}/dashboard`);
  await page.waitForSelector('.grid-card-inner');

  const layoutStats = await page.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll('.grid-card-inner')) as HTMLElement[];
    const boxes = nodes
      .map((node) => node.getBoundingClientRect())
      .filter((box) => box.width > 0 && box.height > 0);
    const minTop = Math.min(...boxes.map((box) => box.top));
    const firstRow = boxes.filter((box) => Math.abs(box.top - minTop) < 2);

    return {
      firstRowCount: firstRow.length,
      totalCards: boxes.length,
    };
  });

  expect(layoutStats.firstRowCount).toBeGreaterThan(3);
});
