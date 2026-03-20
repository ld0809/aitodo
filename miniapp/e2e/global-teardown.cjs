const childProcess = require('node:child_process');
const { resolveCliPath } = require('./devtools.cjs');

module.exports = async () => {
  try {
    const cliPath = resolveCliPath();
    childProcess.spawnSync(cliPath, ['quit'], {
      stdio: 'ignore'
    });
  } catch (error) {}
};
