import { Segmented, Tabs, type SegmentedProps, type TabsProps } from 'antd';
import { useId, type ReactNode } from 'react';
import { border, brand, fontSize, space } from '../../theme/tokens.js';

type NamedControl = { readonly 'aria-label': string };

export function ViewSwitch<Value extends string | number>(props: SegmentedProps<Value> & NamedControl) {
  return <Segmented<Value> {...props} />;
}

type ContentTabsProps = Pick<TabsProps, 'items' | 'activeKey' | 'onChange' | 'destroyOnHidden' | 'id' | 'className' |
  'classNames' | 'styles' | 'animated' | 'tabBarGutter' | 'renderTabBar'> & NamedControl;

export function ContentTabs({ 'aria-label': label, ...props }: ContentTabsProps) {
  return (
    <Tabs {...props} ref={(tabs) => {
      tabs?.nativeElement?.querySelector('[role="tablist"]')?.setAttribute('aria-label', label);
    }} />
  );
}

const sectionTabsStyles = `
  .section-tabs { row-gap: var(--section-tabs-gap, ${space[3]}px); }
  .section-tabs-header { display: flex; align-items: center; flex-wrap: wrap; gap: 0 ${space[1]}px; border-block-end: 1px solid ${border}; }
  .section-tabs .section-tabs-header > .section-tabs-tablist::before { content: none; }
  .section-tabs-tab [role="tab"] { display: grid; place-items: center; min-block-size: 44px; padding-inline: ${space[1]}px; }
  .section-tabs-tab [role="tab"][aria-selected="true"] { color: ${brand[800]}; font-weight: 600; }
  .section-tabs-tab [role="tab"]:focus-visible { outline: 2px solid ${brand[600]}; outline-offset: -3px; }
  .section-tabs .section-tabs-indicator { block-size: 0; border-block-end: 3px solid ${brand[600]}; }
  .section-tabs-extra { margin-inline-start: auto; font-size: ${fontSize.meta}px; }
  .section-tabs-extra:empty { display: none; }
`;

type SectionTabsProps = Pick<ContentTabsProps, 'items' | 'activeKey' | 'onChange' | 'className'> & NamedControl & {
  readonly extra?: ReactNode;
};

export function SectionTabs({ extra, className, ...props }: SectionTabsProps) {
  const id = useId();
  return <>
    <style>{sectionTabsStyles}</style>
    <ContentTabs {...props} id={id} className={className ? `section-tabs ${className}` : 'section-tabs'} animated={false} tabBarGutter={space[3]}
      classNames={{ header: 'section-tabs-tablist', item: 'section-tabs-tab', indicator: 'section-tabs-indicator', content: 'section-tabs-panel' }}
      styles={{ header: { flex: '1 1 9.5rem', minInlineSize: 'min(100%, 9.5rem)', margin: 0 }, item: { padding: 0 } }}
      renderTabBar={(tabBarProps, DefaultTabBar) => <div className="section-tabs-header">
        <DefaultTabBar {...tabBarProps} />
        {extra && <div className="section-tabs-extra">{extra}</div>}
      </div>} />
  </>;
}
