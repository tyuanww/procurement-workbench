import { Typography } from 'antd';
import { waitingOnLabel } from '@sw/domain';
import type { BoardRow, ReceiptWork, TodayBoard } from '../../features/today/index.js';
import type { ActionPageControls } from './ActionControls.js';
import { focusSection, workspaceRowId } from './today-focus.js';
import { WorkspaceAssistant } from './WorkspaceAssistant.js';

type AssistantProps = {
  readonly page: Pick<ActionPageControls, 'paging' | 'reasons' | 'work' | 'isLoading' | 'isSettled' | 'loadError'>;
  readonly board: TodayBoard;
  readonly receipts: ReadonlyMap<string, ReceiptWork>;
  readonly planCount: number | undefined;
  readonly onOverdue: () => void;
  readonly onFollowUp: () => void;
  readonly onPlan: () => void;
};

export function ActionAssistant(props: AssistantProps) {
  const { board, page, receipts } = props;
  if (page.isLoading || !page.isSettled || page.loadError !== '') return null;
  const batches = board.body.kind === 'groups' ? board.body.rows.filter((row) => row.id.startsWith('batch:')) : [];
  const overdueReceipt = page.work === undefined ? batches.find((row) => receipts.get(row.id)?.status === 'overdue') : undefined;
  const hint = overdueReceipt === undefined ? priorityHint(batches, receipts, page.work) : '先核对到仓逾期批次的实收数量。';
  const shortcuts = availableShortcuts(props, overdueReceipt);
  if (batches.length === 0 && shortcuts.length === 0) return null;
  const isPaged = page.paging.total > page.paging.pageSize;
  return <WorkspaceAssistant title="事项助手" hint={hint} shortcuts={shortcuts}>
    {batches.length === 0 ? null : <WaitingParties batches={batches} isPaged={isPaged} />}
  </WorkspaceAssistant>;
}

function priorityHint(batches: readonly BoardRow[], receipts: AssistantProps['receipts'], work: ActionPageControls['work']): string | null {
  if (batches.length === 0) return null;
  if (work === 'internal_note') return '先核对内部待补的回单。';
  if (batches.some((row) => row.face.overdueTone === 'danger')) return '先确认逾期未发批次的发货安排。';
  if (work === 'factory_chase' || work === 'all_unshipped') return '先确认未发批次的发货安排。';
  if (batches.some((row) => receipts.get(row.id)?.status === 'due_today')) return '先核对今日应到批次的实收数量。';
  if (batches.some((row) => row.reasons?.includes('follow_up_due'))) return '先查看已到跟进时间的批次。';
  if (batches.some((row) => row.face.waitingKind === 'internal' && row.reasons?.includes('note_missing'))) return '先核对内部待补的回单。';
  if (batches.some((row) => row.reasons?.includes('missing_date'))) return '先确认尚无交期的批次何时到仓。';
  return null;
}

function availableShortcuts({ page, planCount, onOverdue, onFollowUp, onPlan }: AssistantProps, overdueReceipt: BoardRow | undefined) {
  const { reasonCounts } = page.paging;
  const currentReason = page.reasons.length === 1 ? page.reasons[0] : undefined;
  const shortcuts = [];
  if (overdueReceipt !== undefined) shortcuts.push({ label: '定位逾期核收', run: () => focusSection(workspaceRowId(overdueReceipt.id)) });
  if (reasonCounts.overdue > 0 && currentReason !== 'overdue') shortcuts.push({ label: '未发逾期', run: onOverdue });
  if (reasonCounts.follow_up_due > 0 && currentReason !== 'follow_up_due') shortcuts.push({ label: '到时跟进', run: onFollowUp });
  if (planCount) shortcuts.push({ label: `我的到期排期 ${planCount} 项`, run: onPlan });
  return shortcuts;
}

function WaitingParties({ batches, isPaged }: { readonly batches: readonly BoardRow[]; readonly isPaged: boolean }) {
  const counts = new Map<string, number>();
  for (const { face } of batches) {
    const label = face.waitingKind === undefined ? '待确认' : waitingOnLabel(face.waitingKind);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return <div className="today-assistant-waiting">
    <Typography.Title level={3}>{isPaged ? '本页批次等待方' : '批次等待方'}</Typography.Title>
    <dl>
      {[...counts].map(([label, count]) => <div key={label}>
        <dt>{label}</dt><dd>{count} 批</dd>
      </div>)}
    </dl>
  </div>;
}
