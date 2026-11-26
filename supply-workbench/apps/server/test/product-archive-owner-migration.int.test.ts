import { expect, it } from 'vitest';
import { createDb, migrate } from '@sw/persistence';
import { MIGRATIONS } from '../../../packages/persistence/src/migrate.js';
import { productArchiveOwners, productContacts } from '../../../packages/persistence/src/schema/archive.js';

const reconcile = '0028_reconcile_product_archive_owners';
const legacyOwners = '0025_product_archive_owners';

it('升级恢复较新的手工成品负责人，保留后续更新或清除，并整理无效子件负责人', async () => {
  const handle = await createDb({ driver: 'pglite' });
  try {
    await migrate(handle, MIGRATIONS.filter(({ id }) => id <= legacyOwners));
    await handle.exec(`
      INSERT INTO products (id, sku_name, barcode_raw, barcode_base, field_sources, created_at, updated_at)
      SELECT id, id, barcode, barcode, '{}', '2026-10-01', '2026-10-01'
      FROM (VALUES ('older', '6900000000011'), ('newer', '6900000000012'), ('cleared', '6900000000013')) sample(id, barcode);

      INSERT INTO product_contacts (product_id, role, user_id, name_raw, note, source, updated_by, updated_at)
      VALUES ('older', 'product_info', NULL, '早期导入人', NULL, 'import', 'bot', '2026-10-01'),
        ('older', 'quality', NULL, '质控不变', NULL, 'workbench', 'contact-admin', '2026-10-01'),
        ('newer', 'product_info', 'owner-user', '后续维护人', '保留备注', 'workbench', 'contact-admin', '2026-10-10');

      INSERT INTO bom_lines (product_barcode_raw, product_name, part_code_raw, part_name, import_batch_id, row_no, merged_fill)
      VALUES ('6900000000011', '合成产品', '', '旧模板无编码子件', 'legacy-bom', 1, false),
        ('6900000000011', '合成产品', '70000001', '现有子件', 'legacy-bom', 2, false);

      INSERT INTO product_archive_owners (product_id, part_code_raw, owner_name)
      VALUES ('older', '', '旧版手工人'), ('newer', '', '旧版手工人'), ('cleared', '', '旧版手工人'),
        ('older', '70000001', '现有负责人'), ('older', '70000002', '孤立负责人');

      INSERT INTO audit_log (id, actor_user_id, action, entity, entity_id, after, at)
      SELECT 'owner-' || id, 'owner-admin', 'product.owner', '产品负责人', id, '{"ownerName":"旧版手工人","partCodeRaw":null}', '2026-10-08'
      FROM (VALUES ('older'), ('newer'), ('cleared')) sample(id)
    `);
    await migrate(handle, MIGRATIONS.filter(({ id }) => id < reconcile));
    const before = await handle.db.select().from(productContacts);
    expect(before).toEqual(expect.arrayContaining([
      expect.objectContaining({ productId: 'older', role: 'product_info', nameRaw: '早期导入人' }),
      expect.objectContaining({ productId: 'cleared', role: 'product_info', nameRaw: '旧版手工人' }),
    ]));
    await handle.exec(`
      DELETE FROM product_contacts WHERE product_id = 'cleared' AND role = 'product_info';
      INSERT INTO audit_log (id, actor_user_id, action, entity, entity_id, after, at)
      VALUES ('later-clear', 'contact-admin', 'product.contacts', '产品联系人', 'cleared', '{"role":"product_info","people":[]}', '2026-10-20')
    `);

    await migrate(handle);
    await migrate(handle);
    const contacts = await handle.db.select().from(productContacts);
    expect(contacts).toHaveLength(3);
    expect(contacts).toEqual(expect.arrayContaining([
      expect.objectContaining({ productId: 'older', role: 'product_info', nameRaw: '旧版手工人', updatedBy: 'owner-admin', source: 'workbench' }),
      expect.objectContaining({ productId: 'older', role: 'quality', nameRaw: '质控不变' }),
      expect.objectContaining({ productId: 'newer', role: 'product_info', userId: 'owner-user', nameRaw: '后续维护人', note: '保留备注' }),
    ]));
    expect(await handle.db.select().from(productArchiveOwners)).toEqual([
      { productId: 'older', partCodeRaw: '70000001', ownerName: '现有负责人' },
    ]);
  } finally {
    await handle.close();
  }
});
