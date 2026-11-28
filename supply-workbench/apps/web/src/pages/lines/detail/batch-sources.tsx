import { Collapse, Descriptions, Flex, Grid, Typography } from 'antd';
import type { OrderLineDetail } from '@sw/contracts';
import { Link } from 'react-router';
import { useCan } from '../../../shared/actor.js';
import { space } from '../../../theme/tokens.js';
import './batch-sources.css';

type Batch = OrderLineDetail['batches'][number];
type Reports = OrderLineDetail['factoryReports'];
type ShipmentSource = Reports['shipments'][number];
type DemandSource = NonNullable<OrderLineDetail['batchDemandSources']>[string];
type ProcurementFact = NonNullable<OrderLineDetail['procurement']>['sources'][number]['fact'];
type SourceRecord = {
  readonly importBatchId: string;
  readonly sheetName: string;
  readonly rowNo: number;
  readonly fileName: string | undefined | null;
  readonly fields: readonly SourceField[];
};
type SourceField = readonly [label: string, raw: string | null | undefined];

const PURCHASE_FIELDS = [
  ['采购订单号', 'po'],
  ['产品名称', 'nameRaw'],
  ['产品条码', 'barcodeRaw'],
  ['订单数量', 'qtyOrdered'],
  ['订单首批交付时间', 'firstDeliveryOn'],
  ['实际发货数量', 'shippedQtyReported'],
  ['状态', 'statusReported'],
] as const;

export function BatchSources({ detail, batch }: { readonly detail: OrderLineDetail; readonly batch: Batch }) {
  return <Collapse size="small" items={[{
    key: batch.id,
    label: `回查第 ${batch.seq} 批原表`,
    children: <SourceEvidence detail={detail} batch={batch} />,
  }]} />;
}

function SourceEvidence({ detail, batch }: { readonly detail: OrderLineDetail; readonly batch: Batch }) {
  const canReadImport = useCan('imports.read');
  const assignedIds = new Set(detail.batches.flatMap(activeShipmentIds));
  const sourceById = new Map([...detail.factoryReports.shipments, ...(detail.archivedShipmentSources ?? [])].map((row) => [row.id, row]));
  const batchIds = activeShipmentIds(batch);
  const confirmed = batchIds.flatMap((id) => {
    const row = sourceById.get(id);
    return row === undefined ? [] : [shipmentRecord(row, detail.sourceFiles)];
  });
  const demand = detail.batchDemandSources?.[batch.id];
  const reference = orderFactorySources(detail, { assignedIds, origin: demand === undefined ? null : batch.originRef });
  return <Flex vertical gap={space[3]}>
    {batch.origin === 'from_factory_demand' ? <EvidenceGroup title="工厂需求表 · 本批生成来源"
      rows={demand === undefined ? [] : [{ ...rowLocation(demand, detail.sourceFiles), fields: slotFields(demand.slot) }]}
      canReadImport={canReadImport} empty="本批的需求原表单元格待核对。" /> : null}
    <EvidenceGroup title="采购表 · 本单参考" rows={purchaseSources(detail)} canReadImport={canReadImport}
      empty="暂无可回查的采购原表行。" />
    <EvidenceGroup title="工厂表 · 本批已归属" rows={confirmed} canReadImport={canReadImport}
      empty="本批暂无已归属的工厂出货原行。"
      notice={batch.hasUnavailableShipmentSource === true ? '本批已登记发货，历史原表暂无法核对。' : undefined} />
    <EvidenceGroup title="工厂表 · 本单参考" rows={reference} canReadImport={canReadImport}
      empty="本单暂无可参考的物料需求、在途或未归批出货原表行。" />
  </Flex>;
}

function activeShipmentIds(batch: Batch): readonly string[] {
  return batch.shipments.flatMap((entry) => entry.voidedAt === null && entry.factoryShipmentRowId !== null ? [entry.factoryShipmentRowId] : []);
}

function purchaseSources(detail: OrderLineDetail): readonly SourceRecord[] {
  const projects = detail.procurement?.sources ?? [];
  if (projects.length > 0) return projects.map(({ importBatchId, fileName, fact }) => ({
    importBatchId, fileName, ...fact.source,
    fields: [
      ['采购订单po单号', fact.poRaw], ['需采购子件名称', fact.componentNameRaw], ['子部件代码', fact.componentCodeRaw],
      ['采购数量', fact.quantityRaw],
      ...(fact.unitRaw === null ? [] : [['单位原文', fact.unitRaw] as const]),
      ['实际交付进度', fact.deliveryProgressRaw ?? null],
      [procurementCellLabel('OA需求流程编号', fact.oa.source), fact.oa.raw],
      [procurementCellLabel('产品69码', fact.productCodes.source), fact.productCodes.raw],
    ],
  }));
  const snapshot = detail.snapshot;
  if (snapshot === null) return [];
  const imported = Object.values(snapshot.fields).find(({ provenance }) => provenance.kind === 'import' && provenance.template === 'po-master-v1')?.provenance;
  if (imported?.kind !== 'import') return [];
  return [{
    importBatchId: snapshot.importBatchId, fileName: detail.sourceFiles?.[snapshot.importBatchId], sheetName: imported.sheet, rowNo: imported.rowNo,
    fields: PURCHASE_FIELDS.flatMap(([label, key]) => {
      const field = snapshot.fields[key];
      return field === undefined ? [] : [[label, field.raw ?? null]];
    }),
  }];
}

