export type CarryLink = {
  readonly linkedOrderLineId: string;
  readonly linkStatus: 'linked' | 'manual';
  readonly linkReason: string | null;
};

export type AssignedFingerprint = {
  readonly value: string;
  readonly fromFile: boolean;
};

/** 指纹写在解析行自己身上。不按文件清单或读库顺序配对。 */
export function fingerprintOnRow(row: { readonly id: string; readonly parsed: unknown }): AssignedFingerprint {
  const stored = storedFingerprint(row.parsed);
  return stored === null ? { value: `row:${row.id}`, fromFile: false } : { value: stored, fromFile: true };
}

function storedFingerprint(parsed: unknown): string | null {
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
  if (!('fingerprint' in parsed) || typeof parsed.fingerprint !== 'string' || parsed.fingerprint === '') return null;
  return parsed.fingerprint;
}

export function linksToCarry(input: {
  readonly current: readonly { readonly fingerprint: AssignedFingerprint; readonly sheetName: string; readonly rowNo: number; readonly unchanged: boolean }[];
  readonly previous: readonly { readonly fingerprint: string; readonly sheetName: string; readonly rowNo: number; readonly link: CarryLink | null }[];
}): (CarryLink | null)[] {
  return input.current.map((row) => row.unchanged ? carriedFor(row, input) : null);
}

function carriedFor(
  row: { readonly fingerprint: AssignedFingerprint; readonly sheetName: string; readonly rowNo: number },
  input: { readonly current: readonly { readonly fingerprint: AssignedFingerprint; readonly sheetName: string; readonly rowNo: number; readonly unchanged: boolean }[]; readonly previous: readonly { readonly fingerprint: string; readonly sheetName: string; readonly rowNo: number; readonly link: CarryLink | null }[] },
): CarryLink | null {
  if (row.fingerprint.fromFile) return uniqueFingerprint(input.previous, row.fingerprint.value);
  return uniquePlace(row, input);
}

function uniqueFingerprint(previous: readonly { readonly fingerprint: string; readonly link: CarryLink | null }[], fingerprint: string): CarryLink | null {
  const links = previous.flatMap((item) => item.fingerprint === fingerprint && item.link !== null ? [item.link] : []);
  return links.length === 1 ? links[0] ?? null : null;
}

function uniquePlace(
  row: { readonly sheetName: string; readonly rowNo: number },
  input: { readonly current: readonly { readonly fingerprint: AssignedFingerprint; readonly sheetName: string; readonly rowNo: number; readonly unchanged: boolean }[]; readonly previous: readonly { readonly sheetName: string; readonly rowNo: number; readonly link: CarryLink | null }[] },
): CarryLink | null {
  const key = placeKey(row);
  const currentCount = input.current.filter((item) => item.unchanged && !item.fingerprint.fromFile && placeKey(item) === key).length;
  const links = input.previous.flatMap((item) => placeKey(item) === key && item.link !== null ? [item.link] : []);
  if (currentCount !== 1 || links.length !== 1) return null;
  return links[0] ?? null;
}

function placeKey(row: { readonly sheetName: string; readonly rowNo: number }): string {
  return `${row.sheetName}#${row.rowNo}`;
}
