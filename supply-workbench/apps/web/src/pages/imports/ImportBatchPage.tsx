import { useState } from 'react';
import { Link, useLocation, useParams, useSearchParams } from 'react-router';
import { Alert, Button, Descriptions, Flex, Typography } from 'antd';
import { ImportBatchSummarySchema, ProcurementStoreSchema, type ImportBatchSummary } from '@sw/contracts';
import { IMPORT_ACTIONS, importActionLabel, importStatusLabel, templateIdLabel } from '@sw/domain';
import { ApiError, apiErrorMessage, apiSend } from '../../shared/api/client.js';
import { useCanWrite } from '../../shared/actor.js';
import { detailReturnState } from '../../shared/hooks/detail-return-focus.js';
import { writeUrlState } from '../../shared/hooks/url-state.js';
import { BATCH_IMPORT_SOURCE, decisionsWithDateDecision, issueGroupText, PROCUREMENT_BATCH_IMPORT_SOURCE } from '../../features/imports/index.js';
import { WorkbenchPage } from '../../shared/ui/page.js';
import { SectionGroup } from '../../shared/ui/section.js';
import { space } from '../../theme/tokens.js';
import { ImportBatchBanner, ImportStatusTag } from './import-batch-banner.js';
import { ImportConflictPortal } from './ImportConflictPortal.js';
import { commitSummary, ImportCommitPanel, type CommitRequest } from './import-commit-panel.js';
import { readImportConflictDrawer, writeImportConflictDrawer } from './import-conflict-drawer-url.js';
import { ProcurementPreview } from './ProcurementPreview.js';
import { ConfirmedArrivalPreview } from './ConfirmedArrivalPreview.js';
import { useImportBatch } from './use-import-batch.js';
import { ImportWorkflow } from './import-workflow.js';
import { ImportSourceButton, ImportSourceDrawer } from './ImportSourceDrawer.js';
import { importBatchOrigin, importPreviewKeys, useImportSource } from './import-source.js';

export function ImportBatchPage() {
  const { id = '' } = useParams();
  return <ImportBatchContent key={id} id={id} />;
}

function ImportBatchContent({ id }: { readonly id: string }) {
  const { pathname, state } = useLocation();
  const [search, setParams] = useSearchParams();
  const backSearch = writeUrlState(search.toString(), importPreviewKeys);
  const origin = importBatchOrigin(state);
  const returnFocus = detailReturnState(origin, pathname);
  const productOrigin = typeof origin === 'object' && origin !== null && 'productOrigin' in origin ? origin.productOrigin : undefined;
  const returnState = productOrigin === undefined ? returnFocus : { ...returnFocus, productOrigin };
  const back = <Link to={{ pathname: '/imports', search: backSearch }} state={returnState}>返回导入中心</Link>;
  const { load, retry, setSummary } = useImportBatch(id);
  const [request, setRequest] = useState<CommitRequest>({ kind: 'idle' });
  const [reasons, setReasons] = useState<readonly string[]>([]);
  const canImport = useCanWrite('imports.write');
  const canWriteRecords = useCanWrite('records.write');
  const browserTitle = load.kind === 'ready' ? `导入批次 · ${load.summary.file.originalName}` : '导入批次';
  return (
    <WorkbenchPage title="导入批次" browserTitle={browserTitle} action={back}>
      {load.kind === 'ready' ? <ImportBatchReady
        id={id}
        search={search.toString()}
        setSearch={(value) => setParams(value, { state })}
        summary={load.summary}
        request={request}
        setSummary={setSummary}
        setRequest={setRequest}
        reasons={reasons}
        setReasons={setReasons}
        canImport={canImport && (load.summary.template !== 'batch-confirmed-arrival-v1' || canWriteRecords)}
      /> : load.kind === 'loading' ? <p role="status">正在读取导入批次</p> : (
        <Alert type="error" title={load.message} action={<Button onClick={retry}>重试</Button>} />
      )}
    </WorkbenchPage>
  );
}

