import { Card, Flex, Segmented, Tag, Typography } from 'antd';
import type { ReactNode } from 'react';
import type { GroupMode } from '../../features/today/index.js';
import { space } from '../../theme/tokens.js';

export function TodayGrouping(props: {
  readonly label: string;
  readonly modes: readonly { readonly id: GroupMode; readonly label: string }[];
  readonly group: GroupMode;
  readonly onGroup: (group: GroupMode) => void;
}): ReactNode {
  return <Segmented<GroupMode>
    aria-label={props.label}
    options={props.modes.map(({ id, label }) => ({ value: id, label }))}
    value={props.group}
    onChange={props.onGroup}
  />;
}

export function TodayGroup(props: {
  readonly name: string;
  readonly counts: readonly { readonly label: string; readonly count: number }[];
  readonly action?: ReactNode;
  readonly children: ReactNode;
}): ReactNode {
  return <Card size="small" style={{ marginBottom: space[2] }} styles={{ title: { whiteSpace: 'normal', paddingBlock: space[1] } }}
    title={<Flex className="today-touch" align="center" gap={space[1]} wrap>
      <Typography.Title level={3} style={{ margin: 0, overflowWrap: 'anywhere' }}>{props.name}</Typography.Title>
      {props.counts.map(({ label, count }) => <Tag key={label} style={{ marginInlineEnd: 0 }}>{label} {count}</Tag>)}
      {props.action}
    </Flex>}>
    {props.children}
  </Card>;
}
