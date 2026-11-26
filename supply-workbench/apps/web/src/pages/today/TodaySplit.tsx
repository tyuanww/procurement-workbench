import { Splitter } from 'antd';
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

const minPrimary = 35;
const maxPrimary = 78;
const separatorClass = 'today-split-handle';

export function TodaySplit({ primary, secondary, defaultPrimary, label, className }: {
  readonly primary: ReactNode;
  readonly secondary: ReactNode;
  readonly defaultPrimary: number;
  readonly label: string;
  readonly className?: string;
}) {
  const [primaryPercent, setPrimaryPercent] = useState(defaultPrimary);
  const root = useRef<HTMLDivElement>(null);
  const primaryId = useId();
  useEffect(() => {
    // Ant Design 6.6 gives the handle a separator role but only binds pointer resizing.
    const handle = root.current?.querySelector<HTMLElement>(`.${separatorClass}`);
    if (handle === undefined || handle === null) return;
    handle.tabIndex = 0;
    handle.setAttribute('aria-label', label);
    handle.setAttribute('aria-controls', primaryId);
  }, [label, primaryId]);

  function resizeFromKeys(event: KeyboardEvent<HTMLDivElement>) {
    if (!(event.target instanceof HTMLElement) || !event.target.classList.contains(separatorClass)) return;
    const offsets = { ArrowLeft: -4, ArrowRight: 4, Home: minPrimary - primaryPercent, End: maxPrimary - primaryPercent };
    const key = event.key;
    if (key !== 'ArrowLeft' && key !== 'ArrowRight' && key !== 'Home' && key !== 'End') return;
    event.preventDefault();
    setPrimaryPercent(clamp(primaryPercent + offsets[key]));
  }

  return <div ref={root} className={className} onKeyDown={resizeFromKeys}>
    <Splitter className="today-split" classNames={{ dragger: separatorClass }} lazy
      onResizeEnd={([first = 0, second = 0]) => { if (first + second > 0) setPrimaryPercent(clamp(first / (first + second) * 100)); }}
      onDraggerDoubleClick={() => setPrimaryPercent(defaultPrimary)}>
      <Splitter.Panel size={`${primaryPercent}%`} min={`${minPrimary}%`} max={`${maxPrimary}%`}>
        <div id={primaryId} className="today-split-content">{primary}</div>
      </Splitter.Panel>
      <Splitter.Panel size={`${100 - primaryPercent}%`}><div className="today-split-content">{secondary}</div></Splitter.Panel>
    </Splitter>
  </div>;
}

function clamp(value: number) {
  return Math.max(minPrimary, Math.min(maxPrimary, value));
}
