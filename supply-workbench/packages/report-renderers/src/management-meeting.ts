import type { ManagementMeetingSnapshot, MeetingBatch, MeetingMaterial, MeetingWaitingOn } from '../../application/src/reporting/management-meeting.js';

type MeetingTable = {
  readonly title: string;
  readonly headers: readonly string[];
  readonly rows: readonly (readonly string[])[];
};

const STORE = { dafuyan: '达肤妍', yiling: '译龄', unassigned: '未分店铺' } satisfies Record<ManagementMeetingSnapshot['store'], string>;
const WAITING = {
  verification: '待核实凭据', buyer: '等采购确认', supplier: '等供应商发货',
  receiver: '等收货方点收', none: '无待处理履约',
} satisfies Record<MeetingWaitingOn, string>;

export function managementMeetingTables(meetings: readonly ManagementMeetingSnapshot[] | undefined): readonly MeetingTable[] {
  const stores = meetings ?? [];
  return [
    {
      title: '周会采购事项',
      headers: ['店铺', '采购事项', '源表数量', '核实数量', '当前等待方', '影响成品', '来源与原话'],
      rows: stores.flatMap((meeting) => meeting.materials.map((row) => materialRow(STORE[meeting.store], row))),
    },
    {
      title: '周会批次承诺',
      headers: ['店铺', '采购事项', '批次', '上周末承诺及来源', '上周末承诺原话', '当前承诺', '工厂要求', '确认到货', '等待方'],
      rows: stores.flatMap((meeting) => meeting.materials.flatMap((material) => material.batches.map((batch) => batchRow({ store: STORE[meeting.store], material, batch })))),
    },
    {
      title: '周会新品风险',
      headers: ['店铺', '新品项目', '节点', '要求日期', '送达地点', '采购负责人', '最新回复'],
      rows: stores.flatMap((meeting) => meeting.development.map((row) => [
        STORE[meeting.store], row.projectName, row.name, row.plannedEnd, row.destination === 'factory' ? '到加工厂' : '入仓',
        row.ownerName ?? '待分配', row.latestReply === null ? '等采购回复' : lines(row.latestReply.text, row.latestReply.recordedAt),
      ])),
    },
    {
      title: '周会决定',
      headers: ['店铺', '采购事项', '周会日期', '决定', '负责人和截止日', '记录人', '完成依据及结果'],
      rows: stores.flatMap(decisionRows),
    },
  ].filter((table) => table.rows.length > 0);
}

function materialRow(store: string, row: MeetingMaterial): readonly string[] {
  return [
    store,
    materialLabel(row),
    lines(`订购 ${qty(row.orderedQty, row.unit)}`, `报告已送 ${qty(row.sourceReportedQty, row.unit)}`, `报告差额 ${qty(row.sourceReportedGap, row.unit)}`),
    lines(`实发 ${qty(row.verifiedShippedQty, row.unit)}`, `实收 ${qty(row.verifiedReceivedQty, row.unit)}`, row.quantityNeedsReview ? '有数量待核' : null),
    lines(...row.waitingOn.map((party) => waitingLabel(row, party))),
    lines(...row.affectedFinished.map((item) => [item.name ?? '未命名成品', item.oaRef].filter(Boolean).join(' · '))),
    lines(`${row.source.sheetName} 第 ${row.source.rowNo} 行 · ${row.source.importBatchId}`, row.sourceReportedProgress),
  ];
}

function materialLabel(row: MeetingMaterial): string {
  return lines(row.name ?? '未命名物料', row.code, row.poRef);
}

function batchRow({ store, material, batch }: { readonly store: string; readonly material: MeetingMaterial; readonly batch: MeetingBatch }): readonly string[] {
  const previous = batch.previousPromise;
  return [
    store, materialLabel(material), String(batch.seq),
    previous === null ? '待核实' : lines(previous.date, `${previous.source === 'change' ? '日期变更' : '批次登记'} ${previous.recordedAt}`),
    lines(batch.previousPromiseText?.text, batch.previousPromiseText?.recordedAt),
    batch.currentPromise ?? '待核实', batch.factoryRequired ?? '—', batch.confirmedArrival ?? '待确认',
    lines(...batch.waitingOn.map((party) => waitingLabel(material, party))),
  ];
}

function decisionRows(meeting: ManagementMeetingSnapshot): readonly (readonly string[])[] {
  const materials = new Map(meeting.materials.map((row) => [row.materialLineId, row.name ?? row.code]));
  return meeting.decisions.map((row) => [
    STORE[meeting.store], materials.get(row.materialLineId) ?? row.materialLineId, row.weekStart, row.decision,
    lines(row.owner.name, row.dueDate), lines(row.decidedBy.name, row.recordedAt),
    lines(row.completionCriteria, row.completion === null ? '待完成' : '已完成', row.completion?.evidence, row.completion?.by.name, row.completion?.at),
  ]);
}

function waitingLabel(row: MeetingMaterial, party: MeetingWaitingOn): string {
  const name = party === 'buyer' ? row.buyerName : party === 'supplier' ? row.supplierName : party === 'receiver' ? row.receiverName : null;
  return name === null ? WAITING[party] : `${WAITING[party]} · ${name}`;
}

function lines(...values: readonly (string | null | undefined)[]): string {
  return values.filter(Boolean).join('\n');
}

function qty(value: number | null, unit: string | null): string {
  return value === null ? '待核实' : `${value} ${unit ?? '（单位待核）'}`;
}
