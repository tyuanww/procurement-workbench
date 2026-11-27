import type { EntityId } from './values/ids.js';
import type { LocalDate } from './values/local-date.js';

export const PRODUCT_DEVELOPMENT_STORES = ['dafuyan', 'yiling'] as const;
export type ProductDevelopmentStore = (typeof PRODUCT_DEVELOPMENT_STORES)[number];

export const DEVELOPMENT_PROJECT_STAGES = ['development', 'ordered', 'received'] as const;
export type DevelopmentProjectStage = (typeof DEVELOPMENT_PROJECT_STAGES)[number];

export type DevelopmentProgressDate = { readonly raw: string; readonly date?: LocalDate };

export type DevelopmentProgressSource = {
  readonly fileName: string;
  readonly sheet: string;
  readonly row: number;
  readonly cells: readonly {
    readonly address: string; readonly label: string; readonly raw: string; readonly display?: string; readonly formula?: string;
  }[];
};

export type DevelopmentProgressFacts = {
  readonly confirmedStage: DevelopmentProjectStage | null;
  readonly currentNote?: string;
  readonly requirement?: DevelopmentProgressDate;
  readonly forecast?: DevelopmentProgressDate;
  readonly contacts?: string;
};

export type DevelopmentWaiting =
  | { readonly kind: 'unknown' }
  | { readonly kind: 'none' }
  | { readonly kind: 'waiting'; readonly party?: string; readonly deliverable?: string };

export type DevelopmentFollowUpInput = {
  readonly nextAction?: string;
  readonly managementDecision?: string;
  readonly waiting: DevelopmentWaiting;
  readonly reviewOn?: LocalDate;
};

export type DevelopmentFollowUp = DevelopmentFollowUpInput & { readonly updatedBy: EntityId; readonly updatedAt: string };

export type DevelopmentProgressDraft = DevelopmentProgressFacts & { readonly source?: DevelopmentProgressSource };
export type DevelopmentProgressUpdate = DevelopmentProgressFacts & { readonly followUp?: DevelopmentFollowUpInput };
export type DevelopmentProgress = DevelopmentProgressDraft & { readonly followUp?: DevelopmentFollowUp };

export const DEVELOPMENT_DESTINATIONS = [
  'pilot_material_to_factory',
  'packaging_to_factory',
  'finished_to_warehouse',
  'other',
] as const;
export type DevelopmentDestination = (typeof DEVELOPMENT_DESTINATIONS)[number];

export const DEVELOPMENT_DESTINATION_LABELS: Readonly<Record<DevelopmentDestination, string>> = {
  pilot_material_to_factory: '中试原料到厂',
  packaging_to_factory: '包材到加工厂',
  finished_to_warehouse: '成品入仓',
  other: '其他开发节点',
};

export function isFactoryDevelopmentDestination(destination: DevelopmentDestination): boolean {
  return destination === 'pilot_material_to_factory' || destination === 'packaging_to_factory';
}
