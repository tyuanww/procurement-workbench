import { useLocation, useSearchParams } from 'react-router';
import { z } from 'zod';
import { BATCH_IMPORT_SOURCE, IMPORT_RETURN_PARAM, IMPORT_SOURCE_DRAWER, PROCUREMENT_BATCH_IMPORT_SOURCE, importFollowUpBackAddress, importFollowUpScope } from '../../features/imports/index.js';
import { detailReturnState } from '../../shared/hooks/detail-return-focus.js';
import { writeUrlState } from '../../shared/hooks/url-state.js';

export const importSourceQuery = { oa: 'previewOa', finished: 'finishedPage', component: 'componentPage', candidate: 'candidatePage', arrival: 'arrivalPage' } as const;
export const importPreviewKeys = {
  drawer: null, source: null, candidates: null, ...Object.fromEntries(Object.values(importSourceQuery).map((key) => [key, null])),
};

export const ARRIVAL_SOURCE_PAGE_SIZE = 20;
const arrivalSourceKeySchema = z.tuple([z.literal('arrival'), z.string(), z.number().int().positive()]);

export function readArrivalImportSource(key: string | null) {
  if (key === null) return undefined;
  try {
    const source = arrivalSourceKeySchema.safeParse(JSON.parse(key)).data;
    if (source === undefined) return undefined;
    const [, sheetName, rowNo] = source;
    // The confirmation template retains original rows, starting at line two.
    return { sheetName, rowNo, page: Math.max(1, Math.floor((rowNo - 2) / ARRIVAL_SOURCE_PAGE_SIZE) + 1) };
  } catch {
    return undefined;
  }
}

export type SourceLocation = { readonly sheetName: string; readonly rowNo: number };

export function importSourceKey(kind: 'finished' | 'component' | 'candidate' | 'arrival', location: SourceLocation) {
  return JSON.stringify([kind, location.sheetName, location.rowNo]);
}

export function importSourceTriggerId(key: string) {
  return `import-source:${key === PROCUREMENT_BATCH_IMPORT_SOURCE ? BATCH_IMPORT_SOURCE : key}`;
}

export function useImportSource() {
  const [params, setParams] = useSearchParams();
  const { pathname, search, state } = useLocation();
  const update = (patch: Record<string, string | null>, replace = false) => setParams(writeUrlState(search, patch), { replace, state });
  return {
    params, to: pathname + search,
    sourceKey: params.get('drawer') === IMPORT_SOURCE_DRAWER ? params.get('source') : null,
    open: (key: string, patch?: Record<string, string | null>) => update({ ...patch, drawer: IMPORT_SOURCE_DRAWER, source: key }, true),
    close: () => update({ drawer: null, source: null }, true),
    update,
  };
}

export type ImportSourceState = ReturnType<typeof useImportSource>;

export function previewPage(params: URLSearchParams, key: string): number {
  const page = Number(params.get(key));
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
}

export function importBatchOrigin(state: unknown): unknown {
  const origin = readImportBatchOriginState(state);
  return origin === undefined ? state : origin.importBatchOrigin;
}

export function readImportBatchOriginState(state: unknown): { readonly importBatchOrigin: unknown } | undefined {
  if (typeof state !== 'object' || state === null || !('importBatchOrigin' in state)) return undefined;
  return { importBatchOrigin: state.importBatchOrigin };
}

export function importFollowUpReturn({ params, state, isVerifiedProcurement = false, confirmedArrival = false }: {
  readonly params: URLSearchParams;
  readonly state: unknown;
  readonly scoped?: boolean;
  readonly isVerifiedProcurement?: boolean;
  readonly confirmedArrival?: boolean;
}) {
  const back = confirmedArrival && !params.has('importBatchId')
    ? importFollowUpBackAddress(params.get(IMPORT_RETURN_PARAM)) : importFollowUpScope(params, isVerifiedProcurement);
  if (back === null) return null;
  const focus = detailReturnState(state, { detailPath: back.to, sourceLink: importSourceTriggerId(back.recordKey) });
  const origin = importBatchOrigin(state);
  const productOrigin = typeof origin === 'object' && origin !== null && 'productOrigin' in origin ? { productOrigin: origin.productOrigin } : undefined;
  return {
    to: back.to,
    label: '返回导入批次',
    state: { ...focus, importBatchOrigin: origin, ...productOrigin },
  };
}
