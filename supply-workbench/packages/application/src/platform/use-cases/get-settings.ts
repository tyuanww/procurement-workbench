import type { GetSettings, GetSettingsDeps } from '../boundary.js';

export const makeGetSettings =
  (deps: GetSettingsDeps): GetSettings =>
  async () => deps.settings.get();
