import type { PoMasterParsed } from '../../../../application/src/ports/parsed-rows.js';
import type { ImportTemplate } from '../../../../application/src/ports/import-template.js';
import { commitPoMaster } from '../../../../application/src/imports/commit/po-master-v1.js';
import { plainIdentity } from '../plain.js';
import { knownManifest } from '../manifest.js';
import { OPTIONAL_COLUMNS, REQUIRED_COLUMNS } from './columns.js';
import { detectPoMaster } from './detect.js';
import { diffPoMaster } from './diff.js';
import { parsePoMaster } from './parse.js';

export { pendingIdentities } from './identities.js';
export { fillNoYear, importYear } from './year.js';
export { candidateKeys } from './keys.js';

export const template: ImportTemplate<PoMasterParsed> = {
  ...plainIdentity,
  id: 'po-master-v1',
  detect: detectPoMaster,
  parse: parsePoMaster,
  diff: diffPoMaster,
};

export const manifest = knownManifest({
  template,
  columns: [...REQUIRED_COLUMNS, ...OPTIONAL_COLUMNS],
  commit: commitPoMaster,
});
