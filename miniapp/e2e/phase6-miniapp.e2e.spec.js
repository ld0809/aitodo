const automator = require('miniprogram-automator');
const { getAutoPort, getProjectPath, resolveCliPath } = require('./devtools.cjs');

const TEST_EMAIL = process.env.MINIAPP_E2E_EMAIL || 'test1@fxiaoke.com';
const TEST_PASSWORD = process.env.MINIAPP_E2E_PASSWORD || 'My123456';
const AUTHENTICATED_ENTRY_PATHS = ['pages/bind/index', 'pages/home/index'];

describe('Phase6 Miniapp Auto E2E', () => {
  let miniProgram;
  let authenticatedPagePath = '';
  let authenticatedPage;

  function isExpectedEntryPage(pagePath) {
    return [
      'pages/launch/index',
      'pages/email-auth/index',
      'pages/bind/index',
      'pages/home/index'
    ].includes(pagePath);
  }

  async function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function waitForCurrentPage(expectedPaths, timeout = 20000) {
    const deadline = Date.now() + timeout;
    let lastPage = null;

    while (Date.now() < deadline) {
      lastPage = await miniProgram.currentPage();
      if (expectedPaths.includes(lastPage.path)) {
        return lastPage;
      }
      await sleep(400);
    }

    const pageData = lastPage ? await lastPage.data() : null;
    throw new Error(`Timed out waiting for page ${expectedPaths.join(', ')}, got ${lastPage ? lastPage.path : 'unknown'} with data ${JSON.stringify(pageData)}`);
  }

  async function resetSession() {
    await miniProgram.evaluate(() => {
      wx.removeStorageSync('access_token');
      wx.removeStorageSync('current_user');
      wx.removeStorageSync('miniapp_e2e_key');
    });
  }

  async function loginWithReadmeAccount() {
    if (authenticatedPagePath) {
      return authenticatedPage;
    }

    await resetSession();
    await miniProgram.reLaunch('/pages/launch/index');

    const authPage = await waitForCurrentPage(['pages/email-auth/index']);
    await authPage.waitFor('.field-input');

    const inputs = await authPage.$$('.field-input');
    expect(inputs.length).toBeGreaterThanOrEqual(2);
    await inputs[0].input(TEST_EMAIL);
    await inputs[1].input(TEST_PASSWORD);

    const submitButton = await authPage.$('.btn-primary');
    expect(submitButton).toBeTruthy();
    await submitButton.tap();

    authenticatedPage = await waitForCurrentPage(AUTHENTICATED_ENTRY_PATHS, 25000);
    authenticatedPagePath = authenticatedPage.path;
    return authenticatedPage;
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

  test('launch page should open as an expected entry page', async () => {
    const current = await miniProgram.currentPage();
    expect(isExpectedEntryPage(current.path)).toBe(true);
  });

  test('readme account should be able to log in and reach bind or home', async () => {
    const current = await loginWithReadmeAccount();
    const session = await miniProgram.evaluate(() => ({
      accessToken: wx.getStorageSync('access_token'),
      currentUser: wx.getStorageSync('current_user')
    }));

    expect(session.accessToken).toBeTruthy();
    expect(session.currentUser).toBeTruthy();
    expect(session.currentUser.email).toBe(TEST_EMAIL);
    expect(AUTHENTICATED_ENTRY_PATHS).toContain(current.path);

    if (current.path === 'pages/bind/index') {
      await current.waitFor('.bind-panel');
      const emailValue = await current.$('.value');
      expect(emailValue).toBeTruthy();
      expect(await emailValue.text()).toBe(TEST_EMAIL);
      return;
    }

    await current.waitFor('.fab');
    const fab = await current.$('.fab');
    const tagIndicator = await current.$('.tag-indicator');
    expect(fab).toBeTruthy();
    expect(tagIndicator).toBeTruthy();
  });

  test('runtime storage should be writable through automator evaluate', async () => {
    await loginWithReadmeAccount();

    const result = await miniProgram.evaluate(() => {
      wx.setStorageSync('miniapp_e2e_key', 'miniapp_e2e_value');
      return wx.getStorageSync('miniapp_e2e_key');
    });

    expect(result).toBe('miniapp_e2e_value');
  });
});
