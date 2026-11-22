export type PageQuery = {
  readonly page?: number;
  readonly pageSize?: number;
  readonly sort?: string;
};

export type Page = {
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
};

/** 05 第 1 节：列表一律是 items + page，不是裸数组。 */
export type ListResult<T> = {
  readonly items: readonly T[];
  readonly page: Page;
};
