const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.resolver.unstable_enablePackageExports = true;
config.resolver.disableHierarchicalLookup = true;

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

config.resolver.extraNodeModules = {
  '@ynab-counter/app-core': path.resolve(workspaceRoot, 'packages/app-core/src'),
};

module.exports = config;