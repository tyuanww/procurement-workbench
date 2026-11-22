import type { ReactNode } from 'react';
import { Button } from 'antd';
import type { OrderLineRow } from '@sw/contracts';
import { lineCell, type LineCell, type LineColumnKey } from '../../../features/follow-up/index.js';
import { MissingValue, presentRaw } from '../../../shared/ui/widgets.js';
import { partyPreviewRoleLabel, partyPreviewTarget, type OpenParty } from './party-preview.js';

export const previewButtonStyle = {
  height: 22,
  lineHeight: '20px',
  paddingInline: 3,
} as const;

const partyDeskStyle = { height: 32, paddingInline: 8 } as const;
const partyTouchStyle = { height: 44, paddingInline: 12 } as const;

export function renderLineCell(input: {
  readonly column: LineColumnKey;
  readonly row: OrderLineRow;
  readonly now: Date;
  readonly numeric?: boolean;
  readonly touch?: boolean;
  readonly onOpenParty?: (opened: OpenParty) => void;
}): ReactNode {
  const body = lineCellNode(lineCell({ column: input.column, row: input.row, now: input.now }));
  const shown = input.numeric === true ? <span style={{ fontVariantNumeric: 'tabular-nums' }}>{body}</span> : body;
  if (input.onOpenParty === undefined) return shown;
  const opened = partyPreviewTarget({ column: input.column, row: input.row });
  if (opened === null) return shown;
  return <PartyPreviewTrigger text={shown} opened={opened} touch={input.touch === true} onOpen={input.onOpenParty} />;
}

function PartyPreviewTrigger(props: {
  readonly text: ReactNode;
  readonly opened: OpenParty;
  readonly touch: boolean;
  readonly onOpen: (opened: OpenParty) => void;
}): ReactNode {
  const label = partyPreviewRoleLabel(props.opened.role);
  return (
    <Button
      type="link"
      aria-label={`${label}预览`}
      style={props.touch ? partyTouchStyle : partyDeskStyle}
      onClick={() => props.onOpen(props.opened)}
    >
      {props.text}
      <span style={{ marginInlineStart: 4 }}>预览</span>
    </Button>
  );
}

export function lineCellNode(cell: LineCell): ReactNode {
  switch (cell.kind) {
    case 'link':
      return <a href={cell.href}>{cell.text}</a>;
    case 'missing':
      return <MissingValue reason={cell.reason} {...presentRaw(cell.raw)} />;
    case 'text':
      return cell.text;
    default: {
      const unreachable: never = cell;
      return unreachable;
    }
  }
}
