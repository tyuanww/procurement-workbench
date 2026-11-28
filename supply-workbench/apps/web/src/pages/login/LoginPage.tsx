import { useEffect, useState } from 'react';
import { Alert, Button, Card, Flex, Form, Input, Result, Skeleton, Typography } from 'antd';
import { AuthModeSchema, SessionUserSchema, type DevLoginRequest } from '@sw/contracts';
import { useLocation } from 'react-router';
import { followUpFeishuReturn } from '../../features/follow-up/index.js';
import { apiGet, apiSend } from '../../shared/api/client.js';
import { usePageTitle } from '../../shared/ui/page.js';
import { bg, brand, space } from '../../theme/tokens.js';

export function LoginPage() {
  const returnTo = loginDestination(useLocation().state);
  usePageTitle('登录');
  const [mode, setMode] = useState<'loading' | 'dev' | 'feishu' | 'error'>('loading');
  useEffect(() => {
    void apiGet('/api/v1/meta/auth', AuthModeSchema).then((value) => setMode(value.mode)).catch(() => setMode('error'));
  }, []);
  return (
    <Flex align="center" justify="center" style={{ minHeight: '100vh', background: bg.page }}>
      <Card style={{ width: 360 }}>
        <Typography.Title level={1} style={{ color: brand[800], marginTop: 0 }}>
          供应链工作台登录
        </Typography.Title>
        {mode === 'loading' ? <Skeleton active paragraph={{ rows: 4 }} /> : null}
        {mode === 'error' ? <Result status="error" title="无法读取登录配置" subTitle="请联系管理员检查服务配置。" /> : null}
        {mode === 'dev' ? <AccessCodeLoginForm returnTo={returnTo} /> : null}
        {mode === 'feishu' ? <FeishuLogin returnTo={returnTo} /> : null}
      </Card>
    </Flex>
  );
}

function FeishuLogin({ returnTo }: { readonly returnTo: string }) {
  const [token] = useState(() => window.crypto.randomUUID());
  const [hasStorageError, setStorageError] = useState(false);
  const { returnTo: destination, stored } = followUpFeishuReturn(returnTo, token);
  const href = feishuStartHref(destination);
  const login = stored === undefined
    ? <Button type="primary" href={href} block>使用飞书登录</Button>
    : <Button type="primary" block onClick={() => {
      try {
        window.sessionStorage.setItem(stored.key, stored.value);
      } catch {
        setStorageError(true);
        return;
      }
      window.location.assign(href);
    }}>使用飞书登录</Button>;
  return <>
    <Typography.Paragraph type="secondary">使用企业飞书账号登录。</Typography.Paragraph>
    {hasStorageError ? <Alert type="error" title="浏览器无法在登录后恢复这组订单。请先允许当前站点使用会话存储。" /> : null}
    {login}
  </>;
}

function AccessCodeLoginForm({ returnTo }: { readonly returnTo: string }) {
  const [status, setStatus] = useState<'ready' | 'submitting' | 'failed'>('ready');

  async function submit(credentials: DevLoginRequest): Promise<void> {
    if (status === 'submitting') return;
    setStatus('submitting');
    try {
      await apiSend({
        path: '/api/v1/auth/dev/login',
        method: 'POST',
        body: credentials,
        schema: SessionUserSchema,
      });
      window.location.replace(returnTo);
    } catch {
      setStatus('failed');
    }
  }

  return <Form<DevLoginRequest>
    layout="vertical"
    scrollToFirstError={{ focus: true }}
    validateTrigger={[]}
    onFinish={(credentials) => { void submit(credentials); }}
    onValuesChange={() => {
      if (status === 'failed') setStatus('ready');
    }}
  >
    {status === 'failed' ? (
      <Alert type="error" showIcon title="登录失败。请核对用户和访问码。" style={{ marginBottom: space[3] }} />
    ) : null}
    <Form.Item<DevLoginRequest> name="userId" label="用户" rules={[{ required: true, message: '请填写用户' }]}>
      <Input />
    </Form.Item>
    <Form.Item<DevLoginRequest> name="accessCode" label="访问码" rules={[{ required: true, message: '请填写访问码' }]}>
      <Input.Password />
    </Form.Item>
    <Button autoInsertSpace={false} type="primary" htmlType="submit" loading={status === 'submitting'} block>
      登录
    </Button>
  </Form>;
}

function loginDestination(state: unknown): string {
  if (typeof state !== 'object' || state === null || !('returnTo' in state)) return '/';
  const value = state.returnTo;
  if (typeof value !== 'string' || !/^\/(?!\/)[^\s\\]*$/u.test(value)) return '/';
  const origin = 'https://workbench.invalid';
  const { origin: targetOrigin, pathname, search, hash } = new URL(value, origin);
  if (targetOrigin !== origin || pathname.startsWith('//') || pathname === '/login') return '/';
  return pathname + search + hash;
}

function feishuStartHref(returnTo: string): string {
  const start = '/api/v1/auth/feishu/start';
  return returnTo === '/' ? start : `${start}?${new URLSearchParams({ returnTo })}`;
}
