import { Card, Flex, Select } from 'antd';
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

const viewLabels: Record<ProgressView, string> = { current: '当前进度', schedule: '总排期', development: '新品开发进度' };

export function ProgressPage({ view: selectedView }: { readonly view?: ProgressView }): ReactNode {
  const [params, setParams] = useSearchParams();
  const view = selectedView ?? progressViewOf(params.get('view'));
  const store = progressStoreOf(params.get('store'));
  const isMine = params.get('scope') === 'mine';
  const scope = (
    <>
      <Select
        aria-label="店铺"
        value={view === 'development' && store === 'unassigned' ? 'all' : store}
        options={view === 'development' ? STORE_OPTIONS.filter(({ value }) => value !== 'unassigned') : STORE_OPTIONS}
        style={{ minWidth: 144 }}
        onChange={(value) => setParams(withProgressStore(params.toString(), progressStoreOf(value)))}
      />
      {view === 'current' ? <OrderScopePicker isMine={isMine} onChange={(value) => setParams(withProgressScope(params.toString(), value === 'mine'))} /> : null}
    </>
  );
  return (
    <WorkbenchPage title={viewLabels[view]}>
      {view === 'current' ? <ProgressCurrent key={JSON.stringify([store, isMine])} store={store} isMine={isMine} filters={scope} /> : (
        <Card size="small" style={{ marginBottom: space[3] }}>
          <Flex gap={space[2]} wrap align="center">{scope}</Flex>
        </Card>
      )}
      {view === 'schedule' ? <ProgressSchedule key={store} store={store} /> : null}
      {view === 'development' ? <ProductDevelopmentPanel key={store} store={store === 'unassigned' ? 'all' : store} /> : null}
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
