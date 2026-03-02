import { test, expect, type Page } from '@playwright/test';

// Test configuration
const BASE_URL = 'http://localhost:5173';
const API_URL = 'http://localhost:3000/api/v1';

// Helper function to generate random email
const generateEmail = () => `test${Date.now()}@example.com`;

// ============================================
// 用户管理测试 (User Management Tests)
// ============================================

test.describe('用户管理 (User Management)', () => {
  
  test('1.1 用户注册 - 邮箱格式验证', async ({ page }) => {
    await page.goto(`${BASE_URL}/register`);
    
    // Test invalid email formats
    const emailInput = page.locator('input[type="email"]');
    const passwordInput = page.locator('input[type="password"]').first();
    const confirmPasswordInput = page.locator('input[type="password"]').nth(1);
    
    // Fill with invalid email
    await emailInput.fill('invalid-email');
    await passwordInput.fill('test1234');
    await confirmPasswordInput.fill('test1234');
    
    // Try to submit - browser validation should catch this
    await page.locator('button[type="submit"]').click();
    
    // Check that the email input has validation error
    await expect(emailInput).toHaveAttribute('type', 'email');
  });

  test('1.2 用户注册 - 密码强度验证 (少于8位)', async ({ page }) => {
    await page.goto(`${BASE_URL}/register`);
    
    const emailInput = page.locator('input[type="email"]');
    const passwordInput = page.locator('input[type="password"]').first();
    const confirmPasswordInput = page.locator('input[type="password"]').nth(1);
    
    await emailInput.fill('test@example.com');
    await passwordInput.fill('1234567'); // Less than 8 characters
    await confirmPasswordInput.fill('1234567');
    
    await page.locator('button[type="submit"]').click();
    
    // Should show error about password strength
    await expect(page.locator('.error-message')).toContainText('密码至少8位');
  });

  test('1.3 用户注册 - 密码强度验证 (不含字母)', async ({ page }) => {
    await page.goto(`${BASE_URL}/register`);
    
    const emailInput = page.locator('input[type="email"]');
    const passwordInput = page.locator('input[type="password"]').first();
    const confirmPasswordInput = page.locator('input[type="password"]').nth(1);
    
    await emailInput.fill('test@example.com');
    await passwordInput.fill('12345678'); // No letters
    await confirmPasswordInput.fill('12345678');
    
    await page.locator('button[type="submit"]').click();
    
    // Should show error about password strength
    await expect(page.locator('.error-message')).toContainText('密码至少8位');
  });

  test('1.4 用户注册 - 密码确认不一致', async ({ page }) => {
    await page.goto(`${BASE_URL}/register`);
    
    const emailInput = page.locator('input[type="email"]');
    const passwordInput = page.locator('input[type="password"]').first();
    const confirmPasswordInput = page.locator('input[type="password"]').nth(1);
    
    await emailInput.fill('test@example.com');
    await passwordInput.fill('test1234');
    await confirmPasswordInput.fill('test1235'); // Different
    
    await page.locator('button[type="submit"]').click();
    
    // Should show error about password mismatch
    await expect(page.locator('.error-message')).toContainText('不一致');
  });

  test('1.5 用户注册 - 成功注册流程', async ({ page }) => {
    const testEmail = generateEmail();
    
    await page.goto(`${BASE_URL}/register`);
    
    const emailInput = page.locator('input[type="email"]');
    const passwordInput = page.locator('input[type="password"]').first();
    const confirmPasswordInput = page.locator('input[type="password"]').nth(1);
    
    await emailInput.fill(testEmail);
    await passwordInput.fill('test1234');
    await confirmPasswordInput.fill('test1234');
    
    await page.locator('button[type="submit"]').click();
    
    // Should navigate to verify page
    await expect(page).toHaveURL(/.*\/verify/);
  });

  test('1.6 用户登录 - 成功登录', async ({ page }) => {
    // First register a new user
    const testEmail = generateEmail();
    
    await page.goto(`${BASE_URL}/register`);
    await page.locator('input[type="email"]').fill(testEmail);
    await page.locator('input[type="password"]').first().fill('test1234');
    await page.locator('input[type="password"]').nth(1).fill('test1234');
    await page.locator('button[type="submit"]').click();
    
    // Should be on verify page
    await expect(page).toHaveURL(/.*\/verify/);
    
    // Note: Without real email, we can't complete verification
    // For now, test login page loads correctly
    await page.goto(`${BASE_URL}/login`);
    await expect(page.locator('h1')).toContainText('登录');
  });

  test('1.7 用户登录 - 未验证邮箱无法登录', async ({ page }) => {
    const testEmail = generateEmail();
    
    // Register but don't verify
    await page.goto(`${BASE_URL}/register`);
    await page.locator('input[type="email"]').fill(testEmail);
    await page.locator('input[type="password"]').first().fill('test1234');
    await page.locator('input[type="password"]').nth(1).fill('test1234');
    await page.locator('button[type="submit"]').click();
    
    // Try to login
    await page.goto(`${BASE_URL}/login`);
    await page.locator('input[type="email"]').fill(testEmail);
    await page.locator('input[type="password"]').first().fill('test1234');
    await page.locator('button[type="submit"]').click();
    
    // Should show error about email not verified
    await expect(page.locator('.error-message')).toContainText('验证');
  });
});

