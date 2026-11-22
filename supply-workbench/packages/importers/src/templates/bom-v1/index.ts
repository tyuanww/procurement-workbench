import type { BomParsed } from '../../../../application/src/ports/parsed-rows.js';
import type { ImportTemplate } from '../../../../application/src/ports/import-template.js';
import { commitBom } from '../../../../application/src/imports/commit/bom-v1.js';
import { plainIdentity } from '../plain.js';
import { knownManifest } from '../manifest.js';
import { BOM_COLUMNS } from './columns.js';
import { detectBom } from './detect.js';
import { diffBom } from './diff.js';
import { parseBom } from './parse.js';

export const template: ImportTemplate<BomParsed> = {
  ...plainIdentity,
  id: 'bom-v1',
  detect: detectBom,
  parse: parseBom,
  diff: diffBom,
};

export const manifest = knownManifest({ template, columns: BOM_COLUMNS, commit: commitBom });
