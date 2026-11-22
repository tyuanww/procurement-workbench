import { Select, Tabs, Typography } from 'antd';
import type { ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { WorkbenchPage } from '../../shared/ui/page.js';
import { ProductDevelopmentPanel } from './product-development-panel.js';
import { ProgressCurrent } from './progress-current.js';
import { ProgressSchedule } from './progress-schedule.js';
import { progressStoreOf, storeLabels, withProgressScope, withProgressStore } from './store-query.js';
import { space } from '../../theme/tokens.js';

export { ArrivalTag, noteBatches, pagesFor } from './progress-current.js';

export type ProgressView = 'current' | 'schedule' | 'development';

const STORE_OPTIONS = Object.entries(storeLabels).map(([value, label]) => ({ value, label }));

export function ProgressPage(): ReactNode {
  const [params, setParams] = useSearchParams();
  const view = progressViewOf(params.get('view'));
  const store = progressStoreOf(params.get('store'));
  const isMine = params.get('scope') === 'mine';
  return (
    <WorkbenchPage title="管理店铺">
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: space[2], alignItems: 'center' }}>
        <Select
          aria-label="店铺"
          value={view === 'development' && store === 'unassigned' ? 'all' : store}
          options={view === 'development' ? STORE_OPTIONS.filter(({ value }) => value !== 'unassigned') : STORE_OPTIONS}
          style={{ minWidth: 144 }}
          onChange={(value) => setParams(withProgressStore(params.toString(), progressStoreOf(value)))}
        />
        {view !== 'current' ? null : <OrderScopePicker isMine={isMine} onChange={(value) => setParams(withProgressScope(params.toString(), value === 'mine'))} />}
      </div>
      <Tabs
        activeKey={view}
        items={[
          {
            key: 'current', label: '当前进度', children: view === 'current' ? <>
              <Typography.Paragraph>停得越久越靠前。下一步来自今天要推的原因。</Typography.Paragraph>
              <ProgressCurrent key={JSON.stringify([store, isMine])} store={store} isMine={isMine} />
            </> : null,
          },
          {
            key: 'schedule', label: '总排期',
            children: view === 'schedule' ? <ProgressSchedule key={store} store={store} /> : null,
          },
          {
            key: 'development', label: '新品开发进度',
            children: view === 'development' ? <ProductDevelopmentPanel key={store} store={store === 'unassigned' ? 'all' : store} /> : null,
          },
        ]}
        onChange={(key) => setParams(new URLSearchParams(withProgressView({ search: params.toString(), view: progressViewOf(key) })))}
      />
    </WorkbenchPage>
  );
}

function OrderScopePicker({ isMine, onChange }: { readonly isMine: boolean; readonly onChange: (value: string) => void }) {
  return <Select
    aria-label="事项范围"
    value={isMine ? 'mine' : 'all'}
    options={[{ value: 'all', label: '全部事项' }, { value: 'mine', label: '我的事项' }]}
    style={{ minWidth: 144 }}
    onChange={onChange}
  />;
}

export function progressViewOf(value: string | null): ProgressView {
  return value === 'schedule' || value === 'development' ? value : 'current';
}

export function withProgressView(input: { readonly search: string; readonly view: ProgressView }): string {
  const params = new URLSearchParams(input.search);
  if (input.view === 'current') params.delete('view');
  else params.set('view', input.view);
  return params.toString();
}
