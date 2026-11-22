export function pagedToday<T extends { readonly counts: Readonly<Record<string, number>>; readonly items: readonly unknown[] }>(body: T) {
  return { ...body, paging: { page: 1, pageSize: 50, total: body.items.length, urgent: 0, reasonCounts: body.counts, units: [], factories: [] } };
}
