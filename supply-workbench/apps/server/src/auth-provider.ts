import { devAuth, feishuAuth, type AuthProvider, type OAuthStateStore, type FeishuOAuthClient } from '@sw/auth';
import type { UserDirectory } from '../../../packages/application/src/ports/user-directory.js';
import type { AuthConfig } from './config.js';

export function authProvider(input: { readonly config: AuthConfig; readonly directory: UserDirectory; readonly oauthStates?: OAuthStateStore; readonly feishuOAuth?: FeishuOAuthClient; readonly now?: () => string }): AuthProvider {
  if (input.config.mode === 'dev') {
    return devAuth({ directory: input.directory, accessCode: input.config.accessCode, secret: input.config.secret });
  }
  if (input.oauthStates === undefined || input.feishuOAuth === undefined) throw new Error('AUTH_MODE=feishu 缺少 OAuth 依赖');
  return feishuAuth({
    directory: input.directory,
    appId: input.config.appId,
    appSecret: input.config.appSecret,
    secret: input.config.secret,
    oauth: { client: input.feishuOAuth, states: input.oauthStates, redirectUri: input.config.redirectUri, ...(input.now === undefined ? {} : { now: input.now }) },
  });
}
