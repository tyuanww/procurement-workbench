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
    const user = page.getByLabel('用户', { exact: true });
    const code = page.getByLabel('访问码', { exact: true });
    const submit = page.getByRole('button', { name: '登录', exact: true });
    await submit.waitFor();
    assert.equal(await submit.getAttribute('type'), 'submit');
    const reveal = page.getByRole('button', { name: '显示', exact: true });
    for (const field of [user, code, reveal, submit]) {
      await page.keyboard.press('Tab');
      assert.equal(await field.evaluate((element) => element === document.activeElement), true);
    }
    await page.keyboard.press('Enter');
    await page.getByText('请填写用户', { exact: true }).waitFor();
    await page.getByText('请填写访问码', { exact: true }).waitFor();
    assert.equal(await user.evaluate((element) => element === document.activeElement), true);
    for (const [field, message] of [[user, '请填写用户'], [code, '请填写访问码']] as const) {
      assert.equal(await field.getAttribute('aria-invalid'), 'true');
      assert.equal(await field.evaluate((element) => document.getElementById(element.getAttribute('aria-describedby') ?? '')?.textContent), message);
    }
    await user.fill('0199f0a0-0000-7000-8000-000000000001');
    await code.fill('wrong-code');
    await code.press('Enter');
    const loginError = page.getByRole('alert').filter({ hasText: '登录失败。请核对用户和访问码。' });
    await loginError.waitFor();
    await code.fill('dev-code');
    await code.press('Enter');
    await page.waitForURL(origin + '/settings');
    await page.getByRole('heading', { name: '设置', exact: true }).waitFor();
    const header = page.getByRole('banner');
    await header.getByText('SHINEMAGE 供应链工作台', { exact: true }).waitFor();
    assert.equal(await header.getByText('开发登录', { exact: true }).count(), 0);
    assert.equal(await page.getByRole('button', { name: '用户', exact: true }).getAttribute('aria-expanded'), 'true');
    await page.goto(origin + '/missing-page-smoke');
    await page.getByText('页面不存在', { exact: true }).waitFor();
    assert.equal(await page.getByRole('link', { name: '返回今日事项' }).getAttribute('href'), '/today');
    console.log('web smoke passed: admin login, settings, signed-in missing page');
  } finally {
    await browser.close();
  }
} finally {
  await server.close();
}
