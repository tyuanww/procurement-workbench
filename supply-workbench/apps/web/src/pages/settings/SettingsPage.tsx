import { settingsSection, settingsSectionLabels } from './settings-section.js';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Alert, Button, Result, Skeleton } from 'antd';
import {
  AuditEntryViewSchema,
  SettingsSchema,
  UserViewSchema,
  listResponseSchema,
  type AuditEntryView,
  type Settings,
  type UserView,
} from '@sw/contracts';
import { apiErrorMessage, apiGet, asArray } from '../../shared/api/client.js';
import type { UiNotice } from '../../shared/ui/notice.js';
import { WorkbenchPage } from '../../shared/ui/page.js';
import { ContentTabs } from '../../shared/ui/view-switch.js';
import { space } from '../../theme/tokens.js';
import { AuditPanel, ThresholdPanel, UsersPanel } from './SettingsPanels.js';
import { settingsFormCss } from './settings-form-css.js';

export function SettingsPage() {
  const [params] = useSearchParams();
  const [users, setUsers] = useState<readonly UserView[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [audit, setAudit] = useState<readonly AuditEntryView[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [message, setMessage] = useState<UiNotice | null>(null);
  // Keep the first render useful for SSR and route snapshots. The effect below
  // immediately moves the page into an explicit loading state in the browser.
  const [loadState, setLoadState] = useState<SettingsLoadState>({ kind: 'ready' });
  const entity = params.get('entity') ?? '';
  const refresh = () => {
    setLoadState({ kind: 'loading' });
    setMessage(null);
    void load({ entity, setUsers, setSettings, setAudit, setLoadState });
  };
  useEffect(() => { refresh(); }, [entity]);
  return (
    <WorkbenchPage title="设置">
      <style>{settingsFormCss()}</style>
      <SettingsContent message={message} loadState={loadState} onRetry={refresh} users={users} refresh={refresh} setMessage={setMessage} settings={settings} setSettings={setSettings} audit={audit} openId={openId} setOpenId={setOpenId} />
    </WorkbenchPage>
  );
}

type SettingsLoadState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready' }
  | { readonly kind: 'error'; readonly message: string };

function SettingsContent(input: SettingsSectionsProps & { readonly message: UiNotice | null; readonly loadState: SettingsLoadState; readonly onRetry: () => void }) {
  return (
    <>
      {input.message === null ? null : <Alert style={{ marginBottom: space[4] }} type={input.message.kind} showIcon title={input.message.text} />}
      {input.loadState.kind === 'loading' ? <Skeleton active paragraph={{ rows: 10 }} /> : null}
      {input.loadState.kind === 'error' ? <Result status="error" title="设置没有读出来" subTitle={input.loadState.message} extra={<Button type="primary" onClick={input.onRetry}>重试</Button>} /> : null}
      {input.loadState.kind === 'ready' ? <SettingsSections {...input} /> : null}
    </>
  );
}

type SettingsSectionsProps = {
  readonly users: readonly UserView[];
  readonly refresh: () => void;
  readonly setMessage: (message: UiNotice | null) => void;
  readonly settings: Settings | null;
  readonly setSettings: (settings: Settings) => void;
  readonly audit: readonly AuditEntryView[];
  readonly openId: string | null;
  readonly setOpenId: (id: string | null) => void;
};

function SettingsSections(input: SettingsSectionsProps) {
  const [params, setParams] = useSearchParams();
  const { activeKey, defaultSection } = settingsSection(params);
  return (
    <ContentTabs
      aria-label="设置内容"
      activeKey={activeKey}
      onChange={(key) => setParams((previous) => {
        const next = new URLSearchParams(previous);
        if (key === defaultSection) next.delete('section');
        else next.set('section', key);
        return next;
      })}
      items={[
        {
          key: 'users',
          label: settingsSectionLabels.users,
          children: <UsersPanel users={input.users} onRefresh={input.refresh} setMessage={input.setMessage} />,
        },
        {
          key: 'settings',
          label: settingsSectionLabels.settings,
          children: input.settings === null ? null : (
            <ThresholdPanel settings={input.settings} onDone={input.setSettings} setMessage={input.setMessage} />
          ),
        },
        {
          key: 'audit',
          label: settingsSectionLabels.audit,
          children: (
            <AuditPanel audit={input.audit} openId={input.openId} setOpenId={input.setOpenId} />
          ),
        },
      ]}
    />
  );
}

async function load(input: {
  readonly entity: string;
  readonly setUsers: (users: readonly UserView[]) => void;
  readonly setSettings: (settings: Settings) => void;
  readonly setAudit: (entries: readonly AuditEntryView[]) => void;
  readonly setLoadState: (state: SettingsLoadState) => void;
}) {
  try {
    const query = input.entity === '' ? '' : `?entity=${encodeURIComponent(input.entity)}`;
    const [users, settings, audit] = await Promise.all([
      apiGet('/api/v1/users', asArray(UserViewSchema)),
      apiGet('/api/v1/settings', SettingsSchema),
      apiGet(`/api/v1/audit${query}`, listResponseSchema(AuditEntryViewSchema)),
    ]);
    input.setUsers(users);
    input.setSettings(settings);
    input.setAudit(audit.items);
    input.setLoadState({ kind: 'ready' });
  } catch (error) {
    input.setLoadState({ kind: 'error', message: apiErrorMessage(error) ?? '检查登录或网络后重试。' });
  }
}
