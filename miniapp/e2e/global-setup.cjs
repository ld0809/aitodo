const fs = require('node:fs');
const childProcess = require('node:child_process');
const { getProjectPath, resolveCliPath } = require('./devtools.cjs');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = async () => {
  const cliPath = resolveCliPath();
  const projectPath = getProjectPath();

  if (!fs.existsSync(cliPath)) {
    throw new Error(`WECHAT_WEB_DEVTOOLS_CLI does not exist: ${cliPath}`);
  }

  if (!fs.existsSync(projectPath)) {
    throw new Error(`MINIAPP_PROJECT_PATH does not exist: ${projectPath}`);
  }

  process.env.WECHAT_WEB_DEVTOOLS_CLI = cliPath;
  process.env.MINIAPP_PROJECT_PATH = projectPath;

  childProcess.spawnSync(cliPath, ['quit'], {
    stdio: 'ignore'
  });

  // Official CLI docs state quitting can be delayed by the IDE close flow.
  await sleep(3500);
};
