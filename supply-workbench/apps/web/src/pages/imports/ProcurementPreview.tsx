import { Link } from 'react-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Collapse, Flex, Select, Table, Tag, Typography } from 'antd';
import type { TableProps } from 'antd';
import { ProcurementPreviewSelectionSchema, UNLINKED_PROCUREMENT, type ImportBatchSummary, type ProcurementPreviewSelection, type ProcurementReviewReason } from '@sw/contracts';
import { isBatchImportSource } from '../../features/imports/index.js';
import { apiErrorMessage, apiGetWithSignal } from '../../shared/api/client.js';
import { ImportSourceButton, ImportSourceDrawer, sourceText, UnavailableImportSource, type ImportSourceRecord } from './ImportSourceDrawer.js';
import { importSourceKey, importSourceQuery, useImportSource, type ImportSourceState } from './import-source.js';
import { rowSourceInOa, sourceKey, sourcePagePatch, sourcePageSizes, sourcePagination, switchPreviewOa, visibleProcurement, type ComponentRow, type FinishedSummary, type SourceTable } from './procurement-preview-model.js';

const numberFormat = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 12 });
const label = { active: '项目表', completed: '已完结表', direct: '编号关联', shared: '共用子件', group: '同 OA 分组', candidate: '仅商品码候选' } as const;
type Fact = ComponentRow['fact'];
type SelectedSource = { readonly record: ImportSourceRecord; readonly table: SourceTable; readonly page: number };

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

type Load = { readonly kind: 'ready'; readonly preview: ProcurementPreviewSelection } | { readonly kind: 'failed'; readonly message: string };

export function ProcurementPreview({ summary }: { readonly summary: ImportBatchSummary }) {
  const { id, status } = summary;
  const source = useImportSource();
  const requestedOa = source.params.get(importSourceQuery.oa);
  const oa = requestedOa === '~' ? '' : requestedOa;
  const [attempt, setAttempt] = useState(0);
  const requestKey = JSON.stringify([status, oa, attempt]);
  const [response, setResponse] = useState<{ readonly key: string; readonly load: Load }>();
  const load = response?.key === requestKey ? response.load : null;
  useEffect(() => {
    const controller = new AbortController();
    const path = `/api/v1/imports/${encodeURIComponent(id)}/procurement${oa === null ? '' : `?${new URLSearchParams({ oa })}`}`;
    void apiGetWithSignal({ path, schema: ProcurementPreviewSelectionSchema, signal: controller.signal }).then((preview) => {
      if (controller.signal.aborted) return;
      setResponse({ key: requestKey, load: preview === null ? { kind: 'failed', message: '这次导入没有可读取的关联预览' } : { kind: 'ready', preview } });
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setResponse({ key: requestKey, load: { kind: 'failed', message: apiErrorMessage(error) ?? '读取关联预览失败' } });
    });
    return () => controller.abort();
  }, [id, oa, requestKey]);
  if (load === null) return <Card title="采购事项关联预览" loading />;
  if (load.kind === 'failed') return <Card title="采购事项关联预览">
    <Alert type="error" title={load.message} action={<Button onClick={() => setAttempt((value) => value + 1)}>重试</Button>} />
  </Card>;
  return <Card title={load.preview.submission === undefined ? '采购事项关联预览' : '采购事项关联'}>
    <ProcurementSelection summary={summary} preview={load.preview} source={source} />
  </Card>;
}

function ProcurementSelection({ summary, preview, source }: {
  readonly summary: ImportBatchSummary;
  readonly preview: ProcurementPreviewSelection;
  readonly source: ImportSourceState;
}) {
  const { id } = summary;
  const options = preview.groups.map(({ oa, count }) => ({ value: oa, label: `${oa === '' ? '无 OA 主号' : oa === UNLINKED_PROCUREMENT ? '无成品关联的子件' : oa}（${count} 条）` }));
  const current = useMemo(() => visibleProcurement(preview), [preview]);
  const isCommitted = summary.status === 'committed' && preview.submission?.originalBatchId === id;
  const selected = selectedRecord({ current, key: source.sourceKey, summary, isCommitted });
  const patch = sourcePagePatch({ params: source.params, selected, isUnlinked: preview.oa === UNLINKED_PROCUREMENT });
  useEffect(() => {
    if (patch !== null) source.update(patch, true);
  }, [patch, source]);
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
            onChange={(oa) => switchPreviewOa(source, oa)}
            options={options}
            style={{ width: 245, maxWidth: '100%' }}
          />
          <Typography.Text>成品 {current.rows.length} 条 · 总表 PO {current.poCount} 个</Typography.Text>
        </Flex>
        <SelectionTables isUnlinked={preview.oa === UNLINKED_PROCUREMENT} current={current} hasSubmission={preview.submission !== undefined} source={rowSourceInOa(source, preview.oa)} />
        {selected === null && hasRowSource(source.sourceKey) ? <UnavailableImportSource onClear={source.close} /> : null}
        <ImportSourceDrawer source={source} record={patch === null ? selected?.record ?? null : null} fileName={summary.file.originalName} />
    </Flex>
  );
}

