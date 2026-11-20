import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { env: { ENV_FILE: '.env.test' }, testTimeout: 30000, hookTimeout: 60000, fileParallelism: false } });
