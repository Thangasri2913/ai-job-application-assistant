// The shared API types live in ../../packages/shared (linked as a file dependency), outside
// this app's folder, so Metro must watch it too. Only its built, platform-neutral output is
// used — no browser (Vite) code is ever imported here.
const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.watchFolders = [path.resolve(__dirname, '../../packages/shared')];
config.resolver.nodeModulesPaths = [path.resolve(__dirname, 'node_modules')];
module.exports = config;
