import { Button, Modal } from 'antd';
import { Fragment, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import type { Saved } from './product-development-forms.js';

export function DevelopmentEditModal({ title, primary, onSaved, children }: {
  readonly title: string;
  readonly primary?: boolean;
  readonly onSaved: Saved;
  readonly children: (saved: Saved) => ReactNode;
}): ReactNode {
  const trigger = useRef<ComponentRef<typeof Button>>(null);
  const [isOpen, setOpen] = useState(false);
  const [revision, setRevision] = useState(0);
  const needsReset = useRef(false);

  function show() {
    if (needsReset.current) {
      needsReset.current = false;
      setRevision((value) => value + 1);
    }
    setOpen(true);
  }

  function saved(id: string) {
    needsReset.current = true;
    setOpen(false);
    onSaved(id);
  }

  return <>
    <Button ref={trigger} type={primary ? 'primary' : 'default'} aria-haspopup="dialog" onClick={show}>{title}</Button>
    <Modal title={title} open={isOpen} footer={null} onCancel={() => setOpen(false)}
      focusable={{ focusTriggerAfterClose: false }} afterClose={() => {
        if (!needsReset.current || document.activeElement === document.body) trigger.current?.focus({ preventScroll: true });
      }}>
      <Fragment key={revision}>{children(saved)}</Fragment>
    </Modal>
  </>;
}
