import type { CSSProperties, ReactNode } from 'react';
import { Typography } from 'antd';
import { border, space } from '../../theme/tokens.js';

export function SettingsGroup(input: { readonly title: string; readonly children: ReactNode }) {
  return (
    <section style={{ marginBottom: space[5] }}>
      <Typography.Title level={2} style={{ margin: 0, marginBottom: space[3] }}>
        {input.title}
      </Typography.Title>
      {input.children}
    </section>
  );
}

export function formStyle(): CSSProperties {
  return { maxWidth: 560, width: '100%' };
}
export function rowStyle(): CSSProperties {
  return { padding: `${space[2]}px 0`, borderBottom: `1px solid ${border}` };
}
