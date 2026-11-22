import { z } from 'zod';
import { IssueCodeSchema, IssueSeveritySchema, LinkStatusSchema } from './enums.js';
import { nullable, strictObject } from './shape.js';
import { LocalDateSchema } from './values.js';
import { parsedDate, parsedNumber, parsedPo, parsedText } from './parsed-cell.js';

const issue = strictObject({
  code: IssueCodeSchema,
  severity: IssueSeveritySchema,
  column: nullable(z.string()),
  message: z.string(),
  raw: nullable(z.string()),
});

export const inTransitPayload = strictObject({
  po: parsedPo,
  nameRaw: parsedText,
  supplierRaw: parsedText,
  barcodeRaw: parsedText,
  orderedOn: parsedDate,
  qtyRequired: parsedNumber,
  qtyDeliveredFactory: parsedNumber,
  qtyFactoryStock: parsedNumber,
  qtyUnproduced: parsedNumber,
  closedRaw: parsedText,
  itemCodeRaw: parsedText,
  materialPoRaws: parsedPo,
  buyerNameRaw: parsedText,
  extra: strictObject({ M: parsedText, O: parsedText }),
});

export const shipmentPayload = strictObject({
  po: parsedPo,
  itemCodeRaw: parsedText,
  nameRaw: parsedText,
  lotRaw: parsedText,
  qty: parsedNumber,
  casePackRaw: parsedText,
  palletsRaw: parsedText,
  shipmentKindRaw: parsedText,
  shipOrArriveOn: parsedDate,
  destinationRaw: parsedText,
  vehicleRaw: parsedText,
  note2Raw: parsedText,
});

export const stockPayload = strictObject({
  po: parsedPo,
  itemCodeRaw: parsedText,
  nameRaw: parsedText,
  lotRaw: parsedText,
  qtyOnHand: parsedNumber,
  palletsRaw: parsedText,
  coaOn: parsedDate,
  producedOn: parsedDate,
  inspectionRaw: parsedText,
  inspected: nullable(z.boolean()),
});

export const schedulePayload = strictObject({
  po: parsedPo,
  itemCodeRaw: parsedText,
  nameRaw: parsedText,
  monthRaw: parsedText,
  newOrOldRaw: parsedText,
  qtyRequiredTotal: parsedNumber,
  day: LocalDateSchema,
  qty: nullable(z.number()),
  stepRaw: nullable(z.string()),
});

export const demandPayload = strictObject({
  role: z.enum(['parent', 'material']),
  blockPoRaw: nullable(z.string()),
  blockMaterialPoRaw: nullable(z.string()),
  blockLabelRaw: nullable(z.string()),
  itemCodeRaw: parsedText,
  nameRaw: parsedText,
  unitRaw: parsedText,
  qtyOnHand: parsedNumber,
  qtyFinishedEstimate: parsedNumber,
  qtyGross: parsedNumber,
  qtyNet: parsedNumber,
  slots: z.array(strictObject({
    index: z.number(),
    date: nullable(LocalDateSchema),
    dateRaw: nullable(z.string()),
    qty: nullable(z.number()),
    qtyRaw: nullable(z.string()),
    issues: z.array(issue),
  })),
});

export const comboPayload = strictObject({
  po: parsedPo,
  itemCodeRaw: parsedText,
  nameRaw: parsedText,
  specRaw: parsedText,
  qty: parsedNumber,
  comboSuppliersRaw: parsedText,
  bomCodeRaw: parsedText,
  materialPoRaw: parsedPo,
});

export const suppliedPayload = strictObject({
  registeredOn: parsedDate,
  seqRaw: parsedText,
  itemCodeRaw: parsedText,
  nameRaw: parsedText,
  lotRaw: parsedText,
  specKg: parsedNumber,
  pieces: parsedNumber,
  netQty: parsedNumber,
  expiresOn: parsedDate,
  ownerNoteRaw: parsedText,
});

export const factoryRow = <K extends string, P>(kind: K, payload: z.ZodType<P>) => strictObject({
  id: z.string(),
  importBatchId: z.string(),
  factoryPartyId: z.string(),
  sheetName: z.string(),
  rowNo: z.number(),
  fingerprint: z.string(),
  linkedOrderLineId: nullable(z.string()),
  linkStatus: LinkStatusSchema,
  linkReason: nullable(z.string()),
  kind: z.literal(kind),
  payload,
});

export const inTransitRow = factoryRow('in_transit', inTransitPayload);
