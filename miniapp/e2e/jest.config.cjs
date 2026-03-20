module.exports = {
  rootDir: '..',
  testEnvironment: 'node',
  testRegex: '.*\\.e2e\\.spec\\.js$',
  testTimeout: 180000,
  verbose: true,
  globalSetup: '<rootDir>/e2e/global-setup.cjs',
  globalTeardown: '<rootDir>/e2e/global-teardown.cjs',
};