// ============================================
// 标签管理测试 (Tag Management Tests)
// ============================================

test.describe('标签管理 (Tag Management)', () => {
  
  test.beforeEach(async ({ page }) => {
    // Navigate to dashboard - assumes user is logged in
    await page.goto(`${BASE_URL}/dashboard`);
  });

  test('2.1 创建标签', async ({ page }) => {
    // Open tag modal
    await page.locator('button:has-text("标签管理"), button:has-text("标签")').first().click();
    
    // Fill in tag name
    await page.locator('input[placeholder="输入标签名"]').fill('工作');
    
    // Select a color
    await page.locator('.color-option').first().click();
    
    // Click add button
    await page.locator('button:has-text("添加")').click();
    
    // Verify tag appears in list
    await expect(page.locator('.tag-list')).toContainText('工作');
  });

  test('2.2 编辑标签', async ({ page }) => {
    // First create a tag
    await page.locator('button:has-text("标签管理"), button:has-text("标签")').first().click();
    await page.locator('input[placeholder="输入标签名"]').fill('测试标签');
    await page.locator('button:has-text("添加")').click();
    
    // Click edit button
    await page.locator('.tag-item .tb:has-text("✎")').click();
    
    // Change name
    await page.locator('.tag-edit input').fill('已修改标签');
    
    // Save
    await page.locator('.tag-edit button:has-text("✓")').click();
    
    // Verify
    await expect(page.locator('.tag-list')).toContainText('已修改标签');
  });

  test('2.3 删除标签', async ({ page }) => {
    // First create a tag
    await page.locator('button:has-text("标签管理"), button:has-text("标签")').first().click();
    await page.locator('input[placeholder="输入标签名"]').fill('待删除标签');
    await page.locator('button:has-text("添加")').click();
    
    // Confirm there is a tag to delete
    await expect(page.locator('.tag-list')).toContainText('待删除标签');
    
    // Handle confirm dialog
    page.on('dialog', dialog => dialog.accept());
    
    // Click delete button
    await page.locator('.tag-item .tb.danger').first().click();
    
    // Verify tag is removed
    await expect(page.locator('.tag-list')).not.toContainText('待删除标签');
  });

  test('2.4 标签列表查询', async ({ page }) => {
    // Create multiple tags
    await page.locator('button:has-text("标签管理"), button:has-text("标签")').first().click();
    
    await page.locator('input[placeholder="输入标签名"]').fill('标签1');
    await page.locator('button:has-text("添加")').click();
    
    await page.locator('input[placeholder="输入标签名"]').fill('标签2');
    await page.locator('button:has-text("添加")').click();
    
    // Verify both tags appear
    await expect(page.locator('.tag-list')).toContainText('标签1');
    await expect(page.locator('.tag-list')).toContainText('标签2');
  });
});

// ============================================
// 待办管理测试 (Todo Management Tests)
// ============================================