type ImportBatchReadyProps = {
  readonly id: string;
  readonly search: string;
  readonly setSearch: (value: URLSearchParams) => void;
  readonly summary: ImportBatchSummary;
  readonly request: CommitRequest;
  readonly setSummary: (value: ImportBatchSummary) => void;
  readonly setRequest: (value: CommitRequest) => void;
  readonly reasons: readonly string[];
  readonly setReasons: (value: readonly string[]) => void;
  readonly canImport: boolean;
};

function ImportBatchReady(props: ImportBatchReadyProps) {
  const { id, summary } = props;
  const canReviewAliases = useCanWrite('master.review');
  const isArrival = summary.template === 'batch-confirmed-arrival-v1';
  const isReplay = summary.procurementReplayOf !== undefined;
  const canEdit = props.canImport && summary.status === 'parsed' && !isReplay;
  return (
    <>
      <ImportWorkflow stage={summary.status} />
      <Flex vertical gap={space[3]}>
        <BatchOverview summary={summary} />
        {summary.hasProcurementPreview === true ? <ProcurementPreview key={id} summary={summary} /> : null}
        {isArrival ? <ConfirmedArrivalPreview key={id} summary={summary} /> : null}
        <ImportBatchReview {...props} canEdit={canEdit} canReviewAliases={canReviewAliases} />
        {summary.status === 'parsed' || isReplay ? null :
          <ImportBatchReceipt summary={summary} request={props.request} canReviewAliases={canReviewAliases} />}
      </Flex>
      {canEdit && !isArrival ? <ImportConflictPortal id={id} summary={summary} setSummary={props.setSummary}
        isOpen={readImportConflictDrawer(props.search)}
        onClose={() => props.setSearch(writeImportConflictDrawer({ search: props.search, isOpen: false }))} /> : null}
    </>
  );
}

function BatchOverview({ summary }: { readonly summary: ImportBatchSummary }) {
  return (
    <div>
      <Descriptions size="small" column={{ xs: 1, sm: 2 }} styles={{ content: { overflowWrap: 'anywhere' } }}
        items={[
          { key: 'file', label: '文件', children: <Typography.Text strong>{summary.file.originalName}</Typography.Text> },
          ...(summary.factoryParty === null ? [] : [{ key: 'factory', label: '代工厂', children: summary.factoryParty.displayName }]),
        ]} />
      <ImportBatchBanner template={summary.template} createdAt={summary.createdAt} committedAt={summary.committedAt} coverage={summary.coverage ?? 'full_snapshot'} />
      <BatchResult summary={summary} />
      {summary.status === 'failed' ? <Alert type="error" showIcon title="解析失败" description={summary.error || undefined} /> : null}
    </div>
  );
}

function ImportBatchReceipt({ summary, request, canReviewAliases }: {
  readonly summary: ImportBatchSummary;
  readonly request: CommitRequest;
  readonly canReviewAliases: boolean;
}) {
  if (summary.status === 'failed') return null;
  const hasOrderSource = summary.status === 'committed' && ['po-master-v1', 'factory-progress-v1'].includes(summary.template);
  return <SectionGroup title="提交结果">
    <ImportCommitPanel summary={commitSummary(summary, canReviewAliases)} request={request} />
    {hasOrderSource ? <CommittedImportSource summary={summary} /> : null}
  </SectionGroup>;
}

