const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const IMAGE_MAX_BYTES = 10 * 1024 * 1024;

export function canMaintain(roles: readonly string[]): boolean {
  return roles.some((role) => role === 'reviewer' || role === 'admin');
}

export function uploadErrors(file: { readonly type: string; readonly size: number }): string[] {
  const errors: string[] = [];
  if (!IMAGE_TYPES.includes(file.type)) errors.push('只能上传 JPG、PNG 或 WEBP');
  if (file.size > IMAGE_MAX_BYTES) errors.push('图片不能超过 10MB');
  return errors;
}

export function hideErrors(reason: string): string[] {
  return reason.trim() === '' ? ['隐藏必须写原因'] : [];
}

export function contactErrors(input: { readonly userId: string; readonly nameRaw: string }): string[] {
  if (input.userId.trim() === '' && input.nameRaw.trim() === '') return ['选一个用户或填写名字'];
  return [];
}

export function sourceAfterEdit(): 'workbench' {
  return 'workbench';
}
