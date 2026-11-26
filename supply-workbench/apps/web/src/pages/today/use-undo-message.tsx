import { useEffect, useRef } from 'react';
import { App, Button } from 'antd';
import { useCanWrite } from '../../shared/actor.js';
import type { Undo } from '../../features/today/index.js';

const UNDO_KEY = 'today-undo';
const UNDO_SECONDS = 10;

export function useUndoMessage(input: { readonly undo: Undo | null; readonly onRestore: () => void }): void {
  const { message } = App.useApp();
  const canRecord = useCanWrite('records.write');
  const restore = useRef(input.onRestore);
  restore.current = input.onRestore;
  useEffect(() => {
    if (input.undo === null) {
      message.destroy(UNDO_KEY);
      return undefined;
    }
    message.open({
      key: UNDO_KEY,
      type: 'info',
      duration: UNDO_SECONDS,
      content: (
        <span>
          {input.undo.label}
          {canRecord ? <Button type="link" size="small" onClick={() => restore.current()}>撤销</Button> : null}
        </span>
      ),
    });
    return () => { message.destroy(UNDO_KEY); };
  }, [input.undo, message]);
}