function CommittedImportSource({ summary }: { readonly summary: ImportBatchSummary }) {
  const source = useImportSource();
  const isFactory = summary.template === 'factory-progress-v1';
  const batchSource = isFactory ? BATCH_IMPORT_SOURCE : PROCUREMENT_BATCH_IMPORT_SOURCE;
  const recordKey = source.sourceKey;
  const isBatch = recordKey === batchSource || (!isFactory && recordKey === BATCH_IMPORT_SOURCE);
  const store = isFactory ? ProcurementStoreSchema.safeParse(source.params.get('store')).data : undefined;
  return <>
    <ImportSourceButton source={source} recordKey={batchSource} />
    <ImportSourceDrawer source={source} fileName={summary.file.originalName} record={isBatch ? {
      key: recordKey,
      items: [
        { key: 'status', label: '导入状态', children: importStatusLabel(summary.status) },
        { key: 'id', label: '导入批次 ID', children: summary.id },
        { key: 'template', label: '导入模板', children: templateIdLabel(summary.template) },
        ...(summary.factoryParty === null ? [] : [{ key: 'factory', label: '代工厂', children: summary.factoryParty.displayName }]),
      ],
      result: { kind: 'scope', importId: summary.id, ...(store === undefined ? {} : { store }) },
    } : null} />
  </>;
}

function BatchResult({ summary }: { readonly summary: ImportBatchSummary }) {
  const actions = IMPORT_ACTIONS.filter((action) => summary.stats.byAction[action] > 0)
    .map((action) => `${importActionLabel(action)} ${summary.stats.byAction[action]} 行`);
  return (
    <Typography.Paragraph role="status">
      <ImportStatusTag status={summary.status} /> · 共 {summary.stats.rows} 行{actions.length === 0 ? '' : ` · ${actions.join(' · ')}`}
    </Typography.Paragraph>
  );
}

function ImportBatchReview({ canEdit, canReviewAliases, summary, ...props }: ImportBatchReadyProps & {
  readonly canEdit: boolean;
  readonly canReviewAliases: boolean;
}) {
  const [isDeciding, setDeciding] = useState(false);
  const isBusy = isDeciding || props.request.kind === 'pending';
  const hasConflicts = summary.unresolvedConflicts > 0;
  const save = { id: props.id, revision: summary.revision, setSummary: props.setSummary, setRequest: props.setRequest };
  return (
    <>
      {summary.issueGroups.length === 0 && !hasConflicts ? null : <SectionGroup title="导入问题">
        <Flex vertical gap={space[2]} align="start">
          <IssueGroups summary={summary} canEdit={canEdit} isDeciding={isDeciding} isBusy={isBusy} onDecide={() => {
            setDeciding(true);
            void decide({ ...save, decisions: summary.decisions, setReasons: props.setReasons }).finally(() => setDeciding(false));
          }} />
          {props.reasons.map((reason) => <Alert key={reason} type="error" title={reason} />)}
          {hasConflicts && summary.template === 'batch-confirmed-arrival-v1' ? <Alert type="warning" title="请核对冲突行，修正或重新导出表格后再上传。" /> : null}
          {canEdit && hasConflicts && summary.template !== 'batch-confirmed-arrival-v1' ? <Button type="primary" disabled={isBusy}
            onClick={() => props.setSearch(writeImportConflictDrawer({ search: props.search, isOpen: true }))}>处理冲突（{summary.unresolvedConflicts}）</Button> : null}
        </Flex>
      </SectionGroup>}
      {canEdit ? <SectionGroup title="提交导入">
        <ImportCommitPanel summary={commitSummary(summary, canReviewAliases)} request={props.request} disabled={isDeciding} onCommit={() => { void commit(save); }} />
      </SectionGroup> : null}
    </>
  );
}


function IssueGroups({ summary, canEdit, isDeciding, isBusy, onDecide }: {
  readonly summary: ImportBatchSummary;
  readonly canEdit: boolean;
  readonly isDeciding: boolean;
  readonly isBusy: boolean;
  readonly onDecide: () => void;
}) {
  if (summary.issueGroups.length === 0) return null;
  const isRecorded = summary.decisions.issueDecisions.DATE_NO_YEAR === 'fill_file_year';
  return <ul style={{ margin: 0, paddingInlineStart: space[3] }}>{summary.issueGroups.map((group) => (
    <li key={group.code}>
      {issueGroupText(group)}
      {group.code === 'DATE_NO_YEAR' && isRecorded ? <Typography.Text type="secondary"> · 已记录按文件年份补年</Typography.Text> : null}
      {canEdit && summary.template === 'po-master-v1' && group.code === 'DATE_NO_YEAR' && group.availableDecisions.includes('fill_file_year') && !isRecorded ? (
        <Flex gap={space[1]} align="center" wrap style={{ marginBlock: space[1] }}>
          <Button loading={isDeciding} disabled={isBusy} onClick={onDecide}>记录补年选择</Button>
          <Typography.Text type="secondary">已解析日期以预览为准。</Typography.Text>
        </Flex>
      ) : null}
    </li>
  ))}</ul>;
}

