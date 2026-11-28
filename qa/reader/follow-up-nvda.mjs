import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { code, component, login, po, seed } from './fixture.mjs';

const origin = process.env.ACCEPT_API;
const accessCode = process.env.DEV_ACCESS_CODE;
const output = process.env.PREACCEPT_OUT;
const channel = process.env.ACCEPT_BROWSER;
assert.equal(process.platform, 'win32');
assert.equal(new URL(origin).hostname, '127.0.0.1');
assert.notEqual(new URL(origin).port, '8080');
assert.ok(output && accessCode && channel && process.env.READER_TOOLS);
const requireWeb = createRequire(new URL('../packages/report-renderers/package.json', import.meta.url));
const requireReader = createRequire(join(process.env.READER_TOOLS, 'package.json'));
const { chromium } = requireWeb('playwright');
const { nvda } = requireReader('@guidepup/guidepup');

const evidence = {
  applicationSha: process.env.TESTED_SHA,
  harnessSha: process.env.READER_HARNESS_SHA,
  runner: { platform: process.platform, image: process.env.ImageOS, imageVersion: process.env.ImageVersion },
  browser: { channel, headless: false },
  reader: { name: nvda.name, method: 'Guidepup records speech messages emitted by the running NVDA process' },
  fixture: { type: 'synthetic', purchaseWorkbook: 'purchase-synthetic.xlsx', factoryWorkbook: 'factory-synthetic.xlsx' },
  checks: {},
  steps: [],
  errors: [],
};
await mkdir(output, { recursive: true });
const save = () => writeFile(join(output, 'result.json'), JSON.stringify(evidence, null, 2) + '\n');
const sanitize = (error) => String(error?.stack ?? error).replaceAll(accessCode, '[redacted]');
const spokenText = (phrases) => phrases.join(' ')
  .replace(/[\u200b-\u200d\ufeff]/gu, '')
  .replace(/\s+(?:dot|点)\s+/giu, '.')
  .replace(/\b(purchase|factory) synthetic(?=\.xlsx\b)/giu, '$1-synthetic');
const spokenPo = po.replace(/^PO/u, 'PO\\s*');
await save();

let browser;
let started = false;
try {
  browser = await chromium.launch({ channel, headless: false, args: ['--force-renderer-accessibility'] });
  evidence.browser.version = browser.version();
  const fixture = await seed(browser, { origin, accessCode, cwd: process.cwd() });
  await step('setup', 'start reader', 'Guidepup starts portable NVDA on this Windows desktop', async record => {
    assert.ok(nvda.detect(), 'Guidepup did not detect NVDA');
    await nvda.start({ capture: true, settings: { virtualBuffers: { autoSayAllOnPageLoad: false } } });
    started = true;
    evidence.reader.version = nvda.version;
    record.spoken = [...await nvda.spokenPhraseLog()];
  });
  for (const [role, account, scenario] of [['buyer', '2', buyer], ['manager', '5', manager]]) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    try {
      await login(page, origin, accessCode, account);
      await scenario(page, fixture);
      evidence.checks[role] = evidence.steps.some(step => step.role === role && step.status === 'fail') ? 'fail' : 'pass';
    } catch (error) {
      evidence.checks[role] = 'fail';
      evidence.errors.push({ role, error: sanitize(error) });
    } finally {
      await page.close();
      await save();
    }
  }
} catch (error) {
  evidence.errors.push({ role: 'setup', error: sanitize(error) });
} finally {
  if (started) {
    try { await nvda.stop(); }
    catch (error) { evidence.errors.push({ role: 'reader cleanup', error: sanitize(error) }); }
  }
  if (browser) await browser.close();
  evidence.result = evidence.errors.length ? 'fail' : 'pass';
  await save();
}
for (const error of evidence.errors) console.error(error.role, error.error);
assert.equal(evidence.result, 'pass', 'See preaccept/result.json for the NVDA diagnostic');

