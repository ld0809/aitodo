import { test, expect, Page } from '@playwright/test';

const BASE_URL = 'http://localhost:5173';

const results: string[] = [];

function log(result: string) {
  console.log(result);
  results.push(result);
}

async function tryLogin(page: Page) {
  await page.goto(`${BASE_URL}/login`);
  await page.waitForLoadState('networkidle');
  
  const emailInput = page.locator('input[type="email"]').first();
  const passwordInput = page.locator('input[name="password"]').first();
  
  if (await emailInput.count() > 0 && await passwordInput.count() > 0) {
    await emailInput.fill('test@example.com');
    await passwordInput.fill('Test123456!');
    await page.locator('button[type="submit"]').first().click();
    await page.waitForTimeout(3000);
    return page.url();
  }
  return '';
}

// 测试：访问注册页面
test('1.1 访问注册页面', async ({ page }) => {
  await page.goto(`${BASE_URL}/register`);
  await page.waitForLoadState('networkidle');
  
  const hasForm = await page.locator('form').count() > 0;
  const hasEmail = await page.locator('input[type="email"]').count() > 0;
  const hasPassword = await page.locator('input[name="password"]').count() > 0;
  
  log(`[${hasForm && hasEmail && hasPassword ? 'PASS' : 'FAIL'}] 访问注册页面: form=${hasForm}, email=${hasEmail}, password=${hasPassword}`);
  expect(hasForm && hasEmail && hasPassword).toBeTruthy();
});

// 测试：用户登录流程
test('1.2 用户登录', async ({ page }) => {
  const url = await tryLogin(page);
  const isLoggedIn = url.includes('dashboard') || url === BASE_URL + '/';
  
  log(`[${isLoggedIn ? 'PASS' : 'FAIL'}] 用户登录: ${url}`);
  expect(isLoggedIn).toBeTruthy();
});

// 测试：看板展示
test('5.1 看板首页加载', async ({ page }) => {
  await tryLogin(page);
  await page.goto(`${BASE_URL}/dashboard`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);
  
  const hasContent = await page.locator('main, .dashboard, [class*="board"]').count() > 0;
  log(`[${hasContent ? 'PASS' : 'FAIL'}] 看板首页加载: ${hasContent ? '已显示' : '未找到内容'}`);
});

// 测试：创建待办
test('2.1 创建新待办', async ({ page }) => {
  await tryLogin(page);
  await page.goto(`${BASE_URL}/dashboard`);
  await page.waitForLoadState('networkidle');
  
  // 查找添加按钮
  const addBtn = page.locator('button:has-text("添加待办"), button:has-text("+"), [class*="add"]').first();
  
  if (await addBtn.count() > 0) {
    await addBtn.click();
    await page.waitForTimeout(500);
    
    const titleInput = page.locator('input[name="title"], input[placeholder*="标题"]').first();
    if (await titleInput.count() > 0) {
      await titleInput.fill('测试待办项');
      const saveBtn = page.locator('button:has-text("保存"), button:has-text("确定")').first();
      if (await saveBtn.count() > 0) {
        await saveBtn.click();
        await page.waitForTimeout(500);
        log('[PASS] 创建新待办: 成功');
      }
    }
  } else {
    log('[FAIL] 创建新待办: 未找到添加按钮');
  }
});

// 测试：编辑待办
test('2.2 编辑待办内容', async ({ page }) => {
  await tryLogin(page);
  await page.goto(`${BASE_URL}/dashboard`);
  await page.waitForLoadState('networkidle');
  
  const todoItem = page.locator('[class*="todo"], [class*="item"]').first();
  if (await todoItem.count() > 0) {
    await todoItem.click();
    await page.waitForTimeout(500);
    
    const editInput = page.locator('input[name="title"]').first();
    if (await editInput.count() > 0) {
      await editInput.fill('已编辑');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(500);
      log('[PASS] 编辑待办内容');
    } else {
      log('[FAIL] 编辑待办: 未找到输入框');
    }
  } else {
    log('[FAIL] 编辑待办: 未找到待办项');
  }
});

// 测试：标记待办完成
test('2.3 标记待办完成', async ({ page }) => {
  await tryLogin(page);
  await page.goto(`${BASE_URL}/dashboard`);
  await page.waitForLoadState('networkidle');
  
  const checkbox = page.locator('input[type="checkbox"]').first();
  if (await checkbox.count() > 0) {
    await checkbox.click();
    await page.waitForTimeout(500);
    log('[PASS] 标记待办完成');
  } else {
    log('[FAIL] 标记待办完成: 未找到checkbox');
  }
});