async function decide(input: {
  readonly id: string;
  readonly revision: number;
  readonly decisions: ImportBatchSummary['decisions'];
  readonly setSummary: (value: ImportBatchSummary) => void;
  readonly setRequest: (value: CommitRequest) => void;
  readonly setReasons: (value: readonly string[]) => void;
}) {
  try {
    const summary = await apiSend({
      path: `/api/v1/imports/${input.id}/decisions`,
      method: 'PUT',
      body: { ...decisionsWithDateDecision({ decisions: input.decisions, choice: 'fill_file_year' }), expectedRevision: input.revision },
      headers: { 'Idempotency-Key': `decide:${input.id}:${input.revision}` },
      schema: ImportBatchSummarySchema,
    });
    applySummary({ summary, setSummary: input.setSummary, setRequest: input.setRequest });
    input.setReasons([]);
  } catch (error) {
    const message = apiErrorMessage(error);
    if (message === undefined) throw error;
    input.setReasons([message]);
  }
}

export function commitFailureText(error: unknown): string | undefined {
  const state = error instanceof ApiError ? detailState(error.details) : undefined;
  if (state === 'ARRIVAL_CONFIRM_DATE_CHANGED') {
    return '工作台确认日已变更。请重新导出并核对后再提交。';
  }
  if (state === 'ARRIVAL_BATCH_RECEIVER_CHANGED') {
    return '该批次的收货方已变更。请重新导出并核对后再提交。';
  }
  if (state === 'ARRIVAL_BATCH_IDENTITY_CHANGED') {
    return '批次 ID 与订单行或批次序号不符。请重新导出并核对后再提交。';
  }
  if (state === 'ARRIVAL_BATCH_NOT_EDITABLE') {
    return '该批次已关闭或取消。请重新导出并核对。';
  }
  if (state === 'ARRIVAL_BATCH_NOT_FOUND') {
    return '要货批次已不存在。请重新导出并核对。';
  }
  if (state === 'po_master_preview') {
    return '成品来源已被另一批更新。请重新上传文件并核对后再提交。';
  }
  if (state === 'candidate_key') {
    return '候选键已被另一批提交占用。请重新比对后再提交。';
  }
  return apiErrorMessage(error);
}

function detailState(details: unknown): string | undefined {
  if (typeof details !== 'object' || details === null || !('state' in details)) return undefined;
  return typeof details.state === 'string' ? details.state : undefined;
}

async function commit(input: {
  readonly id: string;
  readonly revision: number;
  readonly setSummary: (value: ImportBatchSummary) => void;
  readonly setRequest: (value: CommitRequest) => void;
}) {
  input.setRequest({ kind: 'pending' });
  try {
    applySummary({
      summary: await apiSend({ path: `/api/v1/imports/${input.id}/commit`, method: 'POST', body: { expectedRevision: input.revision }, headers: { 'Idempotency-Key': `commit:${input.id}:${input.revision}` }, schema: ImportBatchSummarySchema }),
      setSummary: input.setSummary,
      setRequest: input.setRequest,
    });
  } catch (error) {
    const message = commitFailureText(error);
    if (message === undefined) throw error;
    input.setRequest({ kind: 'failed', message });
  }
}

function applySummary(input: {
  readonly summary: ImportBatchSummary;
  readonly setSummary: (value: ImportBatchSummary) => void;
  readonly setRequest: (value: CommitRequest) => void;
}) {
  input.setSummary(input.summary);
  input.setRequest({ kind: 'idle' });
}
