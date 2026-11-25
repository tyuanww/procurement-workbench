import type { ManagementDecision, ManagementMeeting, MeetingMaterial, MeetingWaitingOn } from '@sw/contracts';
import { addDays, type LocalDate } from '@sw/domain';
import type { DecisionEditor } from '../../features/reporting/index.js';

export type HomeEdit = { readonly editor: DecisionEditor; readonly meeting: ManagementMeeting };
export type EditDecision = (editor: DecisionEditor, meeting: ManagementMeeting) => void;

export const DELIVERY_RISKS = [
  { key: 'overdue', label: '逾期未到', tone: 'danger' },
  { key: 'soon', label: '7 天内应到', tone: 'info' },
  { key: 'unconfirmed', label: '待确认交期', tone: 'warning' },
] as const;

export type RiskType = typeof DELIVERY_RISKS[number]['key'];
export type WaitingParty = Exclude<MeetingWaitingOn, 'none'>;
export const WAITING_PARTIES: Record<WaitingParty, string> = {
  verification: '待核实凭据',
  buyer: '采购',
  supplier: '供应商',
  receiver: '收货方',
};

export type RiskBatch = {
  readonly batch: MeetingMaterial['batches'][number];
  readonly material: MeetingMaterial;
  readonly meetings: readonly [ManagementMeeting, ...ManagementMeeting[]];
  readonly risk: RiskType;
  readonly waiting: readonly WaitingParty[];
};

export function materialName(material: MeetingMaterial): string {
  return material.name ?? material.code ?? material.poRef ?? '未命名采购事项';
}

export function deliveryRisks(meetings: readonly ManagementMeeting[], today: LocalDate): RiskBatch[] {
  const end = addDays(today, 7);
  const byBatch = new Map<string, RiskBatch>();
  for (const row of meetings.flatMap((meeting) => meetingRisks({ meeting, today, end }))) {
    const existing = byBatch.get(row.batch.id);
    byBatch.set(row.batch.id, existing === undefined ? row : { ...existing, meetings: [...existing.meetings, ...row.meetings] });
  }
  return [...byBatch.values()].sort((left, right) =>
    (left.batch.confirmedArrival ?? '').localeCompare(right.batch.confirmedArrival ?? '') || left.batch.id.localeCompare(right.batch.id),
  );
}

function meetingRisks({ meeting, today, end }: {
  readonly meeting: ManagementMeeting;
  readonly today: LocalDate;
  readonly end: LocalDate;
}): RiskBatch[] {
  const rows: RiskBatch[] = [];
  for (const material of meeting.materials) {
    for (const batch of material.batches) {
      const waiting = batch.waitingOn.filter((party) => party !== 'none');
      const date = batch.confirmedArrival;
      const risk = date === null ? 'unconfirmed' : date < today ? 'overdue' : date < end ? 'soon' : undefined;
      if (waiting.length > 0 && risk !== undefined) rows.push({ batch, material, meetings: [meeting], risk, waiting });
    }
  }
  return rows;
}

export type OpenDecision = { readonly meeting: ManagementMeeting; readonly decision: ManagementDecision };

export function openDecisions(meetings: readonly ManagementMeeting[]): OpenDecision[] {
  return meetings.flatMap((meeting) => meeting.decisions.flatMap((decision) =>
    decision.completion === null ? [{ meeting, decision }] : [],
  )).sort((left, right) => left.decision.dueDate.localeCompare(right.decision.dueDate));
}

export function waitingDetail(row: RiskBatch): string {
  const { material } = row;
  const names = {
    verification: null, buyer: material.buyerName, supplier: material.supplierName, receiver: material.receiverName,
  } satisfies Record<WaitingParty, string | null>;
  return row.waiting.map((party) => {
    const name = names[party];
    return name === null ? WAITING_PARTIES[party] : `${WAITING_PARTIES[party]} ${name}`;
  }).join('、');
}
