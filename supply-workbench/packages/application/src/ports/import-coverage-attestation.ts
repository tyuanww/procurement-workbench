import type { ImportCoverageAttestation } from '@sw/domain';

export interface ImportCoverageAttestationVerifier {
  verify(input: { readonly token: string; readonly now: string }): Promise<ImportCoverageAttestation | undefined>;
}
