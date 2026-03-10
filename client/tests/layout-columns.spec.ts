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

test('dragging to blank area should only pull cards up in vacated source area', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });

  const now = new Date().toISOString();
  const cards = [
    {
      id: 'drag-source-card',
      userId: 'layout-owner',
      name: '拖拽源卡片',
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
      id: 'drag-follow-up-card',
      userId: 'layout-owner',
      name: '旧位置下方卡片',
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
    {
      id: 'drag-target-above-card',
      userId: 'layout-owner',
      name: '目标区域上方卡片',
      cardType: 'personal',
      sortBy: 'due_at',
      sortOrder: 'asc',
      x: 4,
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
      id: 'drag-target-below-card',
      userId: 'layout-owner',
      name: '目标区域下方卡片',
      cardType: 'personal',
      sortBy: 'due_at',
      sortOrder: 'asc',
      x: 4,
      y: 6,
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
    if (cardId) patchedPayloadByCard.set(cardId, payload);
  });

  await page.addInitScript(injectAuthStorage());
  await page.goto(`${BASE_URL}/dashboard`);

  const sourceCard = page.locator('.react-grid-item').filter({ hasText: '拖拽源卡片' }).first();
  const followCard = page.locator('.react-grid-item').filter({ hasText: '旧位置下方卡片' }).first();
  const targetAboveCard = page.locator('.react-grid-item').filter({ hasText: '目标区域上方卡片' }).first();
  const targetBelowCard = page.locator('.react-grid-item').filter({ hasText: '目标区域下方卡片' }).first();
  await sourceCard.waitFor();
  await followCard.waitFor();
  await targetAboveCard.waitFor();
  await targetBelowCard.waitFor();

  const sourceBefore = await sourceCard.boundingBox();
  const followBefore = await followCard.boundingBox();
  const targetAboveBefore = await targetAboveCard.boundingBox();
  const targetBelowBefore = await targetBelowCard.boundingBox();
  expect(sourceBefore).not.toBeNull();
  expect(followBefore).not.toBeNull();
  expect(targetAboveBefore).not.toBeNull();
  expect(targetBelowBefore).not.toBeNull();
  if (!sourceBefore || !followBefore || !targetAboveBefore || !targetBelowBefore) return;

  const startX = sourceBefore.x + sourceBefore.width / 2;
  const startY = sourceBefore.y + 24;
  const targetX = targetAboveBefore.x + targetAboveBefore.width / 2;
  const targetY = targetAboveBefore.y + targetAboveBefore.height + 30;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(targetX, targetY, { steps: 8 });

  const followDuringDrag = await followCard.boundingBox();
  expect(followDuringDrag).not.toBeNull();
  if (!followDuringDrag) return;
  expect(Math.abs(followDuringDrag.y - followBefore.y)).toBeLessThan(2);

  await page.mouse.up();

  await expect.poll(async () => {
    const currentFollow = await followCard.boundingBox();
    return currentFollow?.y ?? followBefore.y;
  }).toBeLessThan(followBefore.y - 40);

  await expect.poll(async () => {
    const currentTargetAbove = await targetAboveCard.boundingBox();
    if (!currentTargetAbove) return Number.MAX_SAFE_INTEGER;
    return Math.abs(currentTargetAbove.y - targetAboveBefore.y);
  }).toBeLessThan(2);

  await expect.poll(async () => {
    const currentTargetBelow = await targetBelowCard.boundingBox();
    if (!currentTargetBelow) return Number.MAX_SAFE_INTEGER;
    return Math.abs(currentTargetBelow.y - targetBelowBefore.y);
  }).toBeLessThan(2);

  await expect.poll(() => patchedPayloadByCard.has('drag-source-card')).toBeTruthy();
  await expect.poll(() => patchedPayloadByCard.has('drag-follow-up-card')).toBeTruthy();
  expect(patchedPayloadByCard.has('drag-target-above-card')).toBeFalsy();
  expect(patchedPayloadByCard.has('drag-target-below-card')).toBeFalsy();
  expect(Number(patchedPayloadByCard.get('drag-follow-up-card')?.y)).toBeLessThan(3);
});

test('dragging onto occupied position should push occupied card and cards below downward', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });

  const now = new Date().toISOString();
  const cards = [
    {
      id: 'drag-top-card',
      userId: 'layout-owner',
      name: '顶部卡片',
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
      id: 'drag-middle-card',
      userId: 'layout-owner',
      name: '被占用卡片',
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
    {
      id: 'drag-bottom-card',
      userId: 'layout-owner',
      name: '被占用下方卡片',
      cardType: 'personal',
      sortBy: 'due_at',
      sortOrder: 'asc',
      x: 0,
      y: 6,
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
    if (cardId) patchedPayloadByCard.set(cardId, payload);
  });

  await page.addInitScript(injectAuthStorage());
  await page.goto(`${BASE_URL}/dashboard`);

  const topCard = page.locator('.react-grid-item').filter({ hasText: '顶部卡片' }).first();
  await topCard.waitFor();

  const topBefore = await topCard.boundingBox();
  expect(topBefore).not.toBeNull();
  if (!topBefore) return;

  const startX = topBefore.x + topBefore.width / 2;
  const startY = topBefore.y + 24;
  const targetY = startY + 520;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX, targetY, { steps: 10 });
  await page.mouse.up();

  await expect.poll(() => patchedPayloadByCard.has('drag-top-card')).toBeTruthy();
  await expect.poll(() => patchedPayloadByCard.has('drag-middle-card')).toBeTruthy();
  await expect.poll(() => patchedPayloadByCard.has('drag-bottom-card')).toBeTruthy();

  expect(Number(patchedPayloadByCard.get('drag-top-card')?.y)).toBeGreaterThan(0);
  expect(Number(patchedPayloadByCard.get('drag-middle-card')?.y)).toBeGreaterThan(3);
  expect(Number(patchedPayloadByCard.get('drag-bottom-card')?.y)).toBeGreaterThan(6);
});
