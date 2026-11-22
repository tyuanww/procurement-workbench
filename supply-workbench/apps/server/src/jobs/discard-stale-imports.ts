export function discardStaleImportsTrigger(run: () => Promise<void>): { readonly name: string; readonly cron: string; readonly run: () => Promise<void> } {
  return { name: 'discard-stale-imports', cron: '0 3 * * *', run };
}
