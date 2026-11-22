import type { ProductArchiveParsed } from '../../../../application/src/ports/parsed-rows.js';
import type { ImportTemplate } from '../../../../application/src/ports/import-template.js';
import { archiveImageMounts } from '../../../../application/src/imports/use-cases/archive-images.js';
import { commitProductArchive } from '../../../../application/src/imports/commit/product-archive-v1.js';
import { plainIdentity } from '../plain.js';
import { knownManifest } from '../manifest.js';
import { REQUIRED_COLUMNS } from './columns.js';
import { detectProductArchive } from './detect.js';
import { diffProductArchive } from './diff.js';
import { parseProductArchive } from './parse.js';

export { productInfoContacts } from './contacts.js';
export { mountImages } from './images.js';
export { readHeader } from './headers.js';

export const template: ImportTemplate<ProductArchiveParsed> = {
  ...plainIdentity,
  id: 'product-archive-v1',
  mountImages: archiveImageMounts,
  detect: detectProductArchive,
  parse: parseProductArchive,
  diff: diffProductArchive,
};

export const manifest = knownManifest({ template, columns: REQUIRED_COLUMNS, commit: commitProductArchive });
