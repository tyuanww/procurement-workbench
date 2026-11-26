import { Card } from 'antd';

export function TodayLoadingCard({ label }: { readonly label: string }) {
  return <Card size="small" loading aria-busy="true" aria-label={label} role="status" />;
}
