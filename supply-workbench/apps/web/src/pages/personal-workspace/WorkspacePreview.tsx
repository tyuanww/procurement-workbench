import { Alert, App, Button, Flex, Skeleton } from 'antd';
import { useState } from 'react';
import { Link, useOutletContext } from 'react-router';
import { WorkbenchPage } from '../../shared/ui/page.js';
import { space } from '../../theme/tokens.js';
import { TaskPanel } from './TaskPanel.js';
import { WorkspaceEditor } from './WorkspaceEditor.js';
import { WorkspaceMetrics } from './WorkspaceMetrics.js';
import type { MetricScope, WorkspaceEntry } from './workspace-model.js';
import { usePersonalWorkspace } from './use-personal-workspace.js';

export function WorkspacePreview() {
  const { userId } = useOutletContext<{ readonly userId: string }>();
  return <Workspace key={userId} userId={userId} />;
}

function Workspace({ userId }: { readonly userId: string }) {
  const { today, records, reload, save } = usePersonalWorkspace(userId);
  return (
    <WorkbenchPage title="个人工作台合成预览" secondary={`业务日 ${today} · 合成预览，修改保存在当前浏览器的本账号下`}
      action={<Link to="/today/personal">返回个人工作台</Link>}>
      {records.kind === 'ready' ? <WorkspaceBody entries={records.entries} today={today} onSave={save} /> :
        records.kind === 'loading' ? <Skeleton active /> :
        <Alert type="error" showIcon title="无法读取当前浏览器的个人工作台记录" action={<Button onClick={reload}>重试</Button>} />}
    </WorkbenchPage>
  );
}

type BodyProps = { readonly entries: readonly WorkspaceEntry[]; readonly today: string; readonly onSave: (entry: WorkspaceEntry) => void };

function WorkspaceBody({ entries, today, onSave }: BodyProps) {
  const { message } = App.useApp();
  const [scope, setScope] = useState<MetricScope>('all');
  const [editor, setEditor] = useState<WorkspaceEntry | null>(null);
  const tasks = entries.filter((e) => e.kind === 'task').map((e) => e.item);
  const events = entries.filter((e) => e.kind === 'event').map((e) => e.item);
  function openById(id: string) {
    const entry = entries.find((record) => record.item.id === id);
    if (entry !== undefined) setEditor(entry);
  }
  function save(entry: WorkspaceEntry) {
    try {
      onSave(entry);
      setEditor(null);
      void message.success(entry.kind === 'task' ? '任务已保存' : '日程已保存');
    } catch {
      void message.error('保存失败，请检查浏览器存储空间后重试');
    }
  }
  return (
    <Flex vertical gap={space[3]}>
      <WorkspaceMetrics tasks={tasks} today={today} scope={scope} onScope={setScope} />
      <TaskPanel tasks={tasks} events={events} today={today} scope={scope} onScope={setScope}
        onOpen={openById} onOpenEvent={openById} />
      {editor === null ? null : <WorkspaceEditor key={editor.item.id} entry={editor} onSave={save} onClose={() => setEditor(null)} />}
    </Flex>
  );
}
