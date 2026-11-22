export type FeishuIdentity = {
  readonly openId: string;
  readonly unionId: string | null;
};

export type FeishuOAuthClient = {
  authorizeUrl(input: { readonly state: string; readonly redirectUri: string }): string;
  exchangeCode(input: { readonly code: string; readonly redirectUri: string }): Promise<FeishuIdentity>;
};

export function feishuOAuthClient(input: { readonly appId: string; readonly appSecret: string; readonly fetcher?: typeof fetch }): FeishuOAuthClient {
  const fetcher = input.fetcher ?? fetch;
  return {
    authorizeUrl({ state, redirectUri }) {
      const url = new URL('https://open.feishu.cn/open-apis/authen/v1/index');
      url.searchParams.set('app_id', input.appId);
      url.searchParams.set('redirect_uri', redirectUri);
      url.searchParams.set('state', state);
      return url.toString();
    },
    async exchangeCode({ code, redirectUri }) {
      const response = await fetcher('https://open.feishu.cn/open-apis/authen/v1/access_token', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ grant_type: 'authorization_code', code, app_id: input.appId, app_secret: input.appSecret, redirect_uri: redirectUri }),
      });
      const token = await jsonOf(response);
      if (!response.ok || !isSuccess(token)) throw new Error('飞书授权码交换失败');
      const accessToken = textAt(token.data, 'access_token');
      if (accessToken === null) throw new Error('飞书返回的用户令牌缺失');
      const userResponse = await fetcher('https://open.feishu.cn/open-apis/authen/v1/user_info', { headers: { authorization: `Bearer ${accessToken}` } });
      const user = await jsonOf(userResponse);
      if (!userResponse.ok || !isSuccess(user)) throw new Error('飞书用户身份读取失败');
      const openId = textAt(user.data, 'open_id');
      if (openId === null || !openId.startsWith('ou_')) throw new Error('飞书返回的 open_id 无效');
      return { openId, unionId: textAt(user.data, 'union_id') };
    },
  };
}

async function jsonOf(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function isSuccess(value: unknown): value is { readonly data?: unknown } {
  if (!isRecord(value)) return false;
  return value.code === undefined || value.code === 0;
}

function textAt(value: unknown, key: string): string | null {
  if (!isRecord(value) || typeof value[key] !== 'string' || value[key] === '') return null;
  return value[key];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
