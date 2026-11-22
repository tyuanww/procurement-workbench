import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createTestServer } from '../apps/server/test/helpers/server.ts';

const requireRenderer = createRequire(new URL('../packages/report-renderers/package.json', import.meta.url));
const { chromium } = requireRenderer('playwright');
const bundle = fileURLToPath(new URL('../apps/web/dist/app/', import.meta.url));
const server = await createTestServer(bundle);
try {
  const origin = await server.app.listen({ host: '127.0.0.1', port: 0 });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(15000);
    await page.goto(origin + '/login');
    await page.getByLabel('用户', { exact: true }).fill('0199f0a0-0000-7000-8000-000000000001');
    await page.getByLabel('访问码', { exact: true }).fill('dev-code');
    await page.getByRole('button', { name: '开发登录' }).click();
    await page.waitForURL(origin + '/settings');
    await page.getByRole('heading', { name: '设置', exact: true }).waitFor();
    assert.equal(await page.getByRole('tab', { name: '用户', exact: true }).getAttribute('aria-selected'), 'true');
    await page.goto(origin + '/missing-page-smoke');
    await page.getByText('页面不存在', { exact: true }).waitFor();
    assert.equal(await page.getByRole('link', { name: '返回今日' }).getAttribute('href'), '/today');
    console.log('web smoke passed: admin login, settings, signed-in missing page');
  } finally {
    await browser.close();
  }
} finally {
  await server.close();
}
