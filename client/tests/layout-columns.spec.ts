import { expect, test, type Page } from '@playwright/test';

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

async function mockDashboardApis(
  page: Page,
  cards: Array<Record<string, unknown>>,
  now: string,
  onPatchLayout?: (cardId: string, payload: Record<string, unknown>) => void,
) {
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

  await page.route(/\/cards\/[^/]+\/layout$/, async (route) => {
    if (route.request().method() !== 'PATCH') {
      await route.fallback();
      return;
    }

    const payload = JSON.parse(route.request().postData() || '{}') as Record<string, unknown>;
    const matchedId = route.request().url().match(/\/cards\/([^/]+)\/layout$/)?.[1] || '';
    const cardIndex = cards.findIndex((card) => card.id === matchedId);
    if (cardIndex >= 0) {
      cards[cardIndex] = {
        ...cards[cardIndex],
        x: payload.x,
        y: payload.y,
        w: payload.w,
        h: payload.h,
        updatedAt: now,
      };
    }
    onPatchLayout?.(matchedId, payload);

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 0,
        message: 'ok',
        data: cardIndex >= 0 ? cards[cardIndex] : null,
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
    x: (index % 5) * 4,
    y: Math.floor(index / 5) * 3,
    w: 4,
    h: 3,
    pluginType: 'local_todo',
    pluginConfigJson: null,
    tags: [],
    participants: [],
    createdAt: now,
    updatedAt: now,
  }));

  await mockDashboardApis(page, cards, now);

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

test('card should support resize from bottom hot zone and persist layout height', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });

  const now = new Date().toISOString();
  const cards = [
    {
      id: 'layout-card-resize-1',
      userId: 'layout-owner',
      name: '可调整高度卡片',
      cardType: 'personal',
      sortBy: 'due_at',
      sortOrder: 'asc',
      x: 0,
      y: 0,
      w: 4,
      h: 3,
      pluginType: 'local_todo',
      pluginConfigJson: null,
      tags: [],
      participants: [],
      createdAt: now,
      updatedAt: now,
    },
  ];
  const originalH = cards[0].h;
  let patchLayoutPayload: Record<string, unknown> | null = null;

  await mockDashboardApis(page, cards, now, (_cardId, payload) => {
    patchLayoutPayload = payload;
  });

  await page.addInitScript(injectAuthStorage());
  await page.goto(`${BASE_URL}/dashboard`);
  const firstItem = page.locator('.react-grid-item').first();
  await firstItem.waitFor();

  const before = await firstItem.boundingBox();
  expect(before).not.toBeNull();
  if (!before) return;

  const dragX = before.x + before.width / 2;
  const dragY = before.y + before.height - 4;

  await page.mouse.move(dragX, dragY);
  await page.mouse.down();
  await page.mouse.move(dragX, dragY + 120, { steps: 8 });
  await page.mouse.up();

  await expect.poll(async () => {
    const after = await firstItem.boundingBox();
    return after?.height ?? 0;
  }).toBeGreaterThan(before.height + 40);

  await expect.poll(() => patchLayoutPayload).not.toBeNull();
  expect(Number((patchLayoutPayload as Record<string, unknown>).h)).toBeGreaterThan(originalH);
});

