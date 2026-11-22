import { Alert, Button, Drawer, Skeleton, Table, type TableColumnType } from 'antd';
import type { BuyerDrillView } from '@sw/contracts';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { loadBuyerDrill, type BuyerDrillSelection } from '../../features/performance/index.js';
import { apiErrorMessage } from '../../shared/api/client.js';
import { drawerWide } from '../../theme/tokens.js';

type Load =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'ready'; readonly data: BuyerDrillView };

const pagination = { pageSize: 15, hideOnSinglePage: true, showSizeChanger: false };
const scroll = { x: 'max-content' };

export function BuyerDrillDrawer({ selection, isOpen, onClose, onHidden }: {
  readonly selection: BuyerDrillSelection;
  readonly isOpen: boolean;
  readonly onHidden: () => void;
  readonly onClose: () => void;
}) {
  const [revision, setRevision] = useState(0);
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  useEffect(() => {
    if (!isOpen) return;
    const request = new AbortController();
    void loadBuyerDrill({ selection, signal: request.signal })
      .then((data) => { if (!request.signal.aborted) setLoad({ kind: 'ready', data }); })
      .catch((error: unknown) => {
        if (!request.signal.aborted) setLoad({ kind: 'error', message: apiErrorMessage(error) ?? '明细没有载入' });
      });
    return () => request.abort();
  }, [selection, isOpen, revision]);
  const title = selection.kind === 'overdue' ? `${selection.buyerName} · 逾期批次` : '未归属开放异常';
  return (
    <Drawer title={title} size={`min(${drawerWide}px, 100vw)`} focusable={{ trap: true, focusTriggerAfterClose: true }} open={isOpen}
      onClose={onClose} afterOpenChange={(visible) => { if (!visible) onHidden(); }}>
      {load.kind === 'loading' ? <Skeleton active /> :
        load.kind === 'error' ? <Alert type="error" showIcon title={load.message} action={<Button onClick={() => {
          setLoad({ kind: 'loading' });
          setRevision((value) => value + 1);
        }}>重试</Button>} /> :
          <DrillTable data={load.data} />}
    </Drawer>
  );
}

type DrillItem = BuyerDrillView['items'][number];

const po: TableColumnType<DrillItem> = { title: '单号', render: (_value: unknown, row) => row.poRaw ?? '—' };
const product: TableColumnType<DrillItem> = { title: '品名', render: (_value: unknown, row) => row.nameRaw ?? '—' };
const followUp: TableColumnType<DrillItem> = {
  title: '跟进',
  render: (_value: unknown, row) => row.orderLineId === null ? '—' : <Link to={`/lines/${encodeURIComponent(row.orderLineId)}`}>打开订单行</Link>,
};

function DrillTable({ data }: { readonly data: BuyerDrillView }) {
  const columns: readonly TableColumnType<DrillItem>[] = data.kind === 'overdue' ? [
    po, product,
    { title: '批次', dataIndex: 'id' },
    { title: '确认到货日', render: (_value: unknown, row) => ('confirmedOn' in row ? row.confirmedOn : null) ?? '—' },
    followUp,
  ] : [
    po, product,
    { title: '异常', render: (_value: unknown, row) => 'note' in row ? <span style={{ display: 'block', maxWidth: 260, overflowWrap: 'anywhere' }}>{row.note}</span> : '—' },
    followUp,
  ];
  const unit = data.kind === 'overdue' ? '批' : '条';
  return (
    <Table<DrillItem> size="small" rowKey="id" title={() => `共 ${data.items.length} ${unit}`}
      columns={[...columns]} dataSource={data.items} pagination={pagination} scroll={scroll}
      locale={{ emptyText: data.kind === 'overdue' ? '当前没有逾期批次' : '当前没有未归属开放异常' }} />
  );
}
