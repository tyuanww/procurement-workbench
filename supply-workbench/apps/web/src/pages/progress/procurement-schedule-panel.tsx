import { useEffect, useState } from 'react';
import { Alert, Button, Select, Skeleton, Space, Typography } from 'antd';
import { Link } from 'react-router';
import type { OrderLineDetail, OrderLineRow, ProcurementStore } from '@sw/contracts';
import type { LocalDate } from '@sw/domain';
import { BuildProcurementForm, ProcurementBatchDates, ProcurementDateEvidence, ProcurementStageList, SupplierPromiseEditor } from '../../features/plan/index.js';
import { useCanWrite } from '../../shared/actor.js';
import { failureText, read, readFailureOf } from '../../shared/api/reads.js';
import { space } from '../../theme/tokens.js';
import { loadProgressLines } from './progress-load.js';
import { progressOrderRef, scopedLineLink } from './store-order.js';

type Load<T> = { readonly kind: 'loading' } | { readonly kind: 'ready'; readonly data: T } | { readonly kind: 'error'; readonly message: string };

type Selection = {
  readonly store: ProcurementStore;
  readonly selected: string | null;
  readonly onSelect: (id: string | null) => void;
  readonly search: string;
  readonly onTimelineChanged: () => void;
  readonly onAnchor: (date: LocalDate) => void;
};

export function ProcurementSchedulePanel(props: Selection) {
  const [hasOpenedPicker, setOpenedPicker] = useState(false);
  const shouldLoadLines = hasOpenedPicker || props.selected !== null;
  const lines = useScheduleResource(() => loadProgressLines({ store: props.store, isMine: false }), { key: props.store, shouldLoad: shouldLoadLines });
  const orders = lines.load.kind === 'ready' ? lines.load.data : [];
  const selected = orders.find((line) => line.id === props.selected);
  return (
    <section aria-label="成品订单排期">
      <Typography.Title level={2}>成品订单排期</Typography.Title>
      {lines.load.kind === 'error' ? <Alert type="error" title={lines.load.message} action={<Button size="small" onClick={lines.reload}>重试</Button>} /> : null}
      <Select
        aria-label="选择成品订单"
        allowClear
        showSearch={{ optionFilterProp: 'label' }}
        loading={shouldLoadLines && lines.load.kind === 'loading'}
        value={selected?.id ?? undefined}
        placeholder="按 OA、品名或 PO 查找"
        style={{ width: '100%', maxWidth: 680 }}
        options={orders.map(orderOption)}
        onOpenChange={(isOpen) => { if (isOpen) setOpenedPicker(true); }}
        onChange={(id) => props.onSelect(id ?? null)}
      />
      {selected === undefined
        ? props.selected === null || lines.load.kind !== 'ready' ? null : <Alert type="warning" title="所选订单行不在当前店铺范围" />
        : <ProcurementScheduleDetail key={selected.id} {...props} line={selected} />}
    </section>
  );
}

function orderOption(line: OrderLineRow) {
  return { value: line.id, label: [progressOrderRef(line), line.nameRaw, line.po.poRaw].filter(Boolean).join(' · ') };
}

function ProcurementScheduleDetail(props: Selection & { readonly line: OrderLineRow }) {
  const { store, line, onTimelineChanged } = props;
  const detail = useScheduleResource(() => read({ name: 'line', id: line.id, store }), { key: line.id });
  const canWrite = useCanWrite('records.write');
  if (detail.load.kind === 'loading') return <Skeleton active paragraph={{ rows: 3 }} />;
  if (detail.load.kind === 'error') return <Alert type="error" showIcon title={detail.load.message} action={<Button size="small" onClick={detail.reload}>重试</Button>} />;
  const { procurementSchedule: schedule, batches } = detail.load.data;
  const changed = () => { detail.reload(); onTimelineChanged(); };
  return (
    <Space orientation="vertical" size="middle" style={{ display: 'flex', marginTop: space[2] }}>
      <Link to={scopedLineLink(line.id, { search: props.search, store })}>成品订单行详情</Link>
      <Typography.Text>采购负责人 {line.buyer?.name ?? '未分派'}</Typography.Text>
      {schedule === undefined ? <Alert type="info" title="该订单没有可用的采购排期来源" /> : <>
        <ProcurementDateEvidence schedule={schedule} batches={batches} />
        {schedule.items.length > 0 ? <ProcurementStageList schedule={schedule} onChanged={changed} /> : canWrite && line.origin === 'import_po_master'
          ? <BuildProcurementForm schedule={schedule} orderLineId={line.id} store={store} onBuilt={(date) => { changed(); props.onAnchor(date); }} />
          : <Typography.Text type="secondary">尚未建立排期</Typography.Text>}
      </>}
      <BatchDates batches={batches} onChanged={detail.reload} />
    </Space>
  );
}

function BatchDates({ batches, onChanged }: { readonly batches: OrderLineDetail['batches']; readonly onChanged: () => void }) {
  if (batches.length === 0) return <Typography.Text type="secondary">暂无要货批次，供应商承诺和实际收货待登记。</Typography.Text>;
  return <section aria-label="批次承诺和收货">{batches.map((batch) => <div key={batch.id} style={{ marginTop: space[2] }}>
    <Typography.Text strong>批次 {batch.seq}</Typography.Text>
    <ProcurementBatchDates batch={batch} />
    <SupplierPromiseEditor key={`${batch.id}:${batch.dateSupplierPromised}`} batch={batch} onChanged={onChanged} />
  </div>)}</section>;
}

function useScheduleResource<T>(request: () => Promise<T>, { key, shouldLoad = true }: { readonly key: string; readonly shouldLoad?: boolean }) {
  const [load, setLoad] = useState<Load<T>>({ kind: 'loading' });
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!shouldLoad) return;
    let isActive = true;
    void request().then((data) => {
      if (isActive) setLoad({ kind: 'ready', data });
    }).catch((error: unknown) => {
      const failure = readFailureOf(error);
      if (isActive && failure !== null) setLoad({ kind: 'error', message: failureText(failure) });
    });
    return () => { isActive = false; };
  }, [key, revision, shouldLoad]);
  return { load, reload: () => setRevision((value) => value + 1) };
}
