import { Alert, Button, Flex, Typography } from 'antd';
import { Link } from 'react-router';
import type { ImportBatchSummary } from '@sw/contracts';
import { continuationOf, type ImportContinuation, type ImportContinuationInput, type NextStep } from '../../features/imports/index.js';
import { space } from '../../theme/tokens.js';

export type CommitRequest =
  | { readonly kind: 'idle' }
  | { readonly kind: 'pending' }
  | { readonly kind: 'failed'; readonly message: string };

export function ImportCommitPanel(props: {
  readonly summary: ImportContinuationInput;
  readonly request: CommitRequest;
  readonly disabled?: boolean;
  readonly onCommit?: () => void;
}) {
  const continuation = continuationOf(props.summary);
  const { canReviewAliases, pendingAliases } = props.summary;
  return (
    <>
      <CommitAlert continuation={continuation} request={props.request} />
      {continuation.kind === 'confirm' && props.onCommit !== undefined ? (
        <ConfirmGate continuation={continuation} request={props.request} disabled={props.disabled === true} onCommit={props.onCommit} />
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
  readonly disabled: boolean;
  readonly onCommit: () => void;
}) {
  const isPending = props.request.kind === 'pending';
  return (
    <Flex justify="space-between" align="center" wrap gap={space[2]}>
      <Typography.Text aria-live="polite">{props.continuation.enabled ? '可以确认导入' : `还剩 ${props.continuation.remaining} 个冲突`}</Typography.Text>
      <Button
        type="primary"
        loading={isPending}
        disabled={isPending || props.disabled || !props.continuation.enabled}
        onClick={props.onCommit}
      >
        确认导入
      </Button>
    </Flex>
  );
}

function StepList({ steps }: { readonly steps: readonly NextStep[] }) {
  if (steps.length === 0) return null;
  return (
    <ul style={{ margin: 0, paddingInlineStart: space[3] }}>
      {steps.map((step) => (
        <li key={step.label}><Link to={step.to}>{step.label}</Link></li>
      ))}
    </ul>
  );
}

export function commitSummary(summary: ImportBatchSummary, canReviewAliases: boolean): ImportContinuationInput {
  return {
    template: summary.template,
    status: summary.status,
    pendingAliases: summary.stats.pendingAliases,
    canReviewAliases,
    unresolvedConflicts: summary.unresolvedConflicts,
    error: summary.error,
  };
}
