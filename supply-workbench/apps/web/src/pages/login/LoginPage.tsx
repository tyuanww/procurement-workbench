import { useEffect, useState } from 'react';
import { Button, Card, Flex, Form, Input, Result, Skeleton, Typography } from 'antd';
import { AuthModeSchema, SessionUserSchema } from '@sw/contracts';
import { useLocation } from 'react-router';
import { apiGet, apiSend } from '../../shared/api/client.js';
import { usePageTitle } from '../../shared/ui/page.js';
import { bg, brand } from '../../theme/tokens.js';

export function LoginPage() {
  const returnTo = loginDestination(useLocation().state);
  usePageTitle('登录');
  const [message, setMessage] = useState('');
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
        {mode === 'dev' ? <DevLoginForm onMessage={setMessage} returnTo={returnTo} /> : null}
        {mode === 'feishu' ? <>
          <Typography.Paragraph type="secondary">使用企业飞书账号登录。</Typography.Paragraph>
          <Button type="primary" href={feishuStartHref(returnTo)} block>
            使用飞书登录
          </Button>
        </> : null}
        {message === '' ? null : (
          <Typography.Paragraph type="danger">{message}</Typography.Paragraph>
        )}
      </Card>
    </Flex>
  );
}

function DevLoginForm({ onMessage, returnTo }: { readonly onMessage: (value: string) => void; readonly returnTo: string }) {
  return <Form
    layout="vertical"
    onFinish={(values: { readonly userId?: string; readonly accessCode?: string }) => {
      void login({ userId: values.userId ?? '', accessCode: values.accessCode ?? '', returnTo }).then(onMessage);
    }}
  >
    <Form.Item name="userId" label="用户" rules={[{ required: true, message: '填写用户' }]}>
      <Input />
    </Form.Item>
    <Form.Item name="accessCode" label="访问码" rules={[{ required: true, message: '填写访问码' }]}>
      <Input.Password />
    </Form.Item>
    <Button type="primary" htmlType="submit" block>
      开发登录
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

async function login({ userId, accessCode, returnTo }: { readonly userId: string; readonly accessCode: string; readonly returnTo: string }): Promise<string> {
  try {
    await apiSend({
      path: '/api/v1/auth/dev/login',
      method: 'POST',
      body: { userId, accessCode },
      schema: SessionUserSchema,
    });
    window.location.replace(returnTo);
    return '';
  } catch {
    return '登录失败。请核对用户和访问码。';
  }
}