async function step(role, name, action, check) {
  const record = { role, name, action, at: new Date().toISOString(), status: 'running' };
  evidence.steps.push(record);
  await save();
  try {
    await check(record);
    record.status = record.speechError ? 'fail' : 'pass';
    if (record.speechError) evidence.errors.push({ role, name, error: record.speechError });
    console.log(role, name, record.status, JSON.stringify(record.spoken ?? []));
  } catch (error) {
    record.status = 'fail';
    record.error = sanitize(error);
    throw error;
  } finally {
    await save();
  }
}

async function reportFocus(record, expected) {
  await nvda.clearSpokenPhraseLog();
  await nvda.perform(nvda.keyboardCommands.reportCurrentFocus);
  try {
    await collectSpeech(record, expected);
  } catch (error) {
    record.speechError = sanitize(error);
  }
}

async function collectSpeech(record, expected, waitMs = 5000) {
  const deadline = Date.now() + waitMs;
  do {
    record.spoken = [...await nvda.spokenPhraseLog()];
    if (expected.test(spokenText(record.spoken))) return;
    await delay(150);
  } while (Date.now() < deadline);
  assert.match(spokenText(record.spoken), expected, 'Expected NVDA speech was absent after this action');
}

async function visit(page, path, role) {
  await step(role, 'open task', 'Playwright navigates to the initial route and brings the window to front', async record => {
    const responses = new Map();
    const capture = response => {
      if (new URL(response.url()).pathname.startsWith('/assets/')) responses.set(response.url(), response);
    };
    page.on('response', capture);
    try {
      await page.goto(origin + path, { waitUntil: 'load' });
      await page.bringToFront();
      await page.waitForFunction(() => document.hasFocus());
      const title = await page.title();
      await nvda.clearSpokenPhraseLog();
      await nvda.perform(nvda.keyboardCommands.reportTitle);
      record.windowSpeech = [...await nvda.spokenPhraseLog()];
      assert.match(spokenText(record.windowSpeech), /Microsoft[ -]*Edge/u, title + ' must be in the Windows foreground');
      const asset = await page.locator('script[type="module"][src^="/assets/"]').first().getAttribute('src');
      const response = responses.get(new URL(asset, origin).href);
      assert.ok(response?.ok(), 'Browser did not load the application entry');
      assert.equal(response.request().resourceType(), 'script');
      const sha256 = createHash('sha256').update(await response.body()).digest('hex');
      const entry = { asset, sha256 };
      if (evidence.checks.shell) assert.deepEqual(entry, evidence.checks.shell);
      evidence.checks.shell = entry;
      record.entry = entry;
    } finally {
      page.off('response', capture);
    }
  });
}

async function buyer(page, fixture) {
  const role = 'buyer';
  await visit(page, '/lines', role);
  const search = page.getByPlaceholder('搜索单号 / 品名 / 编码');
  const order = page.getByRole('link', { name: po, exact: true });
  const preview = page.getByRole('row').filter({ has: order }).getByRole('button', { name: '预览', exact: true });
  const batch = page.getByRole('dialog', { name: po + ' 预览', exact: true })
    .getByRole('link', { name: '查看第 2 批', exact: true });
  await step(role, 'search without changing lane', 'Playwright focuses the search field; NVDA sends typing and Enter; Playwright observes the URL and result', async record => {
    await search.focus();
    await reportFocus(record, /搜索|品名|编码/u);
    await nvda.type(code);
    record.typingSpeech = [...await nvda.spokenPhraseLog()];
    assert.equal(await search.inputValue(), code);
    await nvda.press('Enter');
    await page.waitForURL(({ searchParams }) => searchParams.get('q') === code && !searchParams.has('lane'));
    await order.waitFor();
    await preview.waitFor();
    record.order = po;
  });
  await step(role, 'open preview and read the batch link', 'Playwright locates Preview and sends Enter, then focuses the second-batch link; NVDA+Tab reports it', async record => {
    await preview.press('Enter');
    await batch.waitFor();
    await batch.focus();
    await reportFocus(record, /查看第\s*2\s*批/u);
  });
  await step(role, 'open directly to batch 2', 'NVDA sends Enter to the focused batch link; Playwright observes app-managed focus; NVDA+Tab reads the batch', async record => {
    await nvda.clearSpokenPhraseLog();
    await nvda.press('Enter');
    record.activationSpeech = [...await nvda.spokenPhraseLog()];
    await page.waitForURL(url => decodeURIComponent(url.pathname) === '/lines/' + component && url.searchParams.get('focusBatch') === fixture.second.id);
    await page.waitForFunction(() => document.activeElement?.matches('li[tabindex="-1"]') &&
      document.activeElement.textContent?.includes('2 · 已确认 · 确认 2026-11-27'));
    record.activeTag = await page.locator(':focus').evaluate(element => element.tagName);
    const batchSpeech = /(?:第\s*2\s*批|2\s*[·,. ]*\s*已确认|2026[-/ ]11[-/ ]27)/u;
    await reportFocus(record, batchSpeech);
    if (record.speechError && batchSpeech.test(record.activationSpeech.join(' '))) delete record.speechError;
  });
  await readSources(page, role);
  await step(role, 'return to original filtered list', 'Playwright locates the return link and sends Enter; app restores focus on the order; NVDA+Tab reports it', async record => {
    await page.getByRole('link', { name: '返回跟进中心', exact: true }).press('Enter');
    await page.waitForURL(({ pathname, searchParams }) => pathname === '/lines' && searchParams.get('q') === code);
    await order.and(page.locator(':focus')).waitFor();
    assert.equal(await search.inputValue(), code);
    await reportFocus(record, RegExp(spokenPo, 'u'));
  });
}

