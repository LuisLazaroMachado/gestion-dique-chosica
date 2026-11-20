// La app móvil es independiente del monorepo npm (otra versión de React):
// Metro solo resuelve paquetes desde apps/mobile/node_modules.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);
config.resolver.nodeModulesPaths = [path.resolve(__dirname, 'node_modules')];
config.resolver.disableHierarchicalLookup = true;
module.exports = config;
