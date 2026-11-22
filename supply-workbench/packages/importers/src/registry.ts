import type { TemplateId } from '@sw/domain';
import type { CommitExecutor } from '../../application/src/imports/commit/context.js';
import type { ImportTemplate } from '../../application/src/ports/import-template.js';
import type { TemplateManifest } from './templates/manifest.js';
import { manifest as bom } from './templates/bom-v1/index.js';
import { manifest as factoryProgress } from './templates/factory-progress-v1/index.js';
import { manifest as ownerMap } from './templates/owner-map-v1/index.js';
import { manifest as plannerSheet } from './templates/planner-sheet-v1/index.js';
import { manifest as poMaster } from './templates/po-master-v1/index.js';
import { manifest as productArchive } from './templates/product-archive-v1/index.js';
import { manifest as batchConfirmedArrivalV1 } from './templates/batch-confirmed-arrival-v1/index.js';

const byId = {
  'po-master-v1': poMaster,
  'factory-progress-v1': factoryProgress,
  'product-archive-v1': productArchive,
  'bom-v1': bom,
  'owner-map-v1': ownerMap,
  'planner-sheet-v1': plannerSheet,
  'batch-confirmed-arrival-v1': batchConfirmedArrivalV1,
} satisfies Record<TemplateId, TemplateManifest>;

const manifests: readonly TemplateManifest[] = Object.values(byId);
const installed = installTemplateManifests(manifests);

export const importManifests = manifests;
export const templates: readonly ImportTemplate[] = installed.templates;
export const importCommitExecutors: readonly CommitExecutor[] = installed.executors;

export function installTemplateManifests(items: readonly TemplateManifest[]): { readonly templates: readonly ImportTemplate[]; readonly executors: readonly CommitExecutor[] } {
  validateManifests(items);
  const templates: ImportTemplate[] = [];
  const executors: CommitExecutor[] = [];
  for (const item of items) addManifest({ item, templates, executors });
  return { templates, executors };
}

function validateManifests(items: readonly TemplateManifest[]): void {
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.id)) throw new Error(`模板 id 重复 ${item.id}`);
    seen.add(item.id);
    if (item.columns.length === 0) throw new Error(`模板 ${item.id} 没有列`);
    const template = item.importTemplate();
    if (template !== null && template.id !== item.id) throw new Error(`模板 ${item.id} 的 importTemplate id 不一致`);
  }
}

function addManifest(input: { readonly item: TemplateManifest; readonly templates: ImportTemplate[]; readonly executors: CommitExecutor[] }): void {
  const template = input.item.importTemplate();
  if (template === null) return;
  input.templates.push(template);
  input.executors.push({ template: template.id, run: input.item.commit });
}