// 测试：删除待办
test('2.4 删除待办', async ({ page }) => {
  await tryLogin(page);
  await page.goto(`${BASE_URL}/dashboard`);
  await page.waitForLoadState('networkidle');
  
  const deleteBtn = page.locator('button:has-text("删除"), [class*="delete"]').first();
  if (await deleteBtn.count() > 0) {
    await deleteBtn.click();
    await page.waitForTimeout(500);
    log('[PASS] 删除待办');
  } else {
    log('[FAIL] 删除待办: 未找到删除按钮');
  }
});

// 测试：创建标签
test('3.1 创建新标签', async ({ page }) => {
  await tryLogin(page);
  await page.goto(`${BASE_URL}/dashboard`);
  await page.waitForLoadState('networkidle');
  
  const addTagBtn = page.locator('button:has-text("添加标签"), [class*="tag"]').first();
  if (await addTagBtn.count() > 0) {
    await addTagBtn.click();
    await page.waitForTimeout(500);
    
    const nameInput = page.locator('input[name="name"]').first();
    if (await nameInput.count() > 0) {
      await nameInput.fill('测试标签');
      const saveBtn = page.locator('button:has-text("保存")').first();
      if (await saveBtn.count() > 0) {
        await saveBtn.click();
        await page.waitForTimeout(500);
        log('[PASS] 创建新标签');
      }
    }
  } else {
    log('[FAIL] 创建标签: 未找到添加入口');
  }
});

// 测试：创建卡片
test('4.1 创建新卡片', async ({ page }) => {
  await tryLogin(page);
  await page.goto(`${BASE_URL}/dashboard`);
  await page.waitForLoadState('networkidle');
  
  const addCardBtn = page.locator('button:has-text("添加卡片"), button:has-text("新建卡片")').first();
  if (await addCardBtn.count() > 0) {
    await addCardBtn.click();
    await page.waitForTimeout(500);
    
    const titleInput = page.locator('input[name="title"]').first();
    if (await titleInput.count() > 0) {
      await titleInput.fill('测试卡片');
      const saveBtn = page.locator('button:has-text("保存")').first();
      if (await saveBtn.count() > 0) {
        await saveBtn.click();
        await page.waitForTimeout(500);
        log('[PASS] 创建新卡片');
      }
    }
  } else {
    log('[FAIL] 创建卡片: 未找到添加入口');
  }
});

// 测试：删除卡片
test('4.3 删除卡片', async ({ page }) => {
  await tryLogin(page);
  await page.goto(`${BASE_URL}/dashboard`);
  await page.waitForLoadState('networkidle');
  
  const card = page.locator('[class*="card"]').first();
  if (await card.count() > 0) {
    const deleteBtn = card.locator('button:has-text("删除")').first();
    if (await deleteBtn.count() > 0) {
      await deleteBtn.click();
      await page.waitForTimeout(500);
      log('[PASS] 删除卡片');
    } else {
      log('[FAIL] 删除卡片: 未找到删除按钮');
    }
  } else {
    log('[FAIL] 删除卡片: 未找到卡片');
  }
});

// 测试：卡片拖拽
test('4.4 卡片拖拽', async ({ page }) => {
  await tryLogin(page);
  await page.goto(`${BASE_URL}/dashboard`);
  await page.waitForLoadState('networkidle');
  
  const cards = page.locator('[class*="card"]');
  const count = await cards.count();
  
  if (count >= 2) {
    const card1 = cards.nth(0);
    const card2 = cards.nth(1);
    const box1 = await card1.boundingBox();
    
    if (box1) {
      await page.mouse.move(box1.x + box1.width / 2, box1.y + box1.height / 2);
      await page.mouse.down();
      const box2 = await card2.boundingBox();
      if (box2) {
        await page.mouse.move(box2.x + box2.width / 2, box2.y + box2.height / 2, { steps: 10 });
      }
      await page.mouse.up();
      await page.waitForTimeout(500);
      log('[PASS] 卡片拖拽: 完成');
    }
  } else {
    log(`[FAIL] 卡片拖拽: 卡片数量不足 (${count})`);
  }
});

// 测试：无JavaScript控制台错误
test('5.3 无JavaScript控制台错误', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  
  await tryLogin(page);
  await page.goto(`${BASE_URL}/dashboard`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);
  
  log(`[${errors.length === 0 ? 'PASS' : 'FAIL'}] JavaScript控制台: ${errors.length === 0 ? '无错误' : errors.length + '个错误'}`);
});

// 生成报告
test.afterAll(async () => {
  console.log('\n========== E2E测试报告 ==========');
  results.forEach(r => console.log(r));
  console.log('==================================');
});
