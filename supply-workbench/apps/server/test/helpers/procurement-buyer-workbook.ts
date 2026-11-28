import { createRequire } from 'node:module';
import { must } from './procurement-import.js';

const { unzipSync, zipSync } = createRequire(new URL('../../../../packages/importers/package.json', import.meta.url))('fflate');

export function workbookWithBuyer(original: Buffer, kind: 'mention' | 'literal'): Buffer {
  const files: Record<string, Uint8Array> = unzipSync(original);
  const sheetPath = 'xl/worksheets/sheet2.xml';
  const stringsPath = 'xl/sharedStrings.xml';
  const sheet = Buffer.from(must(files[sheetPath])).toString();
  const buyerCell = kind === 'mention'
    ? '<x:c r="I5" s="7" t="s"><x:v>0</x:v></x:c>'
    : '<x:c r="I5" s="7" t="str"><x:v>@测试采购员 C</x:v></x:c>';
  files[sheetPath] = Buffer.from(sheet.replace(
    '<x:c r="I5" s="7" t="str"><x:v>测试采购员 C</x:v></x:c>',
    buyerCell,
  ));
  if (kind === 'mention') {
    files[stringsPath] = Buffer.from(
      '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><t></t><r><rPr><u val="single"/></rPr><t xml:space="preserve">@测试采购员 </t></r><r><t>&#67;</t></r><rPh sb="0" eb="2"><t>注音</t></rPh></si></sst>',
    );
  }
  return Buffer.from(zipSync(files));
}
