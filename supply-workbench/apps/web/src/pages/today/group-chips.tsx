import { Tag } from 'antd';
import type { ReactNode } from 'react';
import type { GroupMode } from '../../features/today/index.js';
import { chipRowStyle } from './today-style.js';

export function GroupChips(props: {
  readonly modes: readonly { readonly id: GroupMode; readonly label: string }[];
  readonly group: GroupMode;
  readonly onGroup: (group: GroupMode) => void;
}): ReactNode {
  return (
    <div style={chipRowStyle()}>
      {props.modes.map((mode) => (
        <Tag.CheckableTag key={mode.id} checked={props.group === mode.id} onChange={() => props.onGroup(mode.id)}>{mode.label}</Tag.CheckableTag>
      ))}
    </div>
  );
}
