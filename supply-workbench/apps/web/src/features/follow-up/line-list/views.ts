import { z } from 'zod';

export function presetViews(): readonly { readonly id: string; readonly label: string; readonly query: string }[] {
  return [
    { id: 'mine-overdue', label: '我的逾期', query: 'buyer=me&overdue=1' },
    { id: 'no-batch', label: '未建要货', query: 'stage=no_batch' },
    { id: 'yinong', label: '宜侬在途', query: 'q=宜侬' },
  ];
}

export function viewKey(userId: string): string {
  return `sw.line-views.${userId}`;
}

export function saveView({ storage, userId, view }: { readonly storage: Storage; readonly userId: string; readonly view: { readonly id: string; readonly label: string; readonly query: string } }): void {
  const current = loadViews(storage, userId).filter((item) => item.id !== view.id);
  storage.setItem(viewKey(userId), JSON.stringify([...current, view]));
}

export function loadViews(storage: Storage, userId: string): { readonly id: string; readonly label: string; readonly query: string }[] {
  const raw = storage.getItem(viewKey(userId));
  if (raw === null) return [];
  return savedViews(raw);
}

export function hintSkipText(skips: readonly { readonly lineId: string; readonly reason: string }[]): string[] {
  return skips.map((skip) => `${skip.lineId}：${skip.reason}`);
}

const savedViewsSchema = z.array(z.object({
  id: z.string(),
  label: z.string(),
  query: z.string(),
}).strict());

function savedViews(raw: string): { readonly id: string; readonly label: string; readonly query: string }[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    const result = savedViewsSchema.safeParse(parsed);
    if (!result.success) return [];
    return result.data;
  } catch {
    return [];
  }
}