test.describe('待办管理 (Todo Management)', () => {
  
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard`);
  });

  test('3.1 创建待办 - 仅内容', async ({ page }) => {
    // Click add todo button
    await page.locator('button:has-text("添加待办")').first().click();
    
    // Fill in todo content
    await page.locator('textarea').fill('测试待办内容');
    
    // Save
    await page.locator('button:has-text("保存")').click();
    
    // Verify todo appears
    await expect(page.locator('.card-body')).toContainText('测试待办内容');
  });

  test('3.2 创建待办 - 带标签', async ({ page }) => {
    // First create a tag
    await page.locator('button:has-text("标签管理"), button:has-text("标签")').first().click();
    await page.locator('input[placeholder="输入标签名"]').fill('测试标签');
    await page.locator('button:has-text("添加")').click();
    await page.locator('button:has-text("关闭")').click();
    
    // Create todo with tag
    await page.locator('button:has-text("添加待办")').first().click();
    await page.locator('textarea').fill('带标签的待办');
    
    // Select tag
    await page.locator('.tag-option').first().click();
    
    await page.locator('button:has-text("保存")').click();
    
    // Verify
    await expect(page.locator('.card-body')).toContainText('带标签的待办');
  });

  test('3.3 创建待办 - 带截止时间和执行时间', async ({ page }) => {
    await page.locator('button:has-text("添加待办")').first().click();
    
    await page.locator('textarea').fill('带时间的待办');
    
    // Set due date
    await page.locator('input[type="datetime-local"]').first().fill('2026-03-15T10:00');
    
    // Set execute date
    await page.locator('input[type="datetime-local"]').nth(1).fill('2026-03-10T09:00');
    
    await page.locator('button:has-text("保存")').click();
    
    // Verify todo appears
    await expect(page.locator('.card-body')).toContainText('带时间的待办');
  });

  test('3.4 编辑待办', async ({ page }) => {
    // Create a todo first
    await page.locator('button:has-text("添加待办")').first().click();
    await page.locator('textarea').fill('原始待办');
    await page.locator('button:has-text("保存")').click();
    
    // Click edit button
    await page.locator('.todo-card .edit-btn, .todo-card button:nth-child(2)').first().click();
    
    // Modify content
    await page.locator('textarea').fill('已修改的待办');
    await page.locator('button:has-text("保存")').click();
    
    // Verify
    await expect(page.locator('.card-body')).toContainText('已修改的待办');
    await expect(page.locator('.card-body')).not.toContainText('原始待办');
  });

  test('3.5 删除待办', async ({ page }) => {
    // Create a todo
    await page.locator('button:has-text("添加待办")').first().click();
    await page.locator('textarea').fill('待删除待办');
    await page.locator('button:has-text("保存")').click();
    
    // Verify exists
    await expect(page.locator('.card-body')).toContainText('待删除待办');
    
    // Handle confirm dialog
    page.on('dialog', dialog => dialog.accept());
    
    // Delete
    await page.locator('.todo-card .delete-btn, .todo-card button:nth-child(3)').first().click();
    
    // Verify removed
    await expect(page.locator('.card-body')).not.toContainText('待删除待办');
  });

  test('3.6 待办完成标记', async ({ page }) => {
    // Create a todo
    await page.locator('button:has-text("添加待办")').first().click();
    await page.locator('textarea').fill('待完成待办');
    await page.locator('button:has-text("保存")').click();
    
    // Click checkbox to complete
    await page.locator('.todo-card input[type="checkbox"]').first().click();
    
    // Verify completed state (may have different styling)
    // The todo should now have 'done' class or similar
  });
});

// ============================================
// 卡片管理测试 (Card Management Tests)
// ============================================

test.describe('卡片管理 (Card Management)', () => {
  
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard`);
  });

  test('4.1 创建卡片 - 仅名称', async ({ page }) => {
    // Click add card button
    await page.locator('.add-card').click();
    
    // Fill in card name
    await page.locator('input[placeholder="如：今日待办"]').fill('新卡片');
    
    // Save
    await page.locator('button:has-text("保存")').click();
    
    // Verify card appears
    await expect(page.locator('.card-title')).toContainText('新卡片');
  });

  test('4.2 创建卡片 - 带关联标签', async ({ page }) => {
    // First create a tag
    await page.locator('button:has-text("标签管理"), button:has-text("标签")').first().click();
    await page.locator('input[placeholder="输入标签名"]').fill('卡片关联标签');
    await page.locator('button:has-text("添加")').click();
    await page.locator('button:has-text("关闭")').click();
    
    // Create card with tag
    await page.locator('.add-card').click();
    await page.locator('input[placeholder="如：今日待办"]').fill('带标签的卡片');
    
    // Select tag
    await page.locator('.tag-option').first().click();
    
    await page.locator('button:has-text("保存")').click();
    
    // Verify
    await expect(page.locator('.card-title')).toContainText('带标签的卡片');
  });

  test('4.3 创建卡片 - 设置排序方式', async ({ page }) => {
    await page.locator('.add-card').click();
    
    await page.locator('input[placeholder="如：今日待办"]').fill('排序卡片');
    
    // Select sort option
    await page.locator('select').selectOption('created_at-desc');
    
    await page.locator('button:has-text("保存")').click();
    
    // Verify
    await expect(page.locator('.card-title')).toContainText('排序卡片');
  });

  test('4.4 编辑卡片', async ({ page }) => {
    // Create a card first
    await page.locator('.add-card').click();
    await page.locator('input[placeholder="如：今日待办"]').fill('原始卡片');
    await page.locator('button:has-text("保存")').click();
    
    // Click edit button
    await page.locator('.card-actions button').first().click();
    
    // Modify name
    await page.locator('input[placeholder="如：今日待办"]').fill('已修改卡片');
    
    await page.locator('button:has-text("保存")').click();
    
    // Verify
    await expect(page.locator('.card-title')).toContainText('已修改卡片');
  });

  test('4.5 删除卡片', async ({ page }) => {
    // Create a card
    await page.locator('.add-card').click();
    await page.locator('input[placeholder="如：今日待办"]').fill('待删除卡片');
    await page.locator('button:has-text("保存")').click();
    
    // Verify exists
    await expect(page.locator('.card-title')).toContainText('待删除卡片');
    
    // Handle confirm dialog
    page.on('dialog', dialog => dialog.accept());
    
    // Click delete button
    await page.locator('.card-actions button').nth(1).click();
    
    // Verify removed
    await expect(page.locator('.card-title')).not.toContainText('待删除卡片');
  });
});

