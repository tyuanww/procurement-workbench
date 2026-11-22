export function feishuButton(configured: boolean): { readonly disabled: boolean; readonly hint: string } {
  if (configured) return { disabled: false, hint: '' };
  return { disabled: true, hint: '没配置飞书应用' };
}

export function printStyle(): string {
  return '@page { size: A4 landscape; } .report-print { break-inside: avoid; }';
}
