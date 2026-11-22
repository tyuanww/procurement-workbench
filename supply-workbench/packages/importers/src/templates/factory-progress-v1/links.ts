import type { PendingCodeLink } from '../../../../application/src/ports/parsed-rows.js';

export function codeLink(input: { readonly sheetName: string; readonly rowNo: number; readonly from: string | null; readonly to: string | null }): PendingCodeLink | null {
  if (input.from === null || input.to === null || input.from === '' || input.to === '') return null;
  return { fromCodeRaw: input.from, toCodeRaw: input.to, sheetName: input.sheetName, rowNo: input.rowNo };
}

export function presentLinks(links: readonly (PendingCodeLink | null)[]): PendingCodeLink[] {
  return links.filter(isLink);
}

function isLink(link: PendingCodeLink | null): link is PendingCodeLink {
  return link !== null;
}
