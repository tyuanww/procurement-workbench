import type { OwnerMapParsed } from '../../../../application/src/ports/parsed-rows.js';
import type { ImportTemplate } from '../../../../application/src/ports/import-template.js';
import { commitOwnerMap } from '../../../../application/src/imports/commit/owner-map-v1.js';
import { plainIdentity } from '../plain.js';
import { knownManifest } from '../manifest.js';
import { OWNER_MAP_COLUMNS } from './columns.js';
import { detectOwnerMap } from './detect.js';
import { diffOwnerMap } from './diff.js';
import { parseOwnerMap } from './parse.js';

export const template: ImportTemplate<OwnerMapParsed> = {
  ...plainIdentity,
  id: 'owner-map-v1',
  detect: detectOwnerMap,
  parse: parseOwnerMap,
  diff: diffOwnerMap,
};

export const manifest = knownManifest({ template, columns: OWNER_MAP_COLUMNS, commit: commitOwnerMap });