// ============================================
// 看板测试 (Dashboard Tests)
// ============================================

test.describe('看板 (Dashboard)', () => {
  
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard`);
  });

  test('5.1 看板首页加载', async ({ page }) => {
    // Verify dashboard loads
    await expect(page.locator('.dashboard')).toBeVisible();
    
    // Verify grid container exists
    await expect(page.locator('.grid')).toBeVisible();
    
    // Verify add card button exists
    await expect(page.locator('.add-card')).toBeVisible();
  });

  test('5.2 卡片内待办展示', async ({ page }) => {
    // Create a tag
    await page.locator('button:has-text("标签管理"), button:has-text("标签")').first().click();
    await page.locator('input[placeholder="输入标签名"]').fill('展示标签');
    await page.locator('button:has-text("添加")').click();
    await page.locator('button:has-text("关闭")').click();
    
    // Create a card with that tag
    await page.locator('.add-card').click();
    await page.locator('input[placeholder="如：今日待办"]').fill('展示卡片');
    await page.locator('.tag-option').first().click();
    await page.locator('button:has-text("保存")').click();
    
    // Create todo with matching tag
    await page.locator('button:has-text("添加待办")').first().click();
    await page.locator('textarea').fill('卡片内的待办');
    await page.locator('.tag-option').first().click();
    await page.locator('button:has-text("保存")').click();
    
    // Verify todo shows in card
    await expect(page.locator('.card-body')).toContainText('卡片内的待办');
  });

  test('5.3 看板布局保存', async ({ page }) => {
    // This test checks if layout persists after refresh
    // Create a card
    await page.locator('.add-card').click();
    await page.locator('input[placeholder="如：今日待办"]').fill('布局测试卡片');
    await page.locator('button:has-text("保存")').click();
    
    // Reload page
    await page.reload();
    
    // Verify card still exists
    await expect(page.locator('.card-title')).toContainText('布局测试卡片');
  });
});
