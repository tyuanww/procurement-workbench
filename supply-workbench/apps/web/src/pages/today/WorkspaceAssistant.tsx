import { Button, Card, Typography } from 'antd';
import { RightOutlined } from '@ant-design/icons';
import { useId, type ReactNode } from 'react';

export function WorkspaceAssistant({ title, hint, shortcuts, children }: {
  readonly title: string;
  readonly hint: string | null;
  readonly shortcuts: readonly { readonly label: string; readonly run: () => void }[];
  readonly children?: ReactNode;
}) {
  const titleId = useId();
  return <aside className="today-action-shortcuts today-assistant" aria-labelledby={titleId}>
    <Card size="small" title={<Typography.Title level={2} id={titleId}>{title}</Typography.Title>} styles={{ body: { padding: 0 } }}>
      {hint === null ? null : <p className="today-assistant-hint">{hint}</p>}
      {shortcuts.length === 0 ? null : <div className="today-assistant-prompts today-touch">
        <Typography.Title level={3}>快捷处理</Typography.Title>
        {shortcuts.map(({ label, run }) => <Button key={label} block onClick={run}>
          {label}<RightOutlined aria-hidden />
        </Button>)}
      </div>}
      {children}
    </Card>
  </aside>;
}
