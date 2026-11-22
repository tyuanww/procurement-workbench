import type { LineFactoryLink } from '@sw/domain';

export type FactoryRef = {
  readonly id: string;
  readonly displayName: string;
};

export interface LineFactoryLinkRepository {
  /** 订单行的当前关联；没有返回 undefined。 */
  find(orderLineId: string): Promise<LineFactoryLink | undefined>;
  /** 插入或按 id 覆盖。事务由 UnitOfWork.run 负责。 */
  save(entity: LineFactoryLink): Promise<void>;
  /** 代工厂主体按 displayName 精确匹配；重名返回多个。 */
  findFactoriesByName(displayName: string): Promise<readonly FactoryRef[]>;
}
