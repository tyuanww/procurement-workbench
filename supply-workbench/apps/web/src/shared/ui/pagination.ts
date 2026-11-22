import type { TablePaginationConfig } from 'antd';

export const PAGE_SIZE_OPTIONS: readonly number[] = [20, 50, 100];
export const TABLE_LOADING_DELAY_MS = 200;

export function tablePagination(input: {
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly onChange: (page: number) => void;
  readonly onSizeChange: (size: number) => void;
}): TablePaginationConfig {
  return {
    placement: ['bottomEnd'],
    current: input.page,
    pageSize: input.pageSize,
    pageSizeOptions: [...PAGE_SIZE_OPTIONS],
    showSizeChanger: true,
    showTotal: (total) => `共 ${total} 行`,
    onChange: (page, size) => {
      if (size !== input.pageSize) {
        input.onSizeChange(size);
        return;
      }
      input.onChange(page);
    },
    total: input.total,
  };
}

export function tableLoading(isUpdating: boolean): {
  readonly spinning: boolean;
  readonly delay: number;
} {
  return { spinning: isUpdating, delay: TABLE_LOADING_DELAY_MS };
}
