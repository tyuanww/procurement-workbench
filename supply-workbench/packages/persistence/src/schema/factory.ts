import { boolean, index, integer, jsonb, pgTable, text, uniqueIndex, type AnyPgColumn } from 'drizzle-orm/pg-core';
import { day, id, qty, timestamps } from './columns.js';

function envelope() {
  return {
    id: id(),
    importBatchId: text('import_batch_id').notNull(),
    factoryPartyId: text('factory_party_id').notNull(),
    sheetName: text('sheet_name').notNull(),
    rowNo: integer('row_no').notNull(),
    raw: jsonb('raw').notNull(),
    fingerprint: text('fingerprint').notNull(),
    linkedOrderLineId: text('linked_order_line_id'),
    linkStatus: text('link_status').notNull(),
    linkReason: text('link_reason'),
    ...timestamps,
  };
}

function factoryIndexes(name: string, table: { importBatchId: AnyPgColumn; fingerprint: AnyPgColumn; sheetName: AnyPgColumn; rowNo: AnyPgColumn; linkedOrderLineId: AnyPgColumn }) {
  return [
    index(`${name}_import_batch_id`).on(table.importBatchId),
    index(`${name}_linked_order_line_id`).on(table.linkedOrderLineId),
    uniqueIndex(`${name}_row_identity`).on(table.importBatchId, table.fingerprint, table.sheetName, table.rowNo),
  ];
}

export const factoryInTransitRows = pgTable(
  'factory_in_transit_rows',
  {
    ...envelope(),
    poRaw: text('po_raw'),
    poNorm: text('po_norm'),
    poFormat: text('po_format'),
    nameRaw: text('name_raw'),
    supplierRaw: text('supplier_raw'),
    barcodeRaw: text('barcode_raw'),
    orderedOn: day('ordered_on'),
    qtyRequired: qty('qty_required'),
    qtyDeliveredFactory: qty('qty_delivered_factory'),
    qtyFactoryStock: qty('qty_factory_stock'),
    qtyUnproduced: qty('qty_unproduced'),
    closedRaw: text('closed_raw'),
    itemCodeRaw: text('item_code_raw'),
    materialPoRaws: jsonb('material_po_raws'),
    buyerNameRaw: text('buyer_name_raw'),
    extra: jsonb('extra'),
  },
  (table) => factoryIndexes('factory_in_transit_rows', table),
);

export const factoryShipmentRows = pgTable(
  'factory_shipment_rows',
  {
    ...envelope(),
    poRaw: text('po_raw'),
    poNorm: text('po_norm'),
    itemCodeRaw: text('item_code_raw'),
    nameRaw: text('name_raw'),
    lotRaw: text('lot_raw'),
    qty: qty('qty'),
    casePackRaw: text('case_pack_raw'),
    palletsRaw: text('pallets_raw'),
    shipmentKindRaw: text('shipment_kind_raw'),
    shipOrArriveOn: day('ship_or_arrive_on'),
    destinationRaw: text('destination_raw'),
    vehicleRaw: text('vehicle_raw'),
    note2Raw: text('note2_raw'),
  },
  (table) => factoryIndexes('factory_shipment_rows', table),
);

export const factoryStockRows = pgTable(
  'factory_stock_rows',
  {
    ...envelope(),
    poRaw: text('po_raw'),
    itemCodeRaw: text('item_code_raw'),
    itemCodeNorm: text('item_code_norm'),
    nameRaw: text('name_raw'),
    lotRaw: text('lot_raw'),
    qtyOnHand: qty('qty_on_hand'),
    palletsRaw: text('pallets_raw'),
    coaOn: day('coa_on'),
    producedOn: day('produced_on'),
    inspectionRaw: text('inspection_raw'),
    inspected: boolean('inspected'),
  },
  (table) => [...factoryIndexes('factory_stock_rows', table), index('factory_stock_rows_item_code_norm').on(table.itemCodeNorm)],
);

export const factoryScheduleCells = pgTable(
  'factory_schedule_cells',
  {
    ...envelope(),
    poRaw: text('po_raw'),
    itemCodeRaw: text('item_code_raw'),
    nameRaw: text('name_raw'),
    monthRaw: text('month_raw'),
    newOrOldRaw: text('new_or_old_raw'),
    qtyRequiredTotal: qty('qty_required_total'),
    day: day('day'),
    qty: qty('qty'),
    stepRaw: text('step_raw'),
  },
  (table) => factoryIndexes('factory_schedule_cells', table),
);

export const factoryMaterialDemandRows = pgTable(
  'factory_material_demand_rows',
  {
    ...envelope(),
    role: text('role').notNull(),
    blockPoRaw: text('block_po_raw'),
    blockMaterialPoRaw: text('block_material_po_raw'),
    blockLabelRaw: text('block_label_raw'),
    itemCodeRaw: text('item_code_raw'),
    nameRaw: text('name_raw'),
    unitRaw: text('unit_raw'),
    qtyOnHand: qty('qty_on_hand'),
    qtyFinishedEstimate: qty('qty_finished_estimate'),
    qtyGross: qty('qty_gross'),
    qtyNet: qty('qty_net'),
    slots: jsonb('slots').notNull(),
  },
  (table) => factoryIndexes('factory_material_demand_rows', table),
);

export const factoryPackagingComboRows = pgTable(
  'factory_packaging_combo_rows',
  {
    ...envelope(),
    poRaw: text('po_raw'),
    itemCodeRaw: text('item_code_raw'),
    nameRaw: text('name_raw'),
    specRaw: text('spec_raw'),
    qty: qty('qty'),
    comboSuppliersRaw: text('combo_suppliers_raw'),
    bomCodeRaw: text('bom_code_raw'),
    materialPoRaw: text('material_po_raw'),
  },
  (table) => factoryIndexes('factory_packaging_combo_rows', table),
);

export const customerSuppliedReceiptRows = pgTable(
  'customer_supplied_receipt_rows',
  {
    ...envelope(),
    registeredOn: day('registered_on'),
    seqRaw: text('seq_raw'),
    itemCodeRaw: text('item_code_raw'),
    nameRaw: text('name_raw'),
    lotRaw: text('lot_raw'),
    specKg: qty('spec_kg'),
    pieces: qty('pieces'),
    netQty: qty('net_qty'),
    expiresOn: day('expires_on'),
    ownerNoteRaw: text('owner_note_raw'),
  },
  (table) => factoryIndexes('customer_supplied_receipt_rows', table),
);
