import { openDraft, type NoteRef, type OpenForm, type Target } from '../../features/today/index.js';

export function openQuick(input: {
  readonly id: string;
  readonly kind: OpenForm['kind'];
  readonly targets: Readonly<Record<string, Target>>;
  readonly noteRefs: Readonly<Record<string, NoteRef>>;
  readonly setFocus: (id: string) => void;
  readonly setDraft: (draft: OpenForm | null) => void;
  readonly setDrawerId: (id: string) => void;
  readonly setSaveError: (message: string) => void;
}): void {
  input.setSaveError('');
  input.setDrawerId(input.id);
  if (input.targets[input.id] !== undefined) {
    openDraft({ id: input.id, kind: input.kind, targets: input.targets, setFocus: input.setFocus, setDraft: input.setDraft });
    return;
  }
  openNoteOnly(input);
}

function openNoteOnly(input: {
  readonly id: string;
  readonly kind: OpenForm['kind'];
  readonly noteRefs: Readonly<Record<string, NoteRef>>;
  readonly setFocus: (id: string) => void;
  readonly setDraft: (draft: OpenForm | null) => void;
}): void {
  if (input.kind !== 'note') return;
  const ref = input.noteRefs[input.id];
  if (ref === undefined) return;
  input.setFocus(input.id);
  input.setDraft({ kind: 'note', text: '', followKind: 'call' });
}
