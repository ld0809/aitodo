const automator = require('miniprogram-automator');
const { getAutoPort, getProjectPath, resolveCliPath } = require('./devtools.cjs');

describe('Phase6 Miniapp Auto E2E', () => {
  let miniProgram;

  function isExpectedEntryPage(pagePath) {
    return [
      'pages/launch/index',
      'pages/email-auth/index',
      'pages/bind/index',
      'pages/home/index'
    ].includes(pagePath);
  }

  beforeAll(async () => {
    miniProgram = await automator.launch({
      cliPath: resolveCliPath(),
      projectPath: getProjectPath(),
      port: getAutoPort(),
      timeout: 30000,
      args: ['--lang', 'zh']
    });
  });

  afterAll(async () => {
    if (miniProgram) {
      try {
        await miniProgram.close();
      } catch (_error) {
        // The devtools process may have already exited; ignore close failures.
      }
    }
  });

  test('launch page should open as the current page', async () => {
    const current = await miniProgram.currentPage();
    expect(isExpectedEntryPage(current.path)).toBe(true);
  });

  test('current entry page should render core ui', async () => {
    const current = await miniProgram.currentPage();

    if (current.path === 'pages/launch/index') {
      const title = await current.$('.title');
      const button = await current.$('.start-btn');
      expect(title).toBeTruthy();
      expect(button).toBeTruthy();
      expect(await title.text()).toBe('AI待办');
      return;
    }

    if (current.path === 'pages/email-auth/index') {
      const panel = await current.$('.auth-panel');
      const emailInput = await current.$('.field-input');
      expect(panel).toBeTruthy();
      expect(emailInput).toBeTruthy();
      return;
    }

    if (current.path === 'pages/bind/index') {
      const panel = await current.$('.bind-panel');
      const button = await current.$('.btn-primary');
      expect(panel).toBeTruthy();
      expect(button).toBeTruthy();
      return;
    }

    const fab = await current.$('.fab');
    const tagIndicator = await current.$('.tag-indicator');
    expect(fab).toBeTruthy();
    expect(tagIndicator).toBeTruthy();
  });

  test('runtime storage should be writable through automator evaluate', async () => {
    const result = await miniProgram.evaluate(() => {
      wx.setStorageSync('miniapp_e2e_key', 'miniapp_e2e_value');
      return wx.getStorageSync('miniapp_e2e_key');
    });

    expect(result).toBe('miniapp_e2e_value');
  });
});
