import type { ItemName } from '@sw/domain';

export type NameDecision = 'undecided' | 'same_item' | 'shared_code';

export interface ItemNameRepository {
  /** 这个物料记过的名字。没有就空数组。 */
  listByItem(itemId: string): Promise<readonly ItemName[]>;
  /** 按物料和规范化品名覆盖。 */
  save(name: ItemName): Promise<void>;
  /** 没人处理过一号多名就是 undecided，不是同物料。 */
  decision(itemId: string): Promise<NameDecision>;
  saveDecision(itemId: string, mode: Exclude<NameDecision, 'undecided'>): Promise<void>;
}
