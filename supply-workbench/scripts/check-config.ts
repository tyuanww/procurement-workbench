import { loadConfig } from '../apps/server/src/config.ts';

try {
  loadConfig();
} catch (error) {
  console.error(error instanceof Error ? error.message : '配置无效');
  process.exit(1);
}