function procurementCellLabel(label: string, source: ProcurementFact['oa']['source']) {
  if (source === null) return label;
  const type = source.range === null ? '原格' : '合并格起点';
  return `${label}（${type} 第 ${source.rowNo} 行第 ${source.column} 列）`;
}

function orderFactorySources(detail: OrderLineDetail, { assignedIds, origin }: {
  readonly assignedIds: ReadonlySet<string>;
  readonly origin: Batch['originRef'];
}): readonly SourceRecord[] {
  const files = detail.sourceFiles;
  const { demand, inTransit, shipments } = detail.factoryReports;
  const demandRows = demand.filter((row) => row.payload.role === 'material').map((row) => ({
    ...rowLocation(row, files),
    fields: [
      ['采购单号（需求分组）', row.originalCells?.blockMaterialPoRaw],
      ['订单号（需求分组）', row.originalCells?.blockOrderRaw],
      ['材料品号', row.originalCells?.itemCodeRaw],
      ['材料品名', row.originalCells?.nameRaw],
      ['材料库存单位', row.originalCells?.unitRaw],
      ['物料需求量', row.originalCells?.qtyNet],
      ...row.payload.slots.filter(({ index }) => row.id !== origin?.rowId || index !== origin.slotIndex).flatMap(slotFields),
    ] satisfies SourceField[],
  }));
  const transitRows = inTransit.map((row) => ({
    ...rowLocation(row, files),
    fields: [
      ['订单号', row.payload.po.raw], ['品名', row.payload.nameRaw.raw],
      ['采购需求量', row.payload.qtyRequired.raw], ['已交货数量', row.payload.qtyDeliveredFactory.raw],
    ] satisfies SourceField[],
  }));
  return [...demandRows, ...transitRows, ...shipments.filter((row) => !assignedIds.has(row.id)).map((row) => shipmentRecord(row, files))];
}

function slotFields({ index, sourceColumns, originalCells }: DemandSource['slot']): readonly SourceField[] {
  const key = `需求到位日期&数量 · 第 ${index + 1} 组`;
  return [
    [`${key} · 到货时间${columnLabel(sourceColumns?.date)}`, originalCells?.dateRaw],
    [`${key} · 数量${columnLabel(sourceColumns?.quantity)}`, originalCells?.qtyRaw],
  ];
}

function columnLabel(column: number | undefined) {
  return column === undefined ? '（原列待核对）' : `（第 ${column} 列）`;
}

function shipmentRecord(row: ShipmentSource, files: OrderLineDetail['sourceFiles']): SourceRecord {
  const raw = row.originalCells;
  return {
    ...rowLocation(row, files),
    fields: [
      ['订单号', raw?.po], ['品号', raw?.itemCodeRaw], ['批号', raw?.lotRaw],
      ['数量', raw?.qty], ['出货时间（到货时间）', raw?.shipOrArriveOn],
    ],
  };
}

function rowLocation(row: Pick<SourceRecord, 'importBatchId' | 'sheetName' | 'rowNo'>, files: OrderLineDetail['sourceFiles']) {
  return { importBatchId: row.importBatchId, fileName: files?.[row.importBatchId], sheetName: row.sheetName, rowNo: row.rowNo };
}

function EvidenceGroup({ title, rows, canReadImport, empty, notice }: {
  readonly title: string;
  readonly rows: readonly SourceRecord[];
  readonly canReadImport: boolean;
  readonly empty: string;
  readonly notice?: string | undefined;
}) {
  const isCompact = Grid.useBreakpoint().xs === true;
  return <section aria-label={title} className="batch-source-group">
    <Typography.Title level={4}>{title}</Typography.Title>
    {rows.length === 0 && notice === undefined ? <Typography.Text type="secondary">{empty}</Typography.Text> : rows.map((row) => (
      <Descriptions key={JSON.stringify([row.importBatchId, row.sheetName, row.rowNo])} size="small" column={1}
        layout={isCompact ? 'vertical' : 'horizontal'} styles={{ title: { whiteSpace: 'normal' } }}
        title={<SourceLocation row={row} canReadImport={canReadImport} />}
        items={row.fields.map(([label, raw]) => ({ key: label, label, children: originalCellText(raw) }))}
      />
    ))}
    {notice === undefined ? null : <Typography.Text type="secondary" role="status">{notice}</Typography.Text>}
  </section>;
}

function originalCellText(raw: SourceField[1]) {
  if (raw === undefined) return '原值待核对';
  return raw === null || raw.trim() === '' ? '原表未填' : raw;
}

function SourceLocation({ row, canReadImport }: { readonly row: SourceRecord; readonly canReadImport: boolean }) {
  const location = [row.fileName ?? '文件名待核对', row.sheetName, `第 ${row.rowNo} 行`].join(' · ');
  return canReadImport ? <Link to={`/imports/${encodeURIComponent(row.importBatchId)}`}>{location}</Link> : location;
}
