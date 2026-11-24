import { useState, type CSSProperties } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { Alert, Button, Flex, Typography } from 'antd';
import { ImportBatchSummarySchema, type ImportBatchSummary } from '@sw/contracts';
import { IMPORT_ACTIONS, importActionLabel } from '@sw/domain';
import { ApiError, apiErrorMessage, apiSend } from '../../shared/api/client.js';
import { useCanWrite } from '../../shared/actor.js';
import { writeUrlState } from '../../shared/hooks/url-state.js';
import {
  continuationOf,
  groupIssues,
  issueGroupText,
  type ImportContinuation,
  type ImportContinuationInput,
  type NextStep,
} from '../../features/imports/index.js';
import { decisionsWithDateDecision } from '../../features/imports/index.js';
import { WorkbenchPage } from '../../shared/ui/page.js';
import { bg, border, space } from '../../theme/tokens.js';
import { ImportBatchBanner, ImportStatusTag } from './import-batch-banner.js';
import { ImportConflictPortal } from './ImportConflictPortal.js';
import { writeImportConflictDrawer } from './import-conflict-drawer-url.js';
import { ProcurementPreview } from './ProcurementPreview.js';
import { ConfirmedArrivalPreview } from './ConfirmedArrivalPreview.js';
import { useImportBatch } from './use-import-batch.js';

export type CommitRequest =
  | { readonly kind: 'idle' }
  | { readonly kind: 'pending' }
  | { readonly kind: 'failed'; readonly message: string };

const commitBar: CSSProperties = {
  position: 'sticky',
  bottom: 0,
  background: bg.surface,
  borderTop: `1px solid ${border}`,
  padding: space[2],
};

export function ImportBatchPage() {
  const { id = '' } = useParams();
  return <ImportBatchContent key={id} id={id} />;
}

function ImportBatchContent({ id }: { readonly id: string }) {
  const [search, setSearch] = useSearchParams();
  const back = { pathname: '/imports', search: writeUrlState(search.toString(), { drawer: null }) };
  const { load, retry, setSummary } = useImportBatch(id);
  const [request, setRequest] = useState<CommitRequest>({ kind: 'idle' });
  const [reasons, setReasons] = useState<readonly string[]>([]);
  const canImport = useCanWrite('imports.write');
  const canWriteRecords = useCanWrite('records.write');
  if (load.kind !== 'ready') {
    return (
      <WorkbenchPage title="导入批次" action={<Link to={back}>返回导入中心</Link>}>
        {load.kind === 'loading' ? <p role="status">正在读取导入批次</p> : (
          <Alert type="error" title={load.message} action={<Button onClick={retry}>重试</Button>} />
        )}
      </WorkbenchPage>
    );
  }
  return (
    <ImportBatchReady
      id={id}
      back={back}
      search={search.toString()}
      setSearch={setSearch}
      summary={load.summary}
      request={request}
      setSummary={setSummary}
      setRequest={setRequest}
      reasons={reasons}
      setReasons={setReasons}
      canImport={canImport && (load.summary.template !== 'batch-confirmed-arrival-v1' || canWriteRecords)}
    />
  );
}

