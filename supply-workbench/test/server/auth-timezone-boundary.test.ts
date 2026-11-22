import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { authConfig, feishuApp, loadConfig } from '../../apps/server/src/config.js';

const SECRET = '0123456789abcdef0123456789abcdef';

function env(overrides: Record<string, string | undefined> = {}): Record<string, string | undefined> {
  return {
    DATABASE_URL: 'postgres://localhost/db',
    AUTH_MODE: 'dev',
    DEV_ACCESS_CODE: 'dev-code',
    SESSION_SECRET: SECRET,
    ALLOW_DEV_LOGIN: 'enabled',
    ...overrides,
  };
}

it('在配置边界拒绝非法业务时区', () => {
  expect(() => loadConfig(env({ TZ_BUSINESS: 'Mars/Phobos' }))).toThrow(/时区|time zone|timezone/i);
});

it('partial coverage 配置必须同时有长密钥和 issuer allowlist', () => {
  expect(() => loadConfig(env({ IMPORT_COVERAGE_HMAC_SECRET: 'short', IMPORT_COVERAGE_ALLOWED_ISSUERS: 'factory-sync' }))).toThrow(/HMAC|32/);
  expect(() => loadConfig(env({ IMPORT_COVERAGE_HMAC_SECRET: SECRET }))).toThrow(/issuer|allowlist/i);
});

it('feishu 模式缺少登录应用凭证时在配置边界失败', () => {
  expect(() => loadConfig(env({ AUTH_MODE: 'feishu', DEV_ACCESS_CODE: undefined }))).toThrow(/FEISHU_APP_ID|FEISHU_APP_SECRET/);
});

it('feishu 登录配置不把周报目录令牌当成登录凭证', () => {
  const config = loadConfig(env({
    AUTH_MODE: 'feishu',
    DEV_ACCESS_CODE: undefined,
    FEISHU_APP_ID: 'app-id',
    FEISHU_APP_SECRET: 'app-secret',
    FEISHU_REDIRECT_URI: 'https://supply.example.com/api/v1/auth/feishu/callback',
    FEISHU_REPORT_FOLDER_TOKEN: undefined,
  }));
  expect(authConfig(config)).toEqual({ mode: 'feishu', appId: 'app-id', appSecret: 'app-secret', redirectUri: 'https://supply.example.com/api/v1/auth/feishu/callback', secret: SECRET });
  expect(feishuApp(config)).toBeUndefined();
});

it('保留 Feishu 周报发布所需的目录令牌独立配置', () => {
  const config = loadConfig(env({
    AUTH_MODE: 'feishu',
    DEV_ACCESS_CODE: undefined,
    FEISHU_APP_ID: 'app-id',
    FEISHU_APP_SECRET: 'app-secret',
    FEISHU_REDIRECT_URI: 'https://supply.example.com/api/v1/auth/feishu/callback',
    FEISHU_REPORT_FOLDER_TOKEN: 'folder-token',
  }));
  expect(feishuApp(config)).toEqual({ appId: 'app-id', appSecret: 'app-secret', folderToken: 'folder-token' });
});

const devCredentials = {
  DATABASE_URL: 'postgres://localhost/db',
  AUTH_MODE: 'dev',
  DEV_ACCESS_CODE: 'dev-code',
  SESSION_SECRET: SECRET,
};

it('NODE_ENV=production 时 dev 登录仍要 ALLOW_DEV_LOGIN', () => {
  expect(() => loadConfig({ ...devCredentials, NODE_ENV: 'production' })).toThrow(/ALLOW_DEV_LOGIN/);
});

it('NODE_ENV=development 时 dev 登录仍要 ALLOW_DEV_LOGIN', () => {
  expect(() => loadConfig({ ...devCredentials, NODE_ENV: 'development' })).toThrow(/ALLOW_DEV_LOGIN/);
});

it('未设置 NODE_ENV 时 dev 登录仍要 ALLOW_DEV_LOGIN', () => {
  expect(() => loadConfig(devCredentials)).toThrow(/ALLOW_DEV_LOGIN/);
});

it('ALLOW_DEV_LOGIN=true 不能放行 dev 登录', () => {
  expect(() => loadConfig({ ...devCredentials, ALLOW_DEV_LOGIN: 'true' })).toThrow(/ALLOW_DEV_LOGIN/);
});

it('ALLOW_DEV_LOGIN=1 不能放行 dev 登录', () => {
  expect(() => loadConfig({ ...devCredentials, ALLOW_DEV_LOGIN: '1' })).toThrow(/ALLOW_DEV_LOGIN/);
});

it('feishu 登录凭证齐全时 ALLOW_DEV_LOGIN=true 仍失败', () => {
  expect(() => loadConfig({
    DATABASE_URL: 'postgres://localhost/db',
    AUTH_MODE: 'feishu',
    SESSION_SECRET: SECRET,
    FEISHU_APP_ID: 'app-id',
    FEISHU_APP_SECRET: 'app-secret',
    FEISHU_REDIRECT_URI: 'https://supply.example.com/api/v1/auth/feishu/callback',
    ALLOW_DEV_LOGIN: 'true',
  })).toThrow(/ALLOW_DEV_LOGIN/);
});

it('compose 用 ALLOW_DEV_LOGIN=enabled 放行 dev 登录', () => {
  const text = readFileSync(new URL('../../docker/compose.yml', import.meta.url), 'utf8');
  expect(text).toMatch(/ALLOW_DEV_LOGIN:\s*enabled/);
});

it('ALLOW_DEV_LOGIN=enabled 时生产环境可以 dev 登录，结果不含开关和环境', () => {
  const config = loadConfig({ ...devCredentials, NODE_ENV: 'production', ALLOW_DEV_LOGIN: 'enabled' });
  expect(authConfig(config)).toEqual({ mode: 'dev', accessCode: 'dev-code', secret: SECRET });
  expect(config).not.toHaveProperty('ALLOW_DEV_LOGIN');
  expect(config).not.toHaveProperty('NODE_ENV');
});

it('空的覆盖 issuer 不算已配置', () => {
  const config = loadConfig(env({ IMPORT_COVERAGE_ALLOWED_ISSUERS: '' }));
  expect(config.IMPORT_COVERAGE_HMAC_SECRET).toBeUndefined();
  expect(() => loadConfig(env({ IMPORT_COVERAGE_HMAC_SECRET: SECRET, IMPORT_COVERAGE_ALLOWED_ISSUERS: '' }))).toThrow(/issuer|allowlist/i);
});

it('dev 模式拒绝非法飞书回调地址', () => {
  expect(() => loadConfig(env({ FEISHU_REDIRECT_URI: 'not-a-url' }))).toThrow(/URL/);
});
