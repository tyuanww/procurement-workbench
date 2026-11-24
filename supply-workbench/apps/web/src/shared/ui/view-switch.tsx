import { Segmented, Tabs, type SegmentedProps, type TabsProps } from 'antd';

type NamedControl = { readonly 'aria-label': string };

export function ViewSwitch<Value extends string | number>(props: SegmentedProps<Value> & NamedControl) {
  return <Segmented<Value> {...props} />;
}

export function ContentTabs({ 'aria-label': label, ...props }: Pick<TabsProps, 'items' | 'activeKey' | 'onChange' | 'destroyOnHidden'> & NamedControl) {
  return (
    <Tabs {...props} ref={(tabs) => {
      tabs?.nativeElement?.querySelector('[role="tablist"]')?.setAttribute('aria-label', label);
    }} />
  );
}