function SelectionTables({ isUnlinked, current, hasSubmission, source }: {
  readonly isUnlinked: boolean;
  readonly current: ReturnType<typeof visibleProcurement>;
  readonly hasSubmission: boolean;
  readonly source: ImportSourceState;
}) {
  if (isUnlinked) return <Components rows={current.candidates} hasSubmission={hasSubmission} kind="candidate" source={source} />;
  return (
    <>
        <Table<FinishedSummary>
          aria-label="总表成品明细"
          dataSource={current.rows}
          columns={finishedColumns(source)}
          rowKey={(row) => sourceKey(row.source)}
          pagination={sourcePagination({ source, table: 'finished' })}
          scroll={{ x: 820 }}
          size="small"
        />
        <Typography.Text strong>关联子件（{current.related.length}）</Typography.Text>
        <Components rows={current.related} hasSubmission={hasSubmission} kind="component" source={source} />
        {current.candidates.length === 0 ? null : (
          <Collapse activeKey={source.params.has('candidates') ? ['candidates'] : []}
            onChange={(keys) => source.update({ candidates: keys.includes('candidates') ? '1' : null }, true)} items={[{
            key: 'candidates',
            label: `待核对的子件（${current.candidates.length}）`,
            children: <Components rows={current.candidates} hasSubmission={hasSubmission} kind="candidate" source={source} />,
          }]} />
        )}
    </>
  );
}

function Components({ rows, hasSubmission, source, kind }: {
  readonly rows: readonly ComponentRow[];
  readonly hasSubmission: boolean;
  readonly source: ImportSourceState;
  readonly kind: 'component' | 'candidate';
}) {
  const columns = componentColumns(source, kind);
  return (
    <Table<ComponentRow>
      aria-label="采购子件明细"
      dataSource={rows}
      columns={hasSubmission ? columns : columns.filter((column) => column.key !== 'submission')}
      rowKey={(row) => sourceKey(row.fact.source)}
      pagination={sourcePagination({ source, table: kind })}
      locale={{ emptyText: '没有表内关联子件' }}
      scroll={{ x: 1150 }}
      size="small"
    />
  );
}

function finishedColumns(source: ImportSourceState): NonNullable<TableProps<FinishedSummary>['columns']> {
  return [
  { title: '成品', key: 'name', render: (_, row) => <SourceCell source={source} kind="finished" location={row.source} primary={row.productNameRaw} note={row.productCodeRaw} po={row.poRaw} /> },
  { title: 'OA 原文', key: 'oa', render: (_, row) => row.oaRaw ?? '未填' },
  { title: '总表 PO', key: 'po', render: (_, row) => row.poRaw ?? '未填' },
  { title: '下单量', key: 'quantity', align: 'right', render: (_, row) => quantityOf(row.quantity) },
  { title: '子件来源', key: 'status', render: (_, row) => row.statuses.length === 0 ? '待核对' : row.statuses.map((item) => <Tag key={item}>{label[item]}</Tag>) },
  { title: '总表位置', key: 'source', render: (_, row) => sourceText(row.source) },
  ];
}

function componentColumns(source: ImportSourceState, kind: 'component' | 'candidate'): NonNullable<TableProps<ComponentRow>['columns']> {
  return [
  { title: '子件', key: 'name', render: (_, { fact }) => <SourceCell source={source} kind={kind} location={fact.source} primary={fact.componentNameRaw} note={fact.componentCodeRaw} po={fact.poRaw} /> },
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
    return '已关联采购事项';
  } },
  { title: '表内位置和依据', key: 'evidence', render: (_, { fact }) => <ComponentEvidence fact={fact} /> },
  ];
}

