import type { EntityId, OwnerAssignment } from '@sw/domain';

/** 负责人姓名引用。匹配只认 users.name；重名返回多个，由调用方进待审核。 */
export type OwnerRef = {
  readonly id: EntityId;
  readonly name: string;
};

export interface OwnerAssignmentRepository {
  /** 当前生效记录（superseded_at 为空）。没有返回 undefined。 */
  findCurrent(subjectId: string): Promise<OwnerAssignment | undefined>;
  /** 当前待审核队列，按 created_at 升序。 */
  listPending(): Promise<readonly OwnerAssignment[]>;
  /** users.name 精确匹配（去首尾空白），只在职用户。 */
  findUsersByName(name: string): Promise<readonly OwnerRef[]>;
  /** 插入或按 id 覆盖。事务由 UnitOfWork.run 负责。 */
  save(entity: OwnerAssignment): Promise<void>;
}
