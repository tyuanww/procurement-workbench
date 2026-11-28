import { useLocation, useSearchParams } from 'react-router';
import { IMPORT_RETURN_PARAM, IMPORT_SOURCE_DRAWER, importFollowUpBackAddress, importFollowUpScope } from '../../features/imports/index.js';
import { detailReturnState } from '../../shared/hooks/detail-return-focus.js';
import { writeUrlState } from '../../shared/hooks/url-state.js';

export const importSourceQuery = { oa: 'previewOa', finished: 'finishedPage', component: 'componentPage', candidate: 'candidatePage', arrival: 'arrivalPage' } as const;
export const importPreviewKeys = {
  drawer: null, source: null, candidates: null, ...Object.fromEntries(Object.values(importSourceQuery).map((key) => [key, null])),
};

export type SourceLocation = { readonly sheetName: string; readonly rowNo: number };

export function importSourceKey(kind: 'finished' | 'component' | 'candidate' | 'arrival', location: SourceLocation) {
  return JSON.stringify([kind, location.sheetName, location.rowNo]);
}

export function importSourceTriggerId(key: string) {
  return `import-source:${key}`;
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

export function importFollowUpReturn({ params, state, scoped = false }: {
  readonly params: URLSearchParams;
  readonly state: unknown;
  readonly scoped?: boolean;
}) {
  const back = scoped ? importFollowUpScope(params) : importFollowUpBackAddress(params.get(IMPORT_RETURN_PARAM));
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
