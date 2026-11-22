import { Link } from 'react-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Collapse, Flex, Select, Table, Tag, Typography } from 'antd';
import type { TableProps } from 'antd';
import { ProcurementPreviewSelectionSchema, UNLINKED_PROCUREMENT, type ProcurementPreviewSelection, type ProcurementReviewReason } from '@sw/contracts';
import { apiErrorMessage, apiGet } from '../../shared/api/client.js';
import { sourceKey, visibleProcurement, type ComponentRow, type FinishedSummary } from './procurement-preview-model.js';

const numberFormat = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 12 });
const label = { active: '项目表', completed: '已完结表', direct: '编号关联', shared: '共用子件', group: '同 OA 分组', candidate: '仅商品码候选' } as const;
type Fact = ComponentRow['fact'];

const reviewText: Record<ProcurementReviewReason, string> = {
  quantity_unit_conflict: '采购单位冲突，待核对',
  missing_po: '子件 PO 未填',
  invalid_po: '子件 PO 需核对',
  invalid_component_code: '缺少可识别的完整子件码',
  duplicate_identity: '同一 PO 和子件码有多条明细',
  supplier_conflict: '供应商信息冲突',
  unresolved_history: '历史身份待核对',
  no_confirmed_finished_line: '缺少已确认的成品关联',
};

type Load = { readonly kind: 'loading' } | { readonly kind: 'ready'; readonly preview: ProcurementPreviewSelection } | { readonly kind: 'failed'; readonly message: string };

export function ProcurementPreview({ id, isFinalized }: { readonly id: string; readonly isFinalized: boolean }) {
  const [request, setRequest] = useState<{ readonly oa?: string }>({});
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  useEffect(() => {
    let isActive = true;
    const path = `/api/v1/imports/${id}/procurement${request.oa === undefined ? '' : `?oa=${encodeURIComponent(request.oa)}`}`;
    void apiGet(path, ProcurementPreviewSelectionSchema).then((preview) => {
      if (!isActive) return;
      setLoad(preview === null ? { kind: 'failed', message: '这次导入没有可读取的关联预览' } : { kind: 'ready', preview });
    }).catch((error: unknown) => {
      if (isActive) setLoad({ kind: 'failed', message: apiErrorMessage(error) ?? '读取关联预览失败' });
    });
    return () => { isActive = false; };
  }, [id, isFinalized, request]);
  const refresh = (next: typeof request) => { setLoad({ kind: 'loading' }); setRequest({ ...next }); };
  return (
    <Card title={load.kind === 'ready' && load.preview.submission !== undefined ? "采购事项关联" : "采购事项关联预览"} loading={load.kind === 'loading'}>
      {load.kind === 'ready' ? <ProcurementSelection id={id} preview={load.preview} select={(oa) => refresh({ oa })} /> : null}
      {load.kind === 'failed' ? <Alert type="error" title={load.message} action={<Button onClick={() => refresh(request)}>重试</Button>} /> : null}
    </Card>
  );
}

function ProcurementSelection({ id, preview, select }: { readonly id: string; readonly preview: ProcurementPreviewSelection; readonly select: (oa: string) => void }) {
  const options = preview.groups.map(({ oa, count }) => ({ value: oa, label: `${oa === '' ? '无 OA 主号' : oa === UNLINKED_PROCUREMENT ? '无成品关联的子件' : oa}（${count} 条）` }));
  const current = useMemo(() => visibleProcurement(preview), [preview]);
  return (
    <Flex vertical gap="middle">
        {preview.submission !== undefined && preview.submission.originalBatchId !== id
          ? <Alert title={<Link to={`/imports/${encodeURIComponent(preview.submission.originalBatchId)}`}>这份文件已提交，查看原导入批次</Link>} type="info" />
          : null}
        <Flex gap="middle" align="center" wrap>
          <Select<string>
            aria-label="OA 需求编号"
            showSearch={{ optionFilterProp: 'label' }}
            value={preview.oa}
            onChange={select}
            options={options}
            style={{ minWidth: 245 }}
          />
          <Typography.Text>成品 {current.rows.length} 条 · 总表 PO {current.poCount} 个</Typography.Text>
        </Flex>
        <SelectionTables isUnlinked={preview.oa === UNLINKED_PROCUREMENT} current={current} isCommitted={preview.submission !== undefined} />
    </Flex>
  );
}

function SelectionTables({ isUnlinked, current, isCommitted }: { readonly isUnlinked: boolean; readonly current: ReturnType<typeof visibleProcurement>; readonly isCommitted: boolean }) {
  if (isUnlinked) return <Components rows={current.candidates} isCommitted={isCommitted} />;
  return (
    <>
        <Table<FinishedSummary>
          aria-label="总表成品明细"
          dataSource={current.rows}
          columns={finishedColumns}
          rowKey={(row) => sourceKey(row.source)}
          pagination={{ pageSize: 12, hideOnSinglePage: true }}
          scroll={{ x: 820 }}
          size="small"
        />
        <Typography.Text strong>关联子件（{current.related.length}）</Typography.Text>
        <Components rows={current.related} isCommitted={isCommitted} />
        {current.candidates.length === 0 ? null : (
          <Collapse items={[{
            key: 'candidates',
            label: `待核对的子件（${current.candidates.length}）`,
            children: <Components rows={current.candidates} isCommitted={isCommitted} />,
          }]} />
        )}
    </>
  );
}

