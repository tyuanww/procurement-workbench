import { createDb } from '@sw/persistence';

export async function arrivalTestDatabase() {
  const input = process.env.CG08_PROOF_DATABASE_URL;
  if (input === undefined) return createDb({ driver: 'pglite' });
  const url = new URL(input);
  if (url.hostname !== '127.0.0.1' || url.port === '' || url.pathname !== '/cg08_proof') throw new Error('CG08 验证只允许本机一次性数据库');
  return createDb({ driver: 'pg', url: url.href });
}
