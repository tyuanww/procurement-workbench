import { Segmented, Tabs, type SegmentedProps, type TabsProps } from 'antd';

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