async function manager(page) {
  const role = 'manager';
  await visit(page, '/home?' + new URLSearchParams({ store: 'dafuyan', q: '测试', sort: 'date', order: 'ascend' }), role);
  const shop = page.getByRole('group', { name: '店铺范围' }).getByRole('button', { name: '达肤妍', exact: true });
  const register = page.getByRole('region', { name: '事项跟踪明细' });
  const search = register.getByRole('textbox', { name: '搜索事项', exact: true });
  const sort = register.getByRole('columnheader', { name: /下一到货日/u });
  const risk = page.getByRole('group', { name: '事项概览' }).getByRole('button', { name: /^交期风险/u });
  const drawer = page.getByRole('dialog', { name: '交期风险', exact: true });
  const selected = drawer.getByRole('link', { name: new RegExp('^查看订单 ' + po, 'u') })
    .and(drawer.locator(`a[href^="/lines/${encodeURIComponent(component)}?"]`));
  await sort.and(register.locator('[aria-sort="ascending"]')).waitFor();
  assert.equal(await shop.getAttribute('aria-pressed'), 'true');
  assert.equal(await search.inputValue(), '测试');
  await step(role, 'open local risk drawer, without opening an order', 'Playwright locates and focuses the risk button; NVDA reads it and sends Enter; Playwright verifies that the app stays on the homepage', async record => {
    await risk.focus();
    await reportFocus(record, /交期风险/u);
    await nvda.press('Enter');
    await page.waitForURL(({ pathname, searchParams }) => pathname === '/home' && searchParams.get('store') === 'dafuyan' && searchParams.get('drawer') === 'risk');
    await drawer.getByText(/^达肤妍 · \d{4}-\d{2}-\d{2} · \d+ 件$/u).waitFor();
    await drawer.getByText('已逾期', { exact: true }).first().waitFor();
    await drawer.getByText('确认到货晚于需求', { exact: true }).first().waitFor();
    await selected.waitFor();
    assert.equal(await risk.getAttribute('aria-expanded'), 'true');
    record.location = new URL(page.url()).pathname + new URL(page.url()).search;
    record.appManagedFocusInDrawer = await drawer.locator(':focus').count() > 0;
    record.riskButtonSpeech = record.spoken;
    await reportFocus(record, /交期风险|关闭/u);
  });
  const returnUrl = page.url();
  await step(role, 'actively select a specific order', 'Playwright focuses the specific link in the drawer; NVDA reports the link and sends Enter; Playwright observes the scoped detail page', async record => {
    await selected.focus();
    await reportFocus(record, RegExp('查看订单\\s*' + spokenPo, 'u'));
    await nvda.press('Enter');
    await page.waitForURL(url => decodeURIComponent(url.pathname) === '/lines/' + component && url.searchParams.get('store') === 'dafuyan');
    await page.getByRole('heading', { name: po, exact: true }).waitFor();
    await page.getByRole('region', { name: '采购事项来源', exact: true }).getByRole('heading', { name: '关联成品', exact: true }).waitFor();
  });
  await readSources(page, role);
  await step(role, 'return to the same risk drawer and selected order link', 'Playwright locates Return Home and sends Enter; Playwright only observes original focus; NVDA+Tab reports it', async record => {
    await page.getByRole('link', { name: '返回首页', exact: true }).press('Enter');
    await page.waitForURL(returnUrl);
    await selected.and(page.locator(':focus')).waitFor();
    assert.equal(await shop.getAttribute('aria-pressed'), 'true');
    assert.equal(await search.inputValue(), '测试');
    assert.equal(await sort.getAttribute('aria-sort'), 'ascending');
    record.location = new URL(page.url()).pathname + new URL(page.url()).search;
    await reportFocus(record, RegExp('查看订单\\s*' + spokenPo, 'u'));
  });
}