test('resizing a card should push down overlapped cards below it', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });

  const now = new Date().toISOString();
  const cards = [
    {
      id: 'layout-card-top',
      userId: 'layout-owner',
      name: '上方卡片',
      cardType: 'personal',
      sortBy: 'due_at',
      sortOrder: 'asc',
      x: 0,
      y: 0,
      w: 4,
      h: 3,
      pluginType: 'local_todo',
      pluginConfigJson: null,
      tags: [],
      participants: [],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'layout-card-bottom',
      userId: 'layout-owner',
      name: '下方卡片',
      cardType: 'personal',
      sortBy: 'due_at',
      sortOrder: 'asc',
      x: 0,
      y: 3,
      w: 4,
      h: 3,
      pluginType: 'local_todo',
      pluginConfigJson: null,
      tags: [],
      participants: [],
      createdAt: now,
      updatedAt: now,
    },
  ];

  const patchedCards = new Set<string>();
  await mockDashboardApis(page, cards, now, (cardId) => {
    if (cardId) patchedCards.add(cardId);
  });

  await page.addInitScript(injectAuthStorage());
  await page.goto(`${BASE_URL}/dashboard`);

  const topCard = page.locator('.react-grid-item').filter({ hasText: '上方卡片' }).first();
  const bottomCard = page.locator('.react-grid-item').filter({ hasText: '下方卡片' }).first();
  await topCard.waitFor();
  await bottomCard.waitFor();

  const topBefore = await topCard.boundingBox();
  const bottomBefore = await bottomCard.boundingBox();
  expect(topBefore).not.toBeNull();
  expect(bottomBefore).not.toBeNull();
  if (!topBefore || !bottomBefore) return;

  const dragX = topBefore.x + topBefore.width / 2;
  const dragY = topBefore.y + topBefore.height - 4;

  await page.mouse.move(dragX, dragY);
  await page.mouse.down();
  await page.mouse.move(dragX, dragY + 120, { steps: 10 });
  await page.mouse.up();

  await expect.poll(async () => {
    const currentTop = await topCard.boundingBox();
    const currentBottom = await bottomCard.boundingBox();
    if (!currentTop || !currentBottom) return -1;
    return currentBottom.y - (currentTop.y + currentTop.height);
  }).toBeGreaterThanOrEqual(-1);

  await expect.poll(() => patchedCards.has('layout-card-top')).toBeTruthy();
  await expect.poll(() => patchedCards.has('layout-card-bottom')).toBeTruthy();
});

test('shrinking a card should pull up related cards below it', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });

  const now = new Date().toISOString();
  const cards = [
    {
      id: 'layout-card-top-shrink',
      userId: 'layout-owner',
      name: '上方卡片-缩小',
      cardType: 'personal',
      sortBy: 'due_at',
      sortOrder: 'asc',
      x: 0,
      y: 0,
      w: 4,
      h: 5,
      pluginType: 'local_todo',
      pluginConfigJson: null,
      tags: [],
      participants: [],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'layout-card-bottom-shrink',
      userId: 'layout-owner',
      name: '下方卡片-跟随上移',
      cardType: 'personal',
      sortBy: 'due_at',
      sortOrder: 'asc',
      x: 0,
      y: 5,
      w: 4,
      h: 3,
      pluginType: 'local_todo',
      pluginConfigJson: null,
      tags: [],
      participants: [],
      createdAt: now,
      updatedAt: now,
    },
  ];

  const patchedPayloadByCard = new Map<string, Record<string, unknown>>();
  await mockDashboardApis(page, cards, now, (cardId, payload) => {
    if (cardId) {
      patchedPayloadByCard.set(cardId, payload);
    }
  });

  await page.addInitScript(injectAuthStorage());
  await page.goto(`${BASE_URL}/dashboard`);

  const topCard = page.locator('.react-grid-item').filter({ hasText: '上方卡片-缩小' }).first();
  const bottomCard = page.locator('.react-grid-item').filter({ hasText: '下方卡片-跟随上移' }).first();
  await topCard.waitFor();
  await bottomCard.waitFor();

  const topBefore = await topCard.boundingBox();
  const bottomBefore = await bottomCard.boundingBox();
  expect(topBefore).not.toBeNull();
  expect(bottomBefore).not.toBeNull();
  if (!topBefore || !bottomBefore) return;

  const dragX = topBefore.x + topBefore.width / 2;
  const dragY = topBefore.y + topBefore.height - 4;

  await page.mouse.move(dragX, dragY);
  await page.mouse.down();
  await page.mouse.move(dragX, dragY - 200, { steps: 10 });
  await page.mouse.up();

  await expect.poll(async () => {
    const currentTop = await topCard.boundingBox();
    return currentTop?.height ?? topBefore.height;
  }).toBeLessThan(topBefore.height - 40);

  await expect.poll(async () => {
    const currentBottom = await bottomCard.boundingBox();
    return currentBottom?.y ?? bottomBefore.y;
  }).toBeLessThan(bottomBefore.y - 40);

  await expect.poll(async () => {
    const currentTop = await topCard.boundingBox();
    const currentBottom = await bottomCard.boundingBox();
    if (!currentTop || !currentBottom) return -1;
    return currentBottom.y - (currentTop.y + currentTop.height);
  }).toBeGreaterThanOrEqual(-1);

  await expect.poll(() => patchedPayloadByCard.has('layout-card-top-shrink')).toBeTruthy();
  await expect.poll(() => patchedPayloadByCard.has('layout-card-bottom-shrink')).toBeTruthy();
  expect(Number(patchedPayloadByCard.get('layout-card-bottom-shrink')?.y)).toBeLessThan(5);
});
