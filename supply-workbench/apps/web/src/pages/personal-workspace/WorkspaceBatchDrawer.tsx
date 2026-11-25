import { App } from 'antd';
import { useEffect, useRef, useState } from 'react';
import type { TodoItemView } from '@sw/contracts';
import { faceOf } from '../../features/today/index.js';
import { fetchPersonalToday } from '../../shared/api/catalog.js';
import { useCanWrite } from '../../shared/actor.js';
import { TodayDrawer } from '../today/TodayDrawer.js';
import { formErrors, noteDraft, type NoteRef, type OpenForm } from '../today/TodayForms.js';
import { toBoardItem } from '../today/card.js';
import { localFollowUpTime } from '../today/follow-up-time.js';
import { saveTodayNote } from '../today/save-today-note.js';
import { workspaceScopeOf } from './ProcurementWorkspaceViews.js';
import type { SavedLocation } from './personal-query.js';

type DrawerProps = {
  readonly item: TodoItemView | undefined;
  readonly asOf: string | undefined;
  readonly onClose: () => void;
  readonly onSaved: (location: SavedLocation) => void;
};

type BatchItem = TodoItemView & { readonly batch: NonNullable<TodoItemView['batch']>; readonly line: NonNullable<TodoItemView['line']> };

export function WorkspaceBatchDrawer({ item, asOf, onClose, onSaved }: DrawerProps) {
  if (item === undefined || item.batch === null || item.line === null || asOf === undefined) return null;
  return <BatchDrawer key={item.id} item={{ ...item, batch: item.batch, line: item.line }} asOf={asOf} onClose={onClose} onSaved={onSaved} />;
}

function BatchDrawer({ item, asOf, onClose, onSaved }: Pick<DrawerProps, 'onClose' | 'onSaved'> & { readonly item: BatchItem; readonly asOf: string }) {
  const target = { lineId: item.line.id, batchId: item.batch.id };
  const nextFollowUpAt = item.batch.nextFollowUpAt;
  const { draft, isSaving, saveError, setDraft, submit } = useBatchFollowUp({ target, itemId: item.id, nextFollowUpAt, asOf, onSaved });
  const face = faceOf(toBoardItem(item));
  const row = { id: item.id, face: { ...face, date: item.dueDate === null ? face.date : `采购确认到仓日 ${item.dueDate}` },
    actions: [{ kind: 'note', label: '记跟进' }] } satisfies NonNullable<Parameters<typeof TodayDrawer>[0]['row']>;
  return <TodayDrawer row={row} batchSeq={item.batch.seq} fulfillment={item.batch.fulfillment} isOpen keyboard
    detail={{ kind: 'order', order: target, exception: null }} draft={draft} hadDate={item.batch.firstConfirmedDate !== null}
    lane={item.line.lane} isSaving={isSaving} saveError={saveError} onClose={() => { if (!isSaving) onClose(); }}
    onDraft={setDraft} onQuick={() => setDraft(noteDraft({ canScheduleFollowUp: true, ...(nextFollowUpAt === undefined ? {} : { nextFollowUpAt }) }))}
    onSubmit={() => { void submit(); }} />;
}

type FollowUpInput = Pick<DrawerProps, 'onSaved'> & {
  readonly target: NoteRef;
  readonly itemId: string;
  readonly asOf: string;
  readonly nextFollowUpAt: string | undefined;
};

function useBatchFollowUp({ target, itemId, asOf, nextFollowUpAt, onSaved }: FollowUpInput) {
  const [draft, setDraft] = useState<OpenForm | null>(null);
  const [saveError, setSaveError] = useState('');
  const [isSaving, setSaving] = useState(false);
  const checking = useRef<AbortController | null>(null);
  useEffect(() => () => checking.current?.abort(), []);
  const canRecord = useCanWrite('records.write');
  const { message } = App.useApp();
  async function submit() {
    if (!canRecord || draft?.kind !== 'note' || checking.current !== null || formErrors({ draft, hadDate: true, today: asOf }).length > 0) return;
    const request = new AbortController();
    checking.current = request;
    setSaving(true);
    setSaveError('');
    try {
      await saveTodayNote({ draft, target, nextFollowUpAt });
    } catch (error) {
      if (request.signal.aborted) return;
      checking.current = null;
      setSaving(false);
      setSaveError(error instanceof Error ? error.message : '保存失败，请重试');
      return;
    }
    const location = await locateSaved(itemId, request.signal);
    if (request.signal.aborted) return;
    void message.success('已记跟进');
    onSaved(location);
  }
  return { draft, isSaving, saveError, setDraft, submit };
}

async function locateSaved(id: string, signal: AbortSignal): Promise<SavedLocation> {
  const params = new URLSearchParams({ scope: 'all', focusId: id, pageSize: '1' });
  try {
    const result = await fetchPersonalToday(params.toString(), signal);
    const item = result.items.find((row) => row.id === id);
    if (item === undefined) return { id, scope: 'all', date: result.asOf };
    const scope = workspaceScopeOf(item);
    const date = scope === 'scheduled' ? localFollowUpTime(item.batch?.nextFollowUpAt).split('T')[0] : result.asOf;
    return { id, scope, date: date ?? result.asOf };
  } catch {
    return { id, scope: 'all', date: '' };
  }
}
