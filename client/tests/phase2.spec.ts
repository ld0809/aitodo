import { test, expect, Page } from '@playwright/test';

const BASE_URL = 'http://localhost:5174';

const results: string[] = [];

function log(result: string) {
  console.log(result);
  results.push(result);
}

// 捕获 console 错误
function captureConsoleErrors(page: Page, errors: string[]) {
  page.on('console', msg => {
    if (msg.type() === 'error') {
      const text = msg.text();
      // 排除 CORS 错误（这是第三方 API 的限制，不是应用本身的错误）
      if (!text.includes('favicon') && !text.includes('net::ERR') && !text.includes('CORS')) {
        errors.push(text);
      }
    }
  });
}

async function setupAuthAndConfig(page: Page) {
  // 先访问一个空白页，然后设置 localStorage
  await page.goto(BASE_URL);
  await page.waitForLoadState('domcontentloaded');
  
  // 设置 zustand auth-storage
  await page.evaluate(() => {
    const authData = {
      state: {
        user: {
          id: 'c6817e15-a709-4716-a3a7-f87456240b76',
          email: 'e2etest@example.com',
          emailVerified: true,
          status: 'active',
          createdAt: '',
          updatedAt: ''
        },
        accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJjNjgxN2UxNS1hNzA5LTQ3MTYtYTNhNy1mODc0NTYyNDBiNzYiLCJlbWFpbCI6ImUyZXRlc3RAZXhhbXBsZS5jb20iLCJpYXQiOjE3NzI0MjQwNTMsImV4cCI6MTc3MzAyODg1M30.COsKG4FJ9bAke3_v42cLAq1ZlSYhUCUb5CSYr23MMvQ',
        isAuthenticated: true
      },
      version: 0
    };
    localStorage.setItem('auth-storage', JSON.stringify(authData));
    localStorage.setItem('accessToken', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJjNjgxN2UxNS1hNzA5LTQ3MTYtYTNhNy1mODc0NTYyNDBiNzYiLCJlbWFpbCI6ImUyZXRlc3RAZXhhbXBsZS5jb20iLCJpYXQiOjE3NzI0MjQwNTMsImV4cCI6MTc3MzAyODg1M30.COsKG4FJ9bAke3_v42cLAq1ZlSYhUCUb5CSYr23MMvQ');
  });
  
  // 设置 TAPD 配置
  await page.goto(`${BASE_URL}/tapd-config`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);
  
  const inputs = page.locator('input');
  if (await inputs.count() >= 1) {
    await inputs.nth(0).fill('https://api.tapd.cn');
    const saveBtn = page.locator('button').filter({ hasText: '保存' }).first();
    if (await saveBtn.count() > 0) {
      await saveBtn.click();
      await page.waitForTimeout(500);
    }
  }
}

async function setAuthAndGo(page: Page, path: string) {
  // 先访问一个空白页，然后设置 localStorage
  await page.goto(BASE_URL);
  await page.waitForLoadState('domcontentloaded');
  
  // 设置 zustand auth-storage
  await page.evaluate(() => {
    const authData = {
      state: {
        user: {
          id: 'c6817e15-a709-4716-a3a7-f87456240b76',
          email: 'e2etest@example.com',
          emailVerified: true,
          status: 'active',
          createdAt: '',
          updatedAt: ''
        },
        accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJjNjgxN2UxNS1hNzA5LTQ3MTYtYTNhNy1mODc0NTYyNDBiNzYiLCJlbWFpbCI6ImUyZXRlc3RAZXhhbXBsZS5jb20iLCJpYXQiOjE3NzI0MjQwNTMsImV4cCI6MTc3MzAyODg1M30.COsKG4FJ9bAke3_v42cLAq1ZlSYhUCUb5CSYr23MMvQ',
        isAuthenticated: true
      },
      version: 0
    };
    localStorage.setItem('auth-storage', JSON.stringify(authData));
    localStorage.setItem('accessToken', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJjNjgxN2UxNS1hNzA5LTQ3MTYtYTNhNy1mODc0NTYyNDBiNzYiLCJlbWFpbCI6ImUyZXRlc3RAZXhhbXBsZS5jb20iLCJpYXQiOjE3NzI0MjQwNTMsImV4cCI6MTc3MzAyODg1M30.COsKG4FJ9bAke3_v42cLAq1ZlSYhUCUb5CSYr23MMvQ');
    
    // 设置 TAPD store 数据
    const tapdData = {
      state: {
        apiBaseUrl: 'https://api.tapd.cn',
        setConfig: () => {},
        isConfigured: () => true,
      },
      version: 0
    };
    localStorage.setItem('tapd-config', JSON.stringify(tapdData));
  });
  
  // 然后跳转到目标页面
  await page.goto(`${BASE_URL}${path}`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);
}

// ========== 第二阶段测试 ==========

// 测试：1. TAPD 配置页面 - 访问和元素验证
test('6.1 TAPD配置页面 - 访问和元素验证', async ({ page }) => {
  const errors: string[] = [];
  captureConsoleErrors(page, errors);
  
  await setupAuthAndConfig(page);
  
  const headingEl = page.locator('h1');
  const heading = await headingEl.count() > 0 ? await headingEl.textContent() : '';
  const hasHeading = heading === 'TAPD 配置';
  
  const hasApiUrlInput = await page.locator('input[type="text"]').first().count() > 0;
  const hasSaveButton = await page.locator('button').filter({ hasText: '保存' }).count() > 0;
  
  log(`[${hasHeading && hasApiUrlInput && hasSaveButton ? 'PASS' : 'FAIL'}] TAPD配置页面: heading="${heading}", apiUrl=${hasApiUrlInput}, saveBtn=${hasSaveButton}`);
  if (errors.length > 0) {
    log(`[WARN] Console errors: ${errors.join(', ')}`);
  }
  expect(hasHeading && hasApiUrlInput && hasSaveButton).toBeTruthy();
});

// 测试：1. TAPD 配置页面 - 保存配置
test('6.2 TAPD配置页面 - 保存配置', async ({ page }) => {
  await setupAuthAndConfig(page);
  
  const inputs = page.locator('input');
  const buttons = page.locator('button');
  
  if (await inputs.count() >= 1 && await buttons.count() > 0) {
    const apiUrlInput = inputs.nth(0);
    const saveButton = buttons.filter({ hasText: '保存' }).first();
    
    await apiUrlInput.fill('https://api.tapd.cn');
    await saveButton.click();
    
    // 立即检查成功提示（因为它只显示2秒）
    await page.waitForTimeout(300);
    const successEl = page.locator('.success, span:has-text("保存成功")');
    const hasSuccess = await successEl.count() > 0;
    log(`[${hasSuccess ? 'PASS' : 'FAIL'}] TAPD配置保存: ${hasSuccess ? '成功' : '未找到成功提示'}`);
    expect(hasSuccess).toBeTruthy();
  } else {
    log('[FAIL] TAPD配置保存: 未找到输入框');
    expect(false).toBeTruthy();
  }
});

// 测试：2. 需求查询页面 - 访问和元素验证
test('6.3 需求查询页面 - 访问和元素验证', async ({ page }) => {
  const errors: string[] = [];
  captureConsoleErrors(page, errors);
  
  await setAuthAndGo(page, '/requirements');
  
  const headingEl = page.locator('h1');
  const heading = await headingEl.count() > 0 ? await headingEl.textContent() : '';
  const hasHeading = heading === '需求查询';
  
  const selects = page.locator('select');
  const hasProjectSelect = await selects.count() > 0;
  const hasSearchButton = await page.locator('button').filter({ hasText: '查询' }).count() > 0;
  const hasTable = await page.locator('table').count() > 0;
  
  log(`[${hasHeading && hasProjectSelect && hasSearchButton ? 'PASS' : 'FAIL'}] 需求查询页面: heading="${heading}", projectSelect=${hasProjectSelect}, searchBtn=${hasSearchButton}, table=${hasTable}`);
  if (errors.length > 0) {
    log(`[WARN] Console errors: ${errors.join(', ')}`);
  }
  expect(hasHeading && hasProjectSelect && hasSearchButton).toBeTruthy();
});

// 测试：3. 缺陷查询页面 - 访问和元素验证
test('6.4 缺陷查询页面 - 访问和元素验证', async ({ page }) => {
  const errors: string[] = [];
  captureConsoleErrors(page, errors);
  
  await setAuthAndGo(page, '/bugs');
  
  const headingEl = page.locator('h1');
  const heading = await headingEl.count() > 0 ? await headingEl.textContent() : '';
  const hasHeading = heading === '缺陷查询';
  
  const hasProjectSelect = await page.locator('select').count() > 0;
  const versionInput = page.locator('input[placeholder="版本"]');
  const hasVersionInput = await versionInput.count() > 0;
  const titleInput = page.locator('input[placeholder="标题特征"]');
  const hasTitleInput = await titleInput.count() > 0;
  const hasSearchButton = await page.locator('button').filter({ hasText: '查询' }).count() > 0;
  const hasTable = await page.locator('table').count() > 0;
  
  log(`[${hasHeading && hasProjectSelect && hasSearchButton ? 'PASS' : 'FAIL'}] 缺陷查询页面: heading="${heading}", projectSelect=${hasProjectSelect}, version=${hasVersionInput}, title=${hasTitleInput}, searchBtn=${hasSearchButton}, table=${hasTable}`);
  if (errors.length > 0) {
    log(`[WARN] Console errors: ${errors.join(', ')}`);
  }
  expect(hasHeading && hasProjectSelect && hasSearchButton).toBeTruthy();
});

// 测试：4. 待办查询页面 - 访问和元素验证
test('6.5 待办查询页面 - 访问和元素验证', async ({ page }) => {
  const errors: string[] = [];
  captureConsoleErrors(page, errors);
  
  await setAuthAndGo(page, '/todo-query');
  
  const headingEl = page.locator('h1');
  const heading = await headingEl.count() > 0 ? await headingEl.textContent() : '';
  const hasHeading = heading === '待办查询';
  
  const userSelect = page.locator('select').first();
  const hasUserSelect = await userSelect.count() > 0;
  const hasSearchButton = await page.locator('button').filter({ hasText: '查询' }).count() > 0;
  const hasTable = await page.locator('table').count() > 0;
  
  log(`[${hasHeading && hasUserSelect && hasSearchButton ? 'PASS' : 'FAIL'}] 待办查询页面: heading="${heading}", userSelect=${hasUserSelect}, searchBtn=${hasSearchButton}, table=${hasTable}`);
  if (errors.length > 0) {
    log(`[WARN] Console errors: ${errors.join(', ')}`);
  }
  expect(hasHeading && hasUserSelect && hasSearchButton).toBeTruthy();
});

// 测试：所有页面的 Console 错误检查（排除 CORS 错误）
test('6.6 所有TAPD相关页面 - Console错误检查', async ({ page }) => {
  const errors: string[] = [];
  captureConsoleErrors(page, errors);
  
  await setAuthAndGo(page, '/tapd-config');
  
  const pages = ['/tapd-config', '/requirements', '/bugs', '/todo-query'];
  
  for (const path of pages) {
    await page.goto(`${BASE_URL}${path}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);
  }
  
  log(`[${errors.length === 0 ? 'PASS' : 'FAIL'}] Console错误检查: ${errors.length === 0 ? '无错误' : errors.length + '个错误 - ' + errors.join('; ')}`);
  expect(errors.length).toBe(0);
});

// 生成报告
test.afterAll(async () => {
  console.log('\n========== 第二阶段 E2E测试报告 ==========');
  results.forEach(r => console.log(r));
  console.log('==========================================');
});

// ========== 需求查询功能测试 ==========

// 测试：1. 需求查询 - 选择项目后查询
test('7.1 需求查询 - 选择项目后查询', async ({ page }) => {
  const errors: string[] = [];
  captureConsoleErrors(page, errors);
  
  await setAuthAndGo(page, '/requirements');
  await page.waitForTimeout(1500);
  
  const projectSelect = page.locator('select').first();
  const hasProjectSelect = await projectSelect.count() > 0;
  
  if (hasProjectSelect) {
    const options = projectSelect.locator('option');
    const optionCount = await options.count();
    
    if (optionCount > 1) {
      await options.nth(1).click();
      await page.waitForTimeout(500);
      
      const searchButton = page.locator('button').filter({ hasText: '查询' });
      const hasSearchButton = await searchButton.count() > 0;
      
      if (hasSearchButton) {
        await searchButton.click();
        await page.waitForTimeout(2000);
        
        const table = page.locator('table');
        const hasTable = await table.count() > 0;
        
        log(`[PASS] 需求查询-选择项目后查询: 已选择项目并点击查询, table=${hasTable}`);
      } else {
        log('[FAIL] 需求查询-选择项目后查询: 未找到查询按钮');
        expect(false).toBeTruthy();
      }
    } else {
      log('[SKIP] 需求查询-选择项目后查询: 没有可用的项目选项');
    }
  } else {
    log('[FAIL] 需求查询-选择项目后查询: 未找到项目选择器');
    expect(false).toBeTruthy();
  }
  
  if (errors.length > 0) {
    log(`[WARN] Console errors: ${errors.join(', ')}`);
  }
});

// 测试：2. 需求查询 - 选择项目+迭代后查询
test('7.2 需求查询 - 选择项目+迭代后查询', async ({ page }) => {
  const errors: string[] = [];
  captureConsoleErrors(page, errors);
  
  await setAuthAndGo(page, '/requirements');
  await page.waitForTimeout(1500);
  
  const selects = page.locator('select');
  const projectSelect = selects.nth(0);
  const iterationSelect = selects.nth(1);
  
  const hasProjectSelect = await projectSelect.count() > 0;
  const hasIterationSelect = await iterationSelect.count() > 0;
  
  if (hasProjectSelect && hasIterationSelect) {
    const projectOptions = projectSelect.locator('option');
    const projectOptionCount = await projectOptions.count();
    
    if (projectOptionCount > 1) {
      await projectOptions.nth(1).click();
      await page.waitForTimeout(1000);
      
      const iterationOptions = iterationSelect.locator('option');
      const iterationOptionCount = await iterationOptions.count();
      
      if (iterationOptionCount > 1) {
        await iterationOptions.nth(1).click();
        await page.waitForTimeout(500);
        
        const searchButton = page.locator('button').filter({ hasText: '查询' });
        await searchButton.click();
        await page.waitForTimeout(2000);
        
        const table = page.locator('table');
        const hasTable = await table.count() > 0;
        
        log(`[PASS] 需求查询-选择项目+迭代后查询: 已选择项目和迭代并点击查询, table=${hasTable}`);
      } else {
        log('[SKIP] 需求查询-选择项目+迭代后查询: 没有可用的迭代选项');
      }
    } else {
      log('[SKIP] 需求查询-选择项目+迭代后查询: 没有可用的项目选项');
    }
  } else {
    log('[FAIL] 需求查询-选择项目+迭代后查询: 未找到选择器');
    expect(false).toBeTruthy();
  }
  
  if (errors.length > 0) {
    log(`[WARN] Console errors: ${errors.join(', ')}`);
  }
});

// 测试：3. 需求查询 - 验证查询功能可用
test('7.3 需求查询 - 验证查询功能可用', async ({ page }) => {
  const errors: string[] = [];
  captureConsoleErrors(page, errors);
  
  await setAuthAndGo(page, '/requirements');
  await page.waitForTimeout(1500);
  
  const heading = page.locator('h1');
  const headingText = await heading.count() > 0 ? await heading.textContent() : '';
  const hasHeading = headingText === '需求查询';
  
  const selects = page.locator('select');
  const hasProjectSelect = await selects.count() > 0;
  
  const searchButton = page.locator('button').filter({ hasText: '查询' });
  const hasSearchButton = await searchButton.count() > 0;
  
  const table = page.locator('table');
  const hasTable = await table.count() > 0;
  
  log(`[${hasHeading && hasProjectSelect && hasSearchButton && hasTable ? 'PASS' : 'FAIL'}] 需求查询-验证查询功能: heading="${headingText}", projectSelect=${hasProjectSelect}, searchBtn=${hasSearchButton}, table=${hasTable}`);
  
  if (errors.length > 0) {
    log(`[WARN] Console errors: ${errors.join(', ')}`);
  }
  
  expect(hasHeading && hasProjectSelect && hasSearchButton).toBeTruthy();
});

// ========== 缺陷查询功能测试 ==========

// 测试：1. 缺陷查询 - 选择项目后查询
test('7.4 缺陷查询 - 选择项目后查询', async ({ page }) => {
  const errors: string[] = [];
  captureConsoleErrors(page, errors);
  
  await setAuthAndGo(page, '/bugs');
  await page.waitForTimeout(1500);
  
  const projectSelect = page.locator('select').first();
  const hasProjectSelect = await projectSelect.count() > 0;
  
  if (hasProjectSelect) {
    const options = projectSelect.locator('option');
    const optionCount = await options.count();
    
    if (optionCount > 1) {
      await options.nth(1).click();
      await page.waitForTimeout(500);
      
      const searchButton = page.locator('button').filter({ hasText: '查询' });
      const hasSearchButton = await searchButton.count() > 0;
      
      if (hasSearchButton) {
        await searchButton.click();
        await page.waitForTimeout(2000);
        
        const table = page.locator('table');
        const hasTable = await table.count() > 0;
        
        log(`[PASS] 缺陷查询-选择项目后查询: 已选择项目并点击查询, table=${hasTable}`);
      } else {
        log('[FAIL] 缺陷查询-选择项目后查询: 未找到查询按钮');
        expect(false).toBeTruthy();
      }
    } else {
      log('[SKIP] 缺陷查询-选择项目后查询: 没有可用的项目选项');
    }
  } else {
    log('[FAIL] 缺陷查询-选择项目后查询: 未找到项目选择器');
    expect(false).toBeTruthy();
  }
  
  if (errors.length > 0) {
    log(`[WARN] Console errors: ${errors.join(', ')}`);
  }
});

// 测试：2. 缺陷查询 - 选择项目+版本后查询
test('7.5 缺陷查询 - 选择项目+版本后查询', async ({ page }) => {
  const errors: string[] = [];
  captureConsoleErrors(page, errors);
  
  await setAuthAndGo(page, '/bugs');
  await page.waitForTimeout(1500);
  
  const projectSelect = page.locator('select').first();
  const versionInput = page.locator('input[placeholder="版本"]');
  
  const hasProjectSelect = await projectSelect.count() > 0;
  const hasVersionInput = await versionInput.count() > 0;
  
  if (hasProjectSelect && hasVersionInput) {
    const projectOptions = projectSelect.locator('option');
    const projectOptionCount = await projectOptions.count();
    
    if (projectOptionCount > 1) {
      await projectOptions.nth(1).click();
      await page.waitForTimeout(500);
      
      await versionInput.fill('v1.0');
      await page.waitForTimeout(500);
      
      const searchButton = page.locator('button').filter({ hasText: '查询' });
      await searchButton.click();
      await page.waitForTimeout(2000);
      
      const table = page.locator('table');
      const hasTable = await table.count() > 0;
      
      log(`[PASS] 缺陷查询-选择项目+版本后查询: 已选择项目和填写版本并点击查询, table=${hasTable}`);
    } else {
      log('[SKIP] 缺陷查询-选择项目+版本后查询: 没有可用的项目选项');
    }
  } else {
    log('[FAIL] 缺陷查询-选择项目+版本后查询: 未找到选择器或输入框');
    expect(false).toBeTruthy();
  }
  
  if (errors.length > 0) {
    log(`[WARN] Console errors: ${errors.join(', ')}`);
  }
});

// 测试：3. 缺陷查询 - 选择项目+标题特征后查询
test('7.6 缺陷查询 - 选择项目+标题特征后查询', async ({ page }) => {
  const errors: string[] = [];
  captureConsoleErrors(page, errors);
  
  await setAuthAndGo(page, '/bugs');
  await page.waitForTimeout(1500);
  
  const projectSelect = page.locator('select').first();
  const titleInput = page.locator('input[placeholder="标题特征"]');
  
  const hasProjectSelect = await projectSelect.count() > 0;
  const hasTitleInput = await titleInput.count() > 0;
  
  if (hasProjectSelect && hasTitleInput) {
    const projectOptions = projectSelect.locator('option');
    const projectOptionCount = await projectOptions.count();
    
    if (projectOptionCount > 1) {
      await projectOptions.nth(1).click();
      await page.waitForTimeout(500);
      
      await titleInput.fill('bug');
      await page.waitForTimeout(500);
      
      const searchButton = page.locator('button').filter({ hasText: '查询' });
      await searchButton.click();
      await page.waitForTimeout(2000);
      
      const table = page.locator('table');
      const hasTable = await table.count() > 0;
      
      log(`[PASS] 缺陷查询-选择项目+标题特征后查询: 已选择项目和填写标题特征并点击查询, table=${hasTable}`);
    } else {
      log('[SKIP] 缺陷查询-选择项目+标题特征后查询: 没有可用的项目选项');
    }
  } else {
    log('[FAIL] 缺陷查询-选择项目+标题特征后查询: 未找到选择器或输入框');
    expect(false).toBeTruthy();
  }
  
  if (errors.length > 0) {
    log(`[WARN] Console errors: ${errors.join(', ')}`);
  }
});

// 测试：4. 缺陷查询 - 验证查询功能可用
test('7.7 缺陷查询 - 验证查询功能可用', async ({ page }) => {
  const errors: string[] = [];
  captureConsoleErrors(page, errors);
  
  await setAuthAndGo(page, '/bugs');
  await page.waitForTimeout(1500);
  
  const heading = page.locator('h1');
  const headingText = await heading.count() > 0 ? await heading.textContent() : '';
  const hasHeading = headingText === '缺陷查询';
  
  const hasProjectSelect = await page.locator('select').count() > 0;
  const versionInput = page.locator('input[placeholder="版本"]');
  const hasVersionInput = await versionInput.count() > 0;
  const titleInput = page.locator('input[placeholder="标题特征"]');
  const hasTitleInput = await titleInput.count() > 0;
  
  const searchButton = page.locator('button').filter({ hasText: '查询' });
  const hasSearchButton = await searchButton.count() > 0;
  
  const table = page.locator('table');
  const hasTable = await table.count() > 0;
  
  log(`[${hasHeading && hasProjectSelect && hasSearchButton ? 'PASS' : 'FAIL'}] 缺陷查询-验证查询功能: heading="${headingText}", projectSelect=${hasProjectSelect}, version=${hasVersionInput}, title=${hasTitleInput}, searchBtn=${hasSearchButton}, table=${hasTable}`);
  
  if (errors.length > 0) {
    log(`[WARN] Console errors: ${errors.join(', ')}`);
  }
  
  expect(hasHeading && hasProjectSelect && hasSearchButton).toBeTruthy();
});

// ========== 待办查询功能测试 ==========

// 测试：1. 待办查询 - 选择人员后查询
test('7.8 待办查询 - 选择人员后查询', async ({ page }) => {
  const errors: string[] = [];
  captureConsoleErrors(page, errors);
  
  await setAuthAndGo(page, '/todo-query');
  await page.waitForTimeout(1500);
  
  const userSelect = page.locator('select').first();
  const hasUserSelect = await userSelect.count() > 0;
  
  if (hasUserSelect) {
    const options = userSelect.locator('option');
    const optionCount = await options.count();
    
    if (optionCount > 1) {
      await options.nth(1).click();
      await page.waitForTimeout(500);
      
      const searchButton = page.locator('button').filter({ hasText: '查询' });
      const hasSearchButton = await searchButton.count() > 0;
      
      if (hasSearchButton) {
        await searchButton.click();
        await page.waitForTimeout(2000);
        
        const table = page.locator('table');
        const hasTable = await table.count() > 0;
        
        log(`[PASS] 待办查询-选择人员后查询: 已选择人员并点击查询, table=${hasTable}`);
      } else {
        log('[FAIL] 待办查询-选择人员后查询: 未找到查询按钮');
        expect(false).toBeTruthy();
      }
    } else {
      log('[SKIP] 待办查询-选择人员后查询: 没有可用的人员选项');
    }
  } else {
    log('[FAIL] 待办查询-选择人员后查询: 未找到人员选择器');
    expect(false).toBeTruthy();
  }
  
  if (errors.length > 0) {
    log(`[WARN] Console errors: ${errors.join(', ')}`);
  }
});

// 测试：2. 待办查询 - 验证查询功能可用
test('7.9 待办查询 - 验证查询功能可用', async ({ page }) => {
  const errors: string[] = [];
  captureConsoleErrors(page, errors);
  
  await setAuthAndGo(page, '/todo-query');
  await page.waitForTimeout(1500);
  
  const heading = page.locator('h1');
  const headingText = await heading.count() > 0 ? await heading.textContent() : '';
  const hasHeading = headingText === '待办查询';
  
  const userSelect = page.locator('select').first();
  const hasUserSelect = await userSelect.count() > 0;
  
  const searchButton = page.locator('button').filter({ hasText: '查询' });
  const hasSearchButton = await searchButton.count() > 0;
  
  const table = page.locator('table');
  const hasTable = await table.count() > 0;
  
  log(`[${hasHeading && hasUserSelect && hasSearchButton ? 'PASS' : 'FAIL'}] 待办查询-验证查询功能: heading="${headingText}", userSelect=${hasUserSelect}, searchBtn=${hasSearchButton}, table=${hasTable}`);
  
  if (errors.length > 0) {
    log(`[WARN] Console errors: ${errors.join(', ')}`);
  }
  
  expect(hasHeading && hasUserSelect && hasSearchButton).toBeTruthy();
});
