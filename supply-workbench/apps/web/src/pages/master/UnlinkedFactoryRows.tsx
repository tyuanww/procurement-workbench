import { Button, Empty, Input, Space, Typography } from 'antd';
import { useId, useState } from 'react';
import { FactoryReportRowViewSchema, OrderLineDetailSchema, type FactoryReportRowView } from '@sw/contracts';
import { useCanWrite } from '../../shared/actor.js';
import { apiSend } from '../../shared/api/client.js';
import { SectionRow } from '../../shared/ui/section.js';
import { space } from '../../theme/tokens.js';
import { FactoryRowsPage, factoryRowsReader } from './FactoryRowsPage.js';
import { unlinkedRowText } from './unlinked-row-text.js';

const base = '/api/v1/factory-reports';
export const readUnlinked = factoryRowsReader(`${base}/unlinked`, FactoryReportRowViewSchema);

export type RowAction = { readonly kind: 'link' | 'create'; readonly rowKey: string };

type RowActionState = {
  readonly busy: boolean;
  readonly pending: RowAction | null;
  readonly onAction: (action: RowAction, write: () => Promise<string>) => void;
};

export function UnlinkedRows({ revision, ...actions }: RowActionState & { readonly revision: number }) {
  const id = useId();
  const [query, setQuery] = useState('');
  const [lineId, setLineId] = useState('');
  const canLink = useCanWrite('master.review');
  const canCreate = useCanWrite('records.write');
  const controls = (
    <Space wrap align="start" style={{ marginBottom: space[3] }}>
      <Space orientation="vertical" size={space[1]}>
        <label htmlFor={`${id}-filter`}>筛选本页表名或行号</label>
        <Input id={`${id}-filter`} value={query} onChange={(event) => setQuery(event.target.value)} allowClear />
      </Space>
      {canLink ? <Space orientation="vertical" size={space[1]}>
        <label htmlFor={`${id}-line`}>订单行编号</label>
        <Input id={`${id}-line`} value={lineId} onChange={(event) => setLineId(event.target.value)} />
      </Space> : null}
    </Space>
  );
  const term = query.trim();
  return (
    <FactoryRowsPage key={revision} title="当前待处理上报" read={readUnlinked} disabled={actions.busy} controls={controls}>
      {(rows) => {
        const visible = rows.filter((row) => row.sheetName.includes(term) || String(row.rowNo).includes(term));
        return <>
          {rows.length === 0 ? <Empty description="没有待处理上报。"><Button href="/imports">去导入</Button></Empty> : null}
          {rows.length > 0 && visible.length === 0 ? <Empty description="本页没有符合筛选条件的上报。" /> : null}
          {visible.map((row) => <UnlinkedRow key={`${row.kind}:${row.id}`} row={row} orderLineId={lineId.trim()}
            canLink={canLink} canCreate={canCreate} {...actions} />)}
        </>;
      }}
    </FactoryRowsPage>
  );
}

function UnlinkedRow({ row, orderLineId, canLink, canCreate, busy, pending, onAction }: RowActionState & {
  readonly row: FactoryReportRowView;
  readonly orderLineId: string;
  readonly canLink: boolean;
  readonly canCreate: boolean;
}) {
  const rowKey = `${row.kind}:${row.id}`;
  const table = tableName(row.kind);
  const operation = pending?.rowKey === rowKey ? pending.kind : null;
  return <SectionRow action={<Space wrap>
    {canLink && table !== null ? <Button loading={operation === 'link'} disabled={orderLineId === '' || busy}
      onClick={() => onAction({ kind: 'link', rowKey }, () => linkReport({ table, rowId: row.id, orderLineId }))}>挂接</Button> : null}
    {canCreate && row.kind === 'in_transit' ? <Button loading={operation === 'create'} disabled={busy}
      onClick={() => onAction({ kind: 'create', rowKey }, () => createLine(row.id))}>建成订单行</Button> : null}
  </Space>}>
    <Typography.Text>{unlinkedRowText(row)}</Typography.Text>
  </SectionRow>;
}

function tableName(kind: FactoryReportRowView['kind']) {
  if (kind === 'in_transit') return 'in-transit';
  if (kind === 'packaging_combo') return 'packaging-combo';
  if (kind === 'customer_supplied') return null;
  return kind;
}

async function linkReport(input: { readonly table: NonNullable<ReturnType<typeof tableName>>; readonly rowId: string; readonly orderLineId: string }) {
  await apiSend({ path: `${base}/${input.table}/${encodeURIComponent(input.rowId)}/link`, method: 'POST', body: { orderLineId: input.orderLineId }, schema: FactoryReportRowViewSchema });
  return '已挂接订单行。';
}

async function createLine(rowId: string) {
  await apiSend({ path: `${base}/in-transit/${encodeURIComponent(rowId)}/create-line`, method: 'POST', body: {}, schema: OrderLineDetailSchema });
  return '已从在途上报建立订单行。';
}
