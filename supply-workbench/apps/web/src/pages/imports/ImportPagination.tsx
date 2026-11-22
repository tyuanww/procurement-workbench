import { useEffect, useRef } from 'react';
import { Pagination } from 'antd';
import { space } from '../../theme/tokens.js';

export function ImportPagination({ label, page, pageSize, total, onChange }: {
  readonly label: string;
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly onChange: (page: number) => void;
}) {
  const navigation = useRef<HTMLElement>(null);
  const hadFocus = useRef(false);
  useEffect(() => {
    if (hadFocus.current && document.activeElement === document.body) navigation.current?.focus({ preventScroll: true });
    hadFocus.current = false;
  }, [page]);
  if (total <= pageSize) return null;
  return (
    <nav ref={navigation} tabIndex={-1} aria-label={`${label}，第 ${page} 页`} style={{ marginTop: space[2] }}>
      <Pagination current={page} pageSize={pageSize} total={total} size="small" showLessItems showSizeChanger={false}
        onChange={(next) => {
          hadFocus.current = navigation.current?.contains(document.activeElement) === true;
          onChange(next);
        }}
      />
    </nav>
  );
}