function Components({ rows, isCommitted }: { readonly rows: readonly ComponentRow[]; readonly isCommitted: boolean }) {
  return (
    <Table<ComponentRow>
      aria-label="采购子件明细"
      dataSource={rows}
      columns={isCommitted ? componentColumns : componentColumns.filter((column) => column.key !== 'submission')}
      rowKey={(row) => sourceKey(row.fact.source)}
      pagination={{ pageSize: 16, hideOnSinglePage: true }}
      locale={{ emptyText: '没有表内关联子件' }}
      scroll={{ x: 1150 }}
      size="small"
    />
  );
}

const finishedColumns: NonNullable<TableProps<FinishedSummary>['columns']> = [
  { title: '成品', key: 'name', render: (_, row) => row.orderLineId === undefined
    ? <TwoLines primary={row.productNameRaw} note={row.productCodeRaw} />
    : <Link to={`/lines/${encodeURIComponent(row.orderLineId)}`}>{row.productNameRaw ?? row.productCodeRaw ?? '打开成品'}</Link> },
  { title: 'OA 原文', key: 'oa', render: (_, row) => row.oaRaw ?? '未填' },
  { title: '总表 PO', key: 'po', render: (_, row) => row.poRaw ?? '未填' },
  { title: '下单量', key: 'quantity', align: 'right', render: (_, row) => quantityOf(row.quantity) },
  { title: '子件来源', key: 'status', render: (_, row) => row.statuses.length === 0 ? '待核对' : row.statuses.map((item) => <Tag key={item}>{label[item]}</Tag>) },
  { title: '总表位置', key: 'source', render: (_, row) => sourceText(row.source) },
];

const componentColumns: NonNullable<TableProps<ComponentRow>['columns']> = [
  { title: '子件', key: 'name', render: (_, { fact }) => <TwoLines primary={fact.componentNameRaw} note={fact.componentCodeRaw} /> },
  { title: '子件 PO', key: 'po', render: (_, { fact }) => fact.poRaw ?? '未填' },
  { title: '采购量', key: 'quantity', render: (_, { fact }) => (
    <Flex vertical>
      {[quantityOf(fact.quantity, fact.quantityRaw), fact.unitRaw].filter(Boolean).join(' ')}
      {fact.quantityUnitConflict === true ? <Tag>{reviewText.quantity_unit_conflict}</Tag> : null}
    </Flex>
  ) },
  { title: '供应商 / 采购员', key: 'contacts', render: (_, { fact }) => <TwoLines primary={fact.supplierRaw ?? '供应商未填'} note={fact.buyerRaw ?? '采购员未填'} /> },
  { title: '关联成品', key: 'matches', render: (_, { matches }) => (
    <Flex vertical gap="small">
      {matches.map(({ row, kind }) => (
        <div key={sourceKey(row.source)}>
          <Tag>{label[kind]}</Tag>
          {row.productNameRaw ?? row.productCodeRaw ?? '成品名称未填'}（第 {row.source.rowNo} 行）
        </div>
      ))}
    </Flex>
  ) },
  { title: '提交结果', key: 'submission', render: (_, { observation }) => {
    if (observation === undefined) return null;
    if (observation.materialLineId === null) return observation.reasons.map((reason) => <Tag key={reason}>{reviewText[reason]}</Tag>);
    return <Link to={`/lines/${encodeURIComponent(observation.materialLineId)}`}>打开采购事项</Link>;
  } },
  { title: '表内位置和依据', key: 'evidence', render: (_, { fact }) => <ComponentEvidence fact={fact} /> },
];

function ComponentEvidence({ fact }: { readonly fact: Fact }) {
  return (
    <Flex vertical>
      <Typography.Text>{sourceText(fact.source)} · {label[fact.status]}</Typography.Text>
      <Typography.Text type="secondary">OA {fact.oa.raw ?? '未填'}{rangeText(fact.oa.source)}</Typography.Text>
      <Typography.Text type="secondary">商品码 {fact.productCodes.raw ?? '未填'}{rangeText(fact.productCodes.source)}</Typography.Text>
    </Flex>
  );
}

function sourceText(source: FinishedSummary['source']) {
  return `${source.sheetName} 第 ${source.rowNo} 行`;
}

function rangeText(source: Fact['oa']['source']) {
  if (source?.range == null) return '';
  const { startRow, endRow, startColumn, endColumn } = source.range;
  return `（合并格 ${columnLetters(startColumn)}${startRow}:${columnLetters(endColumn)}${endRow}）`;
}

function columnLetters(column: number) {
  let letters = '';
  for (let next = column; next > 0; next = Math.floor((next - 1) / 26)) {
    letters = String.fromCharCode(65 + (next - 1) % 26) + letters;
  }
  return letters;
}

function TwoLines({ primary, note }: { readonly primary: string | null; readonly note: string | null }) {
  return (
    <Flex vertical>
      <Typography.Text>{primary ?? '未填'}</Typography.Text>
      {note === null ? null : <Typography.Text type="secondary">{note}</Typography.Text>}
    </Flex>
  );
}

function quantityOf(quantity: number | null, raw?: string | null) {
  return quantity === null ? raw ?? '未填' : numberFormat.format(quantity);
}
