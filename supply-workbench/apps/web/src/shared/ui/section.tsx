import { Flex, Typography } from 'antd';
import type { ReactNode } from 'react';
import { border, space, text } from '../../theme/tokens.js';

export function SectionGroup(input: { readonly title: string; readonly meta?: ReactNode; readonly action?: ReactNode; readonly children: ReactNode }): ReactNode {
  return (
    <section style={{ marginBottom: space[5] }}>
      <Flex align="baseline" wrap gap={space[1]} style={{ marginBottom: space[2] }}>
        <Typography.Title level={2} style={{ margin: 0 }}>{input.title}</Typography.Title>
        {input.meta === undefined ? null : <Typography.Text type="secondary">{input.meta}</Typography.Text>}
        {input.action}
      </Flex>
      {input.children}
    </section>
  );
}

export function SectionRow(input: { readonly children: ReactNode; readonly action?: ReactNode }): ReactNode {
  return (
    <Flex justify="space-between" align="center" gap={space[3]} wrap style={{ padding: `${space[2]}px 0`, borderBottom: `1px solid ${border}`, color: text.primary }}>
      <div style={{ minWidth: 0, flex: '1 1 auto' }}>{input.children}</div>
      {input.action}
    </Flex>
  );
}