function ImportBatchReady(props: {
  readonly id: string;
  readonly back: { readonly pathname: string; readonly search: string };
  readonly search: string;
  readonly setSearch: ReturnType<typeof useSearchParams>[1];
  readonly summary: ImportBatchSummary;
  readonly request: CommitRequest;
  readonly setSummary: (value: ImportBatchSummary) => void;
  readonly setRequest: (value: CommitRequest) => void;
  readonly reasons: readonly string[];
  readonly setReasons: (value: readonly string[]) => void;
  readonly canImport: boolean;
}) {
  return (
    <WorkbenchPage title="导入批次" browserTitle={`导入批次 · ${props.summary.file.originalName}`} action={<Link to={props.back}>返回导入中心</Link>}>
      <Typography.Paragraph strong style={{ overflowWrap: 'anywhere' }}>{props.summary.file.originalName}</Typography.Paragraph>
      <ImportBatchBanner template={props.summary.template} createdAt={props.summary.createdAt} committedAt={props.summary.committedAt} coverage={props.summary.coverage ?? 'full_snapshot'} />
      <BatchResult summary={props.summary} />
      {props.summary.hasProcurementPreview === true ? <ProcurementPreview key={props.id} id={props.id} isFinalized={props.summary.status === 'committed' || props.summary.status === 'discarded'} /> : null}
      {props.summary.template === 'batch-confirmed-arrival-v1' ? <ConfirmedArrivalPreview key={props.id} id={props.id} revision={props.summary.revision} /> : null}
      <IssueGroups summary={props.summary} />
      <ImportBatchWrites {...props} />
      {props.reasons.length === 0 ? null : <ul>{props.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>}
      {props.summary.template === 'batch-confirmed-arrival-v1' ? null : <ImportConflictPortal id={props.id} summary={props.summary} setSummary={props.setSummary} />}
    </WorkbenchPage>
  );
}

function BatchResult({ summary }: { readonly summary: ImportBatchSummary }) {
  const actions = IMPORT_ACTIONS.filter((action) => summary.stats.byAction[action] > 0)
    .map((action) => `${importActionLabel(action)} ${summary.stats.byAction[action]} 行`);
  return (
    <Typography.Paragraph>
      <ImportStatusTag status={summary.status} /> · 共 {summary.stats.rows} 行{actions.length === 0 ? '' : ` · ${actions.join(' · ')}`}
    </Typography.Paragraph>
  );
}

function ImportBatchWrites(props: {
  readonly id: string;
  readonly search: string;
  readonly setSearch: ReturnType<typeof useSearchParams>[1];
  readonly summary: ImportBatchSummary;
  readonly request: CommitRequest;
  readonly setSummary: (value: ImportBatchSummary) => void;
  readonly setRequest: (value: CommitRequest) => void;
  readonly setReasons: (value: readonly string[]) => void;
  readonly canImport: boolean;
}) {
  const canReviewAliases = useCanWrite('master.review');
  if (!props.canImport || props.summary.procurementReplayOf !== undefined) return null;
  const isConfirmedArrival = props.summary.template === 'batch-confirmed-arrival-v1';
  return (
    <>
      {isConfirmedArrival ? (
        props.summary.unresolvedConflicts > 0 ? <Alert type="warning" title="请核对冲突行，修正或重新导出表格后再上传。" /> : null
      ) : (
        <>
          {props.summary.unresolvedConflicts > 0 ? <Button onClick={() => props.setSearch(writeImportConflictDrawer({ search: props.search, isOpen: true }))}>处理冲突（{props.summary.unresolvedConflicts}）</Button> : null}
          <Button onClick={() => { void decide({ id: props.id, revision: props.summary.revision, decisions: props.summary.decisions, setSummary: props.setSummary, setRequest: props.setRequest, setReasons: props.setReasons }); }}>按文件年份补年</Button>
        </>
      )}
      <div style={commitBar}>
        <Button danger disabled title="数据回退尚未实现，回滚暂不可用">回滚（暂不可用）</Button>
        <ImportCommitPanel summary={commitSummary(props.summary, canReviewAliases)} request={props.request} onCommit={() => { void commit({ id: props.id, revision: props.summary.revision, setSummary: props.setSummary, setRequest: props.setRequest }); }} />
      </div>
    </>
  );
}


export function ImportCommitPanel(props: {
  readonly summary: ImportContinuationInput;
  readonly request: CommitRequest;
  readonly onCommit: () => void;
}) {
  const continuation = continuationOf(props.summary);
  const { canReviewAliases, pendingAliases } = props.summary;
  return (
    <>
      <CommitAlert continuation={continuation} request={props.request} />
      {continuation.kind === 'confirm' ? (
        <ConfirmGate continuation={continuation} request={props.request} onCommit={props.onCommit} />
      ) : null}
      {continuation.kind === 'committed' && !canReviewAliases && pendingAliases > 0 ? <p>{pendingAliases} 个新主体待审核</p> : null}
      {continuation.kind === 'committed' ? <StepList steps={continuation.steps} /> : null}
    </>
  );
}

function CommitAlert(props: { readonly continuation: ImportContinuation; readonly request: CommitRequest }) {
  const message = alertText(props);
  if (message === undefined) return null;
  return <Alert type="error" title={message} />;
}

function alertText(props: { readonly continuation: ImportContinuation; readonly request: CommitRequest }): string | undefined {
  if (props.request.kind === 'failed') return props.request.message;
  if (props.continuation.kind === 'blocked') return props.continuation.message;
  return undefined;
}

function ConfirmGate(props: {
  readonly continuation: Extract<ImportContinuation, { readonly kind: 'confirm' }>;
  readonly request: CommitRequest;
  readonly onCommit: () => void;
}) {
  const isPending = props.request.kind === 'pending';
  return (
    <>
      <Flex justify="space-between" align="center" wrap gap={space[2]}>
        <Typography.Text aria-live="polite">{props.continuation.enabled ? '可以确认导入' : `还剩 ${props.continuation.remaining} 个冲突`}</Typography.Text>
        <Button
          type="primary"
          loading={isPending}
          disabled={isPending || !props.continuation.enabled}
          onClick={props.onCommit}
        >
          确认导入
        </Button>
      </Flex>
    </>
  );
}

function StepList({ steps }: { readonly steps: readonly NextStep[] }) {
  return (
    <ul>
      {steps.map((step) => (
        <li key={step.label}><Link to={step.to}>{step.label}</Link></li>
      ))}
    </ul>
  );
}

function IssueGroups({ summary }: { readonly summary: ImportBatchSummary }) {
  const groups = groupIssues(summary.issueGroups.map((group) => ({ issues: Array.from({ length: group.count }, () => ({ code: group.code })) })));
  return <ul>{groups.map((group) => <li key={group.code}>{issueGroupText(group)}</li>)}</ul>;
}

function commitSummary(summary: ImportBatchSummary, canReviewAliases: boolean): ImportContinuationInput {
  return {
    importBatchId: summary.id,
    template: summary.template,
    status: summary.status,
    pendingAliases: summary.stats.pendingAliases,
    canReviewAliases,
    unresolvedConflicts: summary.unresolvedConflicts,
    error: summary.error,
  };
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
