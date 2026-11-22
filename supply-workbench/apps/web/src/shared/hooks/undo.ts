export const UNDO_SECONDS = 10;

export type UndoNotice = {
  readonly id: string;
  readonly text: string;
  readonly seconds: number;
};

export function tickUndo(notice: UndoNotice): UndoNotice | null {
  if (notice.seconds <= 1) return null;
  return { ...notice, seconds: notice.seconds - 1 };
}
