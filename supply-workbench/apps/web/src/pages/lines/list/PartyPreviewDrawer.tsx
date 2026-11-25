import { useEffect, useState, type ReactNode } from 'react';
import { Alert, Button, Descriptions, Drawer, Empty, Flex, Skeleton, Typography } from 'antd';
import { PartyDetailSchema, type PartyDetail } from '@sw/contracts';
import { apiGetWithSignal } from '../../../shared/api/client.js';
import { readFailureOf } from '../../../shared/api/failure.js';
import { drawerWide } from '../../../theme/tokens.js';
import {
  loadingPartyPreview,
  partyFlagLabel,
  partyKpiLine,
  partyPreviewFailure,
  partyPreviewPhase,
  partyPreviewRoleLabel,
  type OpenParty,
  type PartyPreviewPhase,
} from './party-preview.js';

export type PartyPreviewDrawerProps = {
  readonly opened: OpenParty;
  readonly onClose: () => void;
};

export function PartyPreviewDrawer(props: PartyPreviewDrawerProps) {
  const preview = usePartyPreview(props.opened);
  return (
    <Drawer
      placement="right"
      size={`min(${drawerWide}px, 100vw)`}
      open
      keyboard
      destroyOnHidden
      focusable={{ trap: true, focusTriggerAfterClose: true }}
      onClose={props.onClose}
      title={previewTitle(preview.phase)}
      footer={<PartyPreviewFooter partyId={props.opened.partyId} onClose={props.onClose} />}
    >
      <PartyPreviewBody phase={preview.phase} onRetry={preview.retry} />
    </Drawer>
  );
}

function usePartyPreview(opened: OpenParty): { readonly phase: PartyPreviewPhase; readonly retry: () => void } {
  const partyId = opened.partyId;
  const role = opened.role;
  const [returnTo] = useState(() => (document.activeElement instanceof HTMLElement ? document.activeElement : null));
  const [generation, setGeneration] = useState(0);
  const [phase, setPhase] = useState<PartyPreviewPhase>(() => loadingPartyPreview(opened));
  useEffect(() => () => { queueMicrotask(() => { returnTo?.focus({ preventScroll: true }); }); }, [returnTo]);
  if (phase.opened.partyId !== partyId || phase.opened.role !== role) setPhase(loadingPartyPreview({ partyId, role }));
  useEffect(() => loadParty({ partyId, role, setPhase }), [partyId, role, generation]);
  return { phase, retry: () => retryParty({ partyId, role, setPhase, setGeneration }) };
}

function retryParty(input: {
  readonly partyId: OpenParty['partyId'];
  readonly role: OpenParty['role'];
  readonly setPhase: (update: (current: PartyPreviewPhase) => PartyPreviewPhase) => void;
  readonly setGeneration: (update: (current: number) => number) => void;
}): void {
  input.setPhase((current) => partyPreviewPhase(current, { kind: 'load', opened: { partyId: input.partyId, role: input.role } }));
  input.setGeneration((current) => current + 1);
}

function loadParty(input: {
  readonly partyId: OpenParty['partyId'];
  readonly role: OpenParty['role'];
  readonly setPhase: (update: (current: PartyPreviewPhase) => PartyPreviewPhase) => void;
}): () => void {
  const opened: OpenParty = { partyId: input.partyId, role: input.role };
  const controller = new AbortController();
  let isActive = true;
  input.setPhase((current) => partyPreviewPhase(current, { kind: 'load', opened }));
  void apiGetWithSignal({
    path: `/api/v1/parties/${encodeURIComponent(input.partyId)}`,
    schema: PartyDetailSchema,
    signal: controller.signal,
  }).then((detail) => {
    if (!isActive) return;
    input.setPhase((current) => partyPreviewPhase(current, { kind: 'ready', partyId: input.partyId, detail }));
  }).catch((error: unknown) => {
    if (!isActive) return;
    const failure = readFailureOf(error);
    if (failure === null) return;
    input.setPhase((current) => partyPreviewPhase(current, partyPreviewFailure({ partyId: input.partyId, failure })));
  });
  return () => {
    isActive = false;
    controller.abort();
  };
}

export function PartyPreviewBody(props: { readonly phase: PartyPreviewPhase; readonly onRetry: () => void }): ReactNode {
  switch (props.phase.kind) {
    case 'loading':
      return <Skeleton active paragraph={{ rows: 8 }} />;
    case 'ready':
      return <PartyPreviewReady detail={props.phase.detail} />;
    case 'forbidden':
      return <PartyPreviewProblem title="没有权限看这个主体" message={props.phase.message} onRetry={props.onRetry} />;
    case 'missing':
      return <PartyPreviewProblem title="找不到这个主体" message={props.phase.message} onRetry={props.onRetry} />;
    case 'failed':
      return <PartyPreviewProblem title="主体没有读出来" message={props.phase.message} onRetry={props.onRetry} />;
    default: {
      const unreachable: never = props.phase;
      return unreachable;
    }
  }
}

function PartyPreviewReady({ detail }: { readonly detail: PartyDetail }): ReactNode {
  const party = detail.party;
  return (
    <div>
      <Descriptions bordered size="small" column={1} items={[
        { key: 'name', label: '名称', children: party.displayName },
        { key: 'flags', label: '角色', children: partyFlagLabel(party) },
        { key: 'note', label: '备注', children: party.note ?? '—' },
      ]} />
      <Typography.Title level={4}>别名</Typography.Title>
      <PartyAliases detail={detail} />
      <Typography.Title level={4}>指标</Typography.Title>
      <Typography.Text>{partyKpiLine(detail)}</Typography.Text>
    </div>
  );
}

function PartyAliases({ detail }: { readonly detail: PartyDetail }): ReactNode {
  if (detail.aliases.length === 0) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无别名" />;
  return <ul>{detail.aliases.map((alias) => <li key={alias.id}>{alias.rawName}</li>)}</ul>;
}

function PartyPreviewProblem(props: { readonly title: string; readonly message: string; readonly onRetry: () => void }): ReactNode {
  return <Alert type="error" showIcon title={props.title} description={props.message} action={<Button autoInsertSpace={false} onClick={props.onRetry}>重试</Button>} />;
}

function PartyPreviewFooter(props: { readonly partyId: string; readonly onClose: () => void }): ReactNode {
  return (
    <Flex justify="flex-end" gap={12} wrap>
      <Button href={`/parties/${encodeURIComponent(props.partyId)}`}>打开主体详情</Button>
      <Button autoFocus autoInsertSpace={false} onClick={props.onClose}>关闭</Button>
    </Flex>
  );
}

function previewTitle(phase: PartyPreviewPhase): string {
  const label = partyPreviewRoleLabel(phase.opened.role);
  if (phase.kind !== 'ready') return `${label}预览`;
  return `${label} ${phase.detail.party.displayName}`;
}
