import { access } from 'node:fs/promises';
import type { ResolveHook } from 'node:module';
import { fileURLToPath } from 'node:url';

export const resolve: ResolveHook = async (specifier, context, nextResolve) => {
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    if (context.parentURL === undefined || !specifier.endsWith('.js')) throw error;
    const attempted = new URL(specifier, context.parentURL);
    if (!attempted.pathname.includes('/src/')) throw error;
    const dist = new URL(attempted.href.replace('/src/', '/dist/'));
    await access(fileURLToPath(dist));
    return { url: dist.href, shortCircuit: true };
  }
};