function SourceCell({ source, kind, location, primary, note, po }: {
  readonly source: ImportSourceState;
  readonly kind: 'finished' | 'component' | 'candidate';
  readonly location: FinishedSummary['source'];
  readonly primary: string | null;
  readonly note: string | null;
  readonly po: string | null;
}) {
  const target = [po, primary, note, sourceText(location)].filter(Boolean).join(' · ');
  return <Flex vertical align="start" gap="small">
    <TwoLines primary={primary} note={note} />
    <ImportSourceButton source={source} recordKey={importSourceKey(kind, location)} label={`查看来源 ${target}`} />
  </Flex>;
}

function hasRowSource(key: string | null) {
  return key !== null && !isBatchImportSource(key);
}

function selectedRecord({ current, key, summary, isCommitted }: {
  readonly current: ReturnType<typeof visibleProcurement>;
  readonly key: string | null;
  readonly summary: ImportBatchSummary;
  readonly isCommitted: boolean;
}): SelectedSource | null {
  if (key === null) return null;
  const finishedIndex = current.rows.findIndex((row) => importSourceKey('finished', row.source) === key);
  const finished = current.rows[finishedIndex];
  if (finished !== undefined) return onSourcePage({ table: 'finished', index: finishedIndex, record: finishedRecord({ key, row: finished, importId: summary.id, isCommitted }) });
  const relatedIndex = current.related.findIndex((row) => importSourceKey('component', row.fact.source) === key);
  const related = current.related[relatedIndex];
  if (related !== undefined) return onSourcePage({ table: 'component', index: relatedIndex, record: componentRecord({ key, row: related, importId: summary.id, canFollow: isCommitted }) });
  const candidateIndex = current.candidates.findIndex((row) => importSourceKey('candidate', row.fact.source) === key);
  const candidate = current.candidates[candidateIndex];
  if (candidate === undefined) return null;
  return onSourcePage({ table: 'candidate', index: candidateIndex, record: componentRecord({ key, row: candidate, importId: summary.id, canFollow: false }) });
}

function onSourcePage({ table, index, record }: Omit<SelectedSource, 'page'> & { readonly index: number }): SelectedSource {
  return { record, table, page: Math.floor(index / sourcePageSizes[table]) + 1 };
}

function finishedRecord({ key, row, importId, isCommitted }: {
  readonly key: string;
  readonly row: FinishedSummary;
  readonly importId: string;
  readonly isCommitted: boolean;
}): ImportSourceRecord {
  const localText = isCommitted ? '这行没有已确认的关联订单。' : '这条记录仅供当前导入核对。';
  return {
    key, location: row.source,
    items: [
      { key: 'name', label: '成品', children: <TwoLines primary={row.productNameRaw} note={row.productCodeRaw} /> },
      { key: 'oa', label: 'OA 原文', children: row.oaRaw ?? '未填' },
      { key: 'po', label: '总表 PO', children: row.poRaw ?? '未填' },
    ],
    result: isCommitted && row.orderLineId !== undefined
      ? { kind: 'order', importId, lineId: row.orderLineId }
      : { kind: 'local', text: localText },
  };
}

function componentRecord({ key, row, importId, canFollow }: {
  readonly key: string;
  readonly row: ComponentRow;
  readonly importId: string;
  readonly canFollow: boolean;
}): ImportSourceRecord {
  const { fact, observation } = row;
  const reasons = observation?.reasons.map((reason) => reviewText[reason]).join('。');
  return {
    key, location: fact.source,
    items: [
      { key: 'name', label: '子件', children: <TwoLines primary={fact.componentNameRaw} note={fact.componentCodeRaw} /> },
      { key: 'po', label: '子件 PO', children: fact.poRaw ?? '未填' },
      { key: 'status', label: '来源表状态', children: label[fact.status] },
      { key: 'raw', label: '表内关联依据', children: <ComponentEvidence fact={fact} showPosition={false} /> },
    ],
    result: canFollow && fact.status === 'active' && observation?.materialLineId
      ? { kind: 'order', importId, lineId: observation.materialLineId }
      : { kind: 'local', text: reasons || '这条记录仅供当前导入核对。' },
  };
}

function ComponentEvidence({ fact, showPosition = true }: { readonly fact: Fact; readonly showPosition?: boolean }) {
  return (
    <Flex vertical>
      {showPosition ? <Typography.Text>{sourceText(fact.source)} · {label[fact.status]}</Typography.Text> : null}
      <Typography.Text type="secondary">OA {fact.oa.raw ?? '未填'}{rangeText(fact.oa.source)}</Typography.Text>
      <Typography.Text type="secondary">商品码 {fact.productCodes.raw ?? '未填'}{rangeText(fact.productCodes.source)}</Typography.Text>
    </Flex>
  );
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
