import { describe, expect, it } from 'vitest';
import { canMaintain, contactErrors, hideErrors, sourceAfterEdit, uploadErrors } from '../../apps/web/src/features/product-archive/maintain/rules.js';

describe('产品档案维护', () => {
  it('只有审核人和管理员能编辑', () => {
    expect(canMaintain(['buyer'])).toBe(false);
    expect(canMaintain(['reviewer'])).toBe(true);
    expect(canMaintain(['admin'])).toBe(true);
  });

  it('上传先校验类型和大小，隐藏要原因，联系人不能两个都空', () => {
    expect(uploadErrors({ type: 'text/plain', size: 10 })).toContain('只能上传 JPG、PNG 或 WEBP');
    expect(uploadErrors({ type: 'image/png', size: 11 * 1024 * 1024 })).toContain('图片不能超过 10MB');
    expect(hideErrors(' ')).toEqual(['隐藏必须写原因']);
    expect(contactErrors({ userId: '', nameRaw: '' })).toEqual(['选一个用户或填写名字']);
    expect(sourceAfterEdit()).toBe('workbench');
  });
});
