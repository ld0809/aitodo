const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_AUTO_PORT = 9531;

function resolveCliPath() {
  const configuredPath = process.env.WECHAT_WEB_DEVTOOLS_CLI;
  const candidates = [
    configuredPath,
    configuredPath ? path.join(configuredPath, 'cli') : '',
    '/Volumes/external/tools/wechatwebdevtools.app/Contents/MacOS/cli',
    '/Applications/wechatwebdevtools.app/Contents/MacOS/cli'
  ];

  for (let i = 0; i < candidates.length; i += 1) {
    const candidate = candidates[i];
    if (!candidate) {
      continue;
    }

    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return candidate;
      }
    } catch (error) {}
  }

  throw new Error('Missing usable WeChat DevTools cli binary. Set WECHAT_WEB_DEVTOOLS_CLI to <安装路径>/Contents/MacOS/cli');
}

function getProjectPath() {
  return process.env.MINIAPP_PROJECT_PATH || path.resolve(__dirname, '..');
}

function getAutoPort() {
  return Number(process.env.MINIAPP_E2E_PORT || DEFAULT_AUTO_PORT);
}

module.exports = {
  DEFAULT_AUTO_PORT,
  getAutoPort,
  getProjectPath,
  resolveCliPath
};
