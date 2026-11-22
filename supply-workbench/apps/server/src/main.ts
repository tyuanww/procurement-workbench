import type { FastifyInstance } from 'fastify';
import { createDb, fileStore, oauthStateRepository, userDirectory } from '@sw/persistence';
import { feishuOAuthClient } from '@sw/auth';
import { authConfig, feishuApp, loadConfig } from './config.js';
import { authProvider } from './auth-provider.js';
import { composeFollowUp, followUpAttachmentMaxBytes } from './composition/follow-up.js';
import { composeImports } from './composition/imports.js';
import { composeMasterData } from './composition/master-data.js';
import { composePerformance } from './composition/performance.js';
import { composeOwner } from './composition/owner.js';
import { composeFactoryLinks } from './composition/factory-links.js';
import { composeProductDevelopment } from './composition/product-development.js';
import { composePlan } from './composition/plan.js';
import { composePlatform, platformHealth } from './composition/platform.js';
import { composeProductArchive, productAttachmentMaxBytes } from './composition/product-archive.js';
import { composeReporting } from './composition/reporting.js';
import { composeSearch } from './composition/search.js';
import { composeToday } from './composition/today.js';
import { buildHttpApp } from './http/app.js';
import { registerFollowUpRoutes } from './http/follow-up/routes.js';
import { registerImportRoutes } from './http/imports/routes.js';
import { registerMasterDataRoutes } from './http/master-data/routes.js';
import { registerPerformanceRoutes } from './http/performance/routes.js';
import { registerOwnerRoutes } from './http/owner/routes.js';
import { registerFactoryLinkRoutes } from './http/factory-links/routes.js';
import { registerProductDevelopmentRoutes } from './http/product-development/routes.js';
import { registerPlanRoutes } from './http/plan/routes.js';
import { registerPlatformRoutes } from './http/platform/routes.js';
import { registerProductRoutes } from './http/product-archive/routes.js';
import { registerReportingRoutes } from './http/reporting/routes.js';
import { registerSearchRoutes } from './http/search/routes.js';
import { registerTodayRoutes } from './http/today/routes.js';
import { startBoss } from './jobs/boss.js';
import { registerJobs } from './jobs/runner.js';
import type { AppDatabase, SqlExec } from '@sw/persistence';
import type { PlatformApi } from './http/platform-api.js';

export async function main(): Promise<void> {
  const config = loadConfig();
  const handle = await createDb({ driver: 'pg', url: config.DATABASE_URL });
  await assertDatabaseConnected(handle.exec);
  const composed = composePlatform({
    db: handle.db,
    timeZone: config.TZ_BUSINESS,
    weeklyCron: config.WEEKLY_REPORT_CRON ?? null,
    files: fileStore(config.UPLOAD_DIR),
    health: () => platformHealth(handle.exec),
  });
  const app = await httpApp({ config, db: handle.db, api: composed.api });
  const jobs = await startBoss(config.DATABASE_URL, config.TZ_BUSINESS);
  const stop = async () => {
    await app.close();
    await jobs.stop();
    await handle.close();
  };
  process.once('SIGTERM', () => {
    void stop();
  });
  process.once('SIGINT', () => {
    void stop();
  });
  try {
    await registerJobs(jobs.scheduler, composed.triggers);
    await app.listen({ port: config.PORT, host: '0.0.0.0' });
  } catch (error) {
    await stop();
    throw error;
  }
}

export async function assertDatabaseConnected(exec: SqlExec): Promise<void> {
  await exec('select 1');
}

function relationApis(input: { readonly db: AppDatabase; readonly timeZone: string }) {
  return {
    plan: composePlan(input),
    productDevelopment: composeProductDevelopment(input),
    owners: composeOwner(input),
    factoryLinks: composeFactoryLinks(input),
  };
}

function authFor(input: { readonly config: ReturnType<typeof loadConfig>; readonly db: AppDatabase; readonly directory: ReturnType<typeof userDirectory> }) {
  const value = authConfig(input.config);
  if (value.mode === 'dev') return authProvider({ config: value, directory: input.directory });
  return authProvider({ config: value, directory: input.directory, oauthStates: oauthStateRepository(input.db), feishuOAuth: feishuOAuthClient({ appId: value.appId, appSecret: value.appSecret }), now: () => new Date().toISOString() });
}

async function httpApp({ config, db, api }: { readonly config: ReturnType<typeof loadConfig>; readonly db: AppDatabase; readonly api: PlatformApi }) {
  const coverageIssuers = config.IMPORT_COVERAGE_ALLOWED_ISSUERS?.split(',').map((issuer) => issuer.trim()).filter((issuer) => issuer !== '');
  const imports = composeImports({ db, uploadDir: config.UPLOAD_DIR, timeZone: config.TZ_BUSINESS, ...(config.IMPORT_COVERAGE_HMAC_SECRET === undefined || coverageIssuers === undefined ? {} : { coverageAttestationSecret: config.IMPORT_COVERAGE_HMAC_SECRET, coverageAttestationIssuers: coverageIssuers }) });
  const followUp = composeFollowUp({ db, uploadDir: config.UPLOAD_DIR, timeZone: config.TZ_BUSINESS });
  const master = composeMasterData({ db, timeZone: config.TZ_BUSINESS });
  const today = composeToday({ db, timeZone: config.TZ_BUSINESS });
  const products = composeProductArchive({ db, uploadDir: config.UPLOAD_DIR, timeZone: config.TZ_BUSINESS });
  const feishu = feishuApp(config);
  const reporting = composeReporting({
    db,
    files: fileStore(config.UPLOAD_DIR),
    timeZone: config.TZ_BUSINESS,
    secret: config.SESSION_SECRET,
    printOrigin: () => `http://127.0.0.1:${config.PORT}`,
    ...(feishu === undefined ? {} : { feishu }),
  });
  const performance = composePerformance({ db, timeZone: config.TZ_BUSINESS });
  const relations = relationApis({ db, timeZone: config.TZ_BUSINESS });
  const search = composeSearch({ db });
  const directory = userDirectory(db);
  const auth = authFor({ config, db, directory });
  return buildHttpApp({
    auth,
    register: (server) => {
      registerPlatformRoutes({ app: server, api, devLogin: config.AUTH_MODE === 'dev', businessTimeZone: config.TZ_BUSINESS });
      registerImportRoutes(server, imports);
      registerFollowUpRoutes({ app: server, api: followUp, attachmentMaxBytes: followUpAttachmentMaxBytes() });
      registerMasterDataRoutes(server, master);
      registerTodayRoutes(server, today);
      registerProductRoutes({ app: server, api: products, attachmentMaxBytes: productAttachmentMaxBytes() });
      registerReportingRoutes(server, reporting);
      registerPerformanceRoutes(server, performance);
      registerRelationRoutes(server, relations);
      registerSearchRoutes(server, search);
    },
    ...(config.SERVE_WEB_DIR === undefined ? {} : { serveWebDir: config.SERVE_WEB_DIR }),
  });
}

function registerRelationRoutes(server: FastifyInstance, relations: ReturnType<typeof relationApis>): void {
  registerPlanRoutes(server, relations.plan);
  registerProductDevelopmentRoutes(server, relations.productDevelopment);
  registerOwnerRoutes(server, relations.owners);
  registerFactoryLinkRoutes(server, relations.factoryLinks);
}
