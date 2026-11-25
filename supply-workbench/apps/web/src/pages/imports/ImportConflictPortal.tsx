import { useEffect, useState } from 'react';
import { ImportBatchSummarySchema, ImportRowViewSchema, listResponseSchema, type ImportBatchSummary, type ImportRowView } from '@sw/contracts';
import { apiErrorMessage, apiGet, apiSend } from '../../shared/api/client.js';
import { failureText, read, readFailureOf } from '../../shared/api/reads.js';
import {
  allConflictChoices,
  conflictCandidateOf,
  conflictChoicesOf,
  conflictQueryOf,
  type ConflictCandidate,
} from '../../features/imports/index.js';
import { decisionsWithConflictResolutions } from '../../features/imports/index.js';
import { ImportConflictDrawer } from './ImportConflictDrawer.js';

export function ImportConflictPortal({ isOpen, ...props }: {
  readonly id: string;
  readonly summary: ImportBatchSummary;
  readonly setSummary: (summary: ImportBatchSummary) => void;
  readonly isOpen: boolean;
  readonly onClose: () => void;
}) {
  const [rows, setRows] = useState<readonly ImportRowView[]>([]);
  const [candidates, setCandidates] = useState<Readonly<Record<string, readonly ConflictCandidate[]>>>({});
  const [choices, setChoices] = useState<Readonly<Record<string, string>>>({});
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [request, setRequest] = useState<ConflictRequest>({ kind: 'idle' });
  useEffect(() => {
    if (!isOpen) return;
    setPage(1);
    setTotal(0);
    setChoices({});
    setRequest({ kind: 'loading' });
    void loadConflicts({ id: props.id, page: 1, decisions: props.summary.decisions, currentChoices: {}, setRows, setCandidates, setChoices, setTotal, setRequest });
  }, [isOpen, props.id, props.summary.revision]);
  const onPageChange = (nextPage: number) => {
    setPage(nextPage);
    setRequest({ kind: 'loading' });
    void loadConflicts({ id: props.id, page: nextPage, decisions: props.summary.decisions, currentChoices: choices, setRows, setCandidates, setChoices, setTotal, setRequest });
  };
  return conflictDrawer({
    isOpen,
    rows,
    candidates,
    choices,
    request,
    page,
    total,
    onPageChange,
    onChoice: (rowId, choice) => setChoices((current) => ({ ...current, [rowId]: choice })),
    onSave: () => { void saveConflicts({ id: props.id, summary: props.summary, rows, choices, setSummary: props.setSummary, setRequest, onClose: props.onClose }); },
    onClose: props.onClose,
  });
}

function conflictDrawer(input: {
  readonly isOpen: boolean;
  readonly rows: readonly ImportRowView[];
  readonly candidates: Readonly<Record<string, readonly ConflictCandidate[]>>;
  readonly choices: Readonly<Record<string, string>>;
  readonly request: ConflictRequest;
  readonly page: number;
  readonly total: number;
  readonly onPageChange: (page: number) => void;
  readonly onChoice: (rowId: string, choice: string) => void;
  readonly onSave: () => void;
  readonly onClose: () => void;
}) {
  return <ImportConflictDrawer open={input.isOpen} rows={input.rows} candidates={input.candidates} choices={input.choices} isLoading={input.request.kind === 'loading'} isSaving={input.request.kind === 'saving'} error={input.request.kind === 'failed' ? input.request.message : ''} page={input.page} total={input.total} onPageChange={input.onPageChange} onChoice={input.onChoice} onSave={input.onSave} onClose={input.onClose} />;
}

type ConflictRequest =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'saving' }
  | { readonly kind: 'failed'; readonly message: string };

async function loadConflicts(input: {
  readonly id: string;
  readonly page: number;
  readonly decisions: ImportBatchSummary['decisions'];
  readonly currentChoices: Readonly<Record<string, string>>;
  readonly setRows: (rows: readonly ImportRowView[]) => void;
  readonly setCandidates: (candidates: Readonly<Record<string, readonly ConflictCandidate[]>>) => void;
  readonly setChoices: (choices: Readonly<Record<string, string>>) => void;
  readonly setTotal: (total: number) => void;
  readonly setRequest: (request: ConflictRequest) => void;
}) {
  try {
    const listed = await apiGet(`/api/v1/imports/${encodeURIComponent(input.id)}/rows?action=conflict&page=${input.page}&pageSize=100`, listResponseSchema(ImportRowViewSchema));
    const loaded = await Promise.all(listed.items.map(async (row) => {
      const query = conflictQueryOf(row);
      if (query === '') return { rowId: row.id, candidates: [] };
      const result = await read({ name: 'lines', query: `q=${encodeURIComponent(query)}&page=1&pageSize=200` });
      return { rowId: row.id, candidates: result.items.map(conflictCandidateOf) };
    }));
    const mapped: Record<string, readonly ConflictCandidate[]> = {};
    for (const item of loaded) mapped[item.rowId] = item.candidates;
    input.setRows(listed.items);
    input.setCandidates(mapped);
    input.setChoices({ ...input.currentChoices, ...conflictChoicesOf({ rows: listed.items, decisions: input.decisions }) });
    input.setTotal(listed.page.total);
    input.setRequest({ kind: 'idle' });
  } catch (error) {
    const failure = readFailureOf(error);
    if (failure === null) throw error;
    input.setRequest({ kind: 'failed', message: failureText(failure) });
  }
}

async function saveConflicts(input: {
  readonly id: string;
  readonly summary: ImportBatchSummary;
  readonly rows: readonly ImportRowView[];
  readonly choices: Readonly<Record<string, string>>;
  readonly setSummary: (summary: ImportBatchSummary) => void;
  readonly setRequest: (request: ConflictRequest) => void;
  readonly onClose: () => void;
}) {
  if (!allConflictChoices({ rows: input.rows, choices: input.choices })) return;
  input.setRequest({ kind: 'saving' });
  try {
    const summary = await apiSend({
      path: `/api/v1/imports/${encodeURIComponent(input.id)}/decisions`,
      method: 'PUT',
      body: { ...decisionsWithConflictResolutions({ decisions: input.summary.decisions, rows: input.rows, choices: input.choices }), expectedRevision: input.summary.revision },
      headers: { 'Idempotency-Key': `decide:${input.id}:${input.summary.revision}` },
      schema: ImportBatchSummarySchema,
    });
    input.setSummary(summary);
    input.setRequest({ kind: 'idle' });
    input.onClose();
  } catch (error) {
    if (apiErrorMessage(error) === undefined) throw error;
    input.setRequest({ kind: 'failed', message: '冲突处理没有保存。' });
  }
}