async function readSources(page, role) {
  const disclosure = page.getByRole('button', { name: '回查第 2 批原表', exact: true });
  await step(role, 'read and expand source disclosure', 'Playwright focuses the disclosure; NVDA+Tab reads it, then Playwright sends Enter', async record => {
    await disclosure.focus();
    await reportFocus(record, /回查第\s*2\s*批原表/u);
    await disclosure.press('Enter');
    assert.equal(await disclosure.getAttribute('aria-expanded'), 'true');
  });
  const purchase = page.getByRole('region', { name: '采购表 · 本单参考', exact: true });
  const factory = page.getByRole('region', { name: '工厂表 · 本单参考', exact: true });
  const references = [
    ['采购表', purchase, /purchase-synthetic\.xlsx.*达肤妍项目进度表.*第\s*5\s*行/u],
    ['工厂表', factory, /factory-synthetic\.xlsx.*09月排产包材原料需求表.*第\s*4\s*行/u],
  ];
  let headingReached = false;
  for (const [title, section, row] of references) {
    const action = role === 'buyer'
      ? 'Playwright locates and focuses the source-row link; NVDA+Tab reads the file, sheet and row'
      : 'Playwright confirms the rendered source and case permissions; NVDA quick heading navigation (4) and Down Arrow read the static source row';
    await step(role, 'read ' + title + ' source', action, async record => {
      await section.getByText(row).waitFor();
      if (role === 'buyer') {
        const link = section.getByRole('link', { name: row });
        await link.focus();
        await reportFocus(record, row);
        return;
      }
      assert.equal(await section.getByRole('link').count(), 0);
      const heading = new RegExp(title + '\\s*·?\\s*本单参考', 'u');
      if (!headingReached) {
        await nvda.perform(nvda.keyboardCommands.exitFocusMode, { capture: false });
      }
      await nvda.clearSpokenPhraseLog();
      for (let count = 0; count < 12; count++) {
        await nvda.perform(nvda.keyboardCommands.moveToNextHeadingLevel4);
        record.spoken = [...await nvda.spokenPhraseLog()];
        if (heading.test(record.spoken.at(-1) ?? '')) break;
      }
      if (!heading.test(record.spoken.at(-1) ?? '')) {
        record.speechError = 'NVDA did not reach the expected heading: ' + title;
        return;
      }
      record.heading = record.spoken.at(-1);
      headingReached = true;
      await nvda.clearSpokenPhraseLog();
      for (let count = 0; count < 8; count++) {
        await nvda.next();
        record.spoken = [...await nvda.spokenPhraseLog()];
        if (row.test(spokenText(record.spoken))) break;
      }
      try {
        assert.match(spokenText(record.spoken), row);
      } catch (error) {
        record.speechError = sanitize(error);
      }
    });
  }
}
