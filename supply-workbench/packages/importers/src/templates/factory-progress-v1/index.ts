import type { FactoryProgressParsed, ImportExisting } from '../../../../application/src/ports/parsed-rows.js';
import type { ImportTemplate } from '../../../../application/src/ports/import-template.js';
import type { WorkbookLike } from '../../../../application/src/ports/workbook-reader.js';
import { commitFactory } from '../../../../application/src/imports/commit/factory-progress-v1.js';
import { knownManifest } from '../manifest.js';
import { detectFactoryProgress } from './detect.js';
import { markRows } from './diff.js';
import { parseFactoryProgress } from './parse.js';
import { fingerprintExisting } from '../plain.js';
import { factoryFacts, factoryIdentity } from './identity.js';
import { SHEETS } from './spec/index.js';

export const template: ImportTemplate<FactoryProgressParsed> = {
  id: 'factory-progress-v1',
  requiresFactory: true,
  identityOf: factoryIdentity,
  existingFrom: fingerprintExisting,
  factsOf: factoryFacts,
  detect(book: WorkbookLike) {
    return detectFactoryProgress(book);
  },
  parse(book, ctx) {
    return parseFactoryProgress(book, ctx);
  },
  diff(parsed, existing: ImportExisting) {
    return {
      ...parsed,
      inTransit: markRows(parsed.inTransit, existing),
      shipments: markRows(parsed.shipments, existing),
      stock: markRows(parsed.stock, existing),
      schedule: markRows(parsed.schedule, existing),
      demand: markRows(parsed.demand, existing),
      packagingCombo: markRows(parsed.packagingCombo, existing),
      customerSupplied: markRows(parsed.customerSupplied, existing),
    };
  },
};

const columns = Object.values(SHEETS).flatMap((sheet) => sheet.columns.map((column) => column.name));

export const manifest = knownManifest({ template, columns, commit: commitFactory });
