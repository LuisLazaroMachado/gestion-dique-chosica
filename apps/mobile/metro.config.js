// La app móvil es independiente del monorepo npm (usa otra versión de React).
// Metro busca primero en apps/mobile/node_modules; la búsqueda jerárquica sigue activa
// porque algunos paquetes de Expo vienen anidados (p. ej. expo/node_modules/expo-asset).
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);
config.resolver.nodeModulesPaths = [path.resolve(__dirname, 'node_modules')];
module.exports = config;
