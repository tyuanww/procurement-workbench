import { Button, Dropdown, type ButtonProps, type MenuProps } from 'antd';
import { useCallback, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from 'react';

export function WorkspaceMenu({ trigger, button, menu, children }: {
  readonly trigger: RefObject<HTMLButtonElement | null>;
  readonly button: ButtonProps;
  readonly menu: Pick<MenuProps, 'items' | 'selectable' | 'selectedKeys' | 'onClick'>;
  readonly children: ReactNode;
}) {
  const [isOpen, setOpen] = useState(false);
  const popup = useRef<HTMLDivElement | null>(null);
  // Move focus on mount so a delayed autofocus cannot run after Escape.
  const focusMountedMenu = useCallback((node: HTMLDivElement | null) => {
    popup.current = node;
    if (isOpen) node?.querySelector<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])')?.focus({ preventScroll: true });
  }, [isOpen]);

  function changeOpen(next: boolean) {
    if (popup.current !== null) popup.current.inert = !next;
    setOpen(next);
  }
  function closeAndFocus() {
    changeOpen(false);
    trigger.current?.focus({ preventScroll: true });
  }
  function leaveMenu(event: KeyboardEvent<HTMLElement>) {
    if (!isOpen || (event.key !== 'Escape' && event.key !== 'Tab')) return;
    event.stopPropagation();
    if (event.key === 'Escape') event.preventDefault();
    // Tab continues from the trigger in document order.
    closeAndFocus();
  }

  return <Dropdown trigger={['click']} open={isOpen} onOpenChange={changeOpen} destroyOnHidden
    popupRender={(content) => <div ref={focusMountedMenu} inert={!isOpen} onKeyDownCapture={leaveMenu}>{content}</div>}
    menu={{ ...menu, className: 'today-workspace-menu', onClick: (event) => { closeAndFocus(); menu.onClick?.(event); },
      // rc-menu already handles Enter. Suppress its native click on the newly focused control.
      onKeyDown: (event) => { if (event.key === 'Enter') event.preventDefault(); } }}>
    <Button {...button} ref={trigger} aria-expanded={isOpen} aria-haspopup="menu" onKeyDown={leaveMenu}>{children}</Button>
  </Dropdown>;
}
