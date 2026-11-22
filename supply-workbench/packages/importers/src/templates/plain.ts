import type { ImportExisting } from '../../../application/src/ports/parsed-rows.js';
import type { ImportFacts, ImportFingerprint } from '../../../application/src/ports/import-template.js';

export const plainIdentity = {
  requiresFactory: false,
  identityOf(): readonly ImportFingerprint[] {
    return [];
  },
  existingFrom(): ImportExisting {
    return { poMaster: [], factoryFingerprints: [], products: [], bomKeys: [] };
  },
  factsOf(): ImportFacts {
    return { ignoredSheets: [], codeLinks: [] };
  },
};

export function fingerprintExisting(records: readonly ImportFingerprint[]): ImportExisting {
  return { poMaster: [], factoryFingerprints: records.map((record) => record.fingerprint), products: [], bomKeys: [] };
}
