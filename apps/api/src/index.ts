import { buildApp } from './app.js';
import { config } from './config.js';
import { storage } from './storage.js';

const app = await buildApp();
try {
  await storage.ensureReady();
} catch (e) {
  app.log.warn({ err: e }, 'No se pudo preparar el almacenamiento de evidencias');
}
await app.listen({ port: config.port, host: '0.0.0.0' });
