import { z } from 'zod';

const devAccessMessage = 'AUTH_MODE=dev 时必须设置 DEV_ACCESS_CODE';
const devLoginMessage = 'AUTH_MODE=dev 时必须设置 ALLOW_DEV_LOGIN=enabled';
const feishuLoginMessage = 'ALLOW_DEV_LOGIN 只允许 enabled';
const feishuIdMessage = 'AUTH_MODE=feishu 时必须设置 FEISHU_APP_ID';
const feishuSecretMessage = 'AUTH_MODE=feishu 时必须设置 FEISHU_APP_SECRET';
const feishuRedirectMessage = 'AUTH_MODE=feishu 时必须设置 FEISHU_REDIRECT_URI';
const sessionSecretMessage = '必须设置 SESSION_SECRET';
const coverageSecretMessage = 'IMPORT_COVERAGE_HMAC_SECRET 至少 32 个字符';

function requiredText(message: string) {
  return z.string({ error: message }).min(1, { error: message });
}

const shared = {
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().default(8080),
  TZ_BUSINESS: z.string().default('Asia/Shanghai'),
  SESSION_SECRET: z.string({ error: sessionSecretMessage }).min(32, { error: 'SESSION_SECRET 至少 32 个字符' }),
  UPLOAD_DIR: z.string().default('/data/uploads'),
  PUBLIC_BASE_URL: z.string().optional(),
  FEISHU_REPORT_FOLDER_TOKEN: z.string().optional(),
  IMPORT_COVERAGE_HMAC_SECRET: z.string({ error: coverageSecretMessage }).min(32, { error: coverageSecretMessage }).optional(),
  IMPORT_COVERAGE_ALLOWED_ISSUERS: z.string().optional(),
  WEEKLY_REPORT_CRON: z.string().optional(),
  SERVE_WEB_DIR: z.string().optional(),
};

const base = z.object(shared);

const devLogin = base.extend({
  AUTH_MODE: z.literal('dev'),
  DEV_ACCESS_CODE: requiredText(devAccessMessage),
  ALLOW_DEV_LOGIN: z.literal('enabled', { error: devLoginMessage }),
  FEISHU_APP_ID: z.string().optional(),
  FEISHU_APP_SECRET: z.string().optional(),
  FEISHU_REDIRECT_URI: z.string().url().optional(),
});

const feishuLogin = base.extend({
  AUTH_MODE: z.literal('feishu'),
  DEV_ACCESS_CODE: z.string().optional(),
  FEISHU_APP_ID: requiredText(feishuIdMessage),
  FEISHU_APP_SECRET: requiredText(feishuSecretMessage),
  FEISHU_REDIRECT_URI: z.string({ error: feishuRedirectMessage }).url({ error: feishuRedirectMessage }),
  ALLOW_DEV_LOGIN: z.literal('enabled', { error: feishuLoginMessage }).optional(),
});

const devConfig = devLogin.omit({ ALLOW_DEV_LOGIN: true });
const feishuConfig = feishuLogin.omit({ ALLOW_DEV_LOGIN: true });

const EnvSchema = z.discriminatedUnion('AUTH_MODE', [
  devLogin.transform((value) => devConfig.parse(value)),
  feishuLogin.transform((value) => feishuConfig.parse(value)),
]).superRefine((env, ctx) => applyRuntime(env, ctx));

export type AppConfig = z.output<typeof EnvSchema>;

export type AuthConfig =
  | { readonly mode: 'dev'; readonly accessCode: string; readonly secret: string }
  | { readonly mode: 'feishu'; readonly appId: string; readonly appSecret: string; readonly redirectUri: string; readonly secret: string };

export type FeishuApp = {
  readonly appId: string;
  readonly appSecret: string;
  readonly folderToken: string;
};

type FeishuReportConfig = {
  readonly FEISHU_APP_ID?: string | undefined;
  readonly FEISHU_APP_SECRET?: string | undefined;
  readonly FEISHU_REPORT_FOLDER_TOKEN?: string | undefined;
};

export function feishuApp(config: FeishuReportConfig): FeishuApp | undefined {
  const appId = nonEmpty(config.FEISHU_APP_ID);
  const appSecret = nonEmpty(config.FEISHU_APP_SECRET);
  const folderToken = nonEmpty(config.FEISHU_REPORT_FOLDER_TOKEN);
  if (appId === undefined || appSecret === undefined || folderToken === undefined) return undefined;
  return { appId, appSecret, folderToken };
}

export function loadConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) throw new Error(parsed.error.issues.map((issue) => issue.message).join('；'));
  return parsed.data;
}

export function authConfig(config: AppConfig): AuthConfig {
  if (config.AUTH_MODE === 'dev') return { mode: 'dev', accessCode: config.DEV_ACCESS_CODE, secret: config.SESSION_SECRET };
  return { mode: 'feishu', appId: config.FEISHU_APP_ID, appSecret: config.FEISHU_APP_SECRET, redirectUri: config.FEISHU_REDIRECT_URI, secret: config.SESSION_SECRET };
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format();
    return true;
  } catch {
    return false;
  }
}

type RuntimeConfig = {
  readonly TZ_BUSINESS: string;
  readonly IMPORT_COVERAGE_HMAC_SECRET?: string | undefined;
  readonly IMPORT_COVERAGE_ALLOWED_ISSUERS?: string | undefined;
};

function applyRuntime(env: RuntimeConfig, ctx: z.core.$RefinementCtx): void {
  if (!isValidTimeZone(env.TZ_BUSINESS)) {
    ctx.addIssue({ code: 'custom', message: `无效业务时区 ${env.TZ_BUSINESS}`, path: ['TZ_BUSINESS'] });
  }
  const hasSecret = nonEmpty(env.IMPORT_COVERAGE_HMAC_SECRET) !== undefined;
  const hasIssuers = nonEmpty(env.IMPORT_COVERAGE_ALLOWED_ISSUERS) !== undefined;
  if (hasSecret !== hasIssuers) {
    ctx.addIssue({ code: 'custom', message: '导入覆盖声明必须同时设置 HMAC secret 和 issuer allowlist', path: ['IMPORT_COVERAGE_ALLOWED_ISSUERS'] });
  }
}

function nonEmpty(value: string | undefined): string | undefined {
  if (value === undefined || value === '') return undefined;
  return value;
}
