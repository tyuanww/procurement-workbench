import type { ImportTemplate } from '../../../../application/src/ports/import-template.js';
import { commitPlannerSheet } from '../../../../application/src/imports/commit/planner-sheet-v1.js';
import { PLANNER_SHEET_COLUMNS } from './columns.js';
import { detectPlannerSheet } from './detect.js';
import { diffPlannerSheet } from './diff.js';
import { parsePlannerSheet, type PlannerSheetParsed } from './parse.js';
import { fingerprintExisting } from '../plain.js';
import { plannerIdentity } from './identity.js';
import { knownManifest } from '../manifest.js';

export const template: ImportTemplate<PlannerSheetParsed> = {
  id: 'planner-sheet-v1',
  requiresFactory: false,
  identityOf: plannerIdentity,
  existingFrom: fingerprintExisting,
  factsOf() {
    return { ignoredSheets: [], codeLinks: [] };
  },
  detect: detectPlannerSheet,
  parse: parsePlannerSheet,
  diff: diffPlannerSheet,
};

export const manifest = knownManifest({ template, columns: PLANNER_SHEET_COLUMNS, commit: commitPlannerSheet });
