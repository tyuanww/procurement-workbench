CREATE UNIQUE INDEX IF NOT EXISTS import_batches_coverage_attestation_uq
  ON import_batches ((file_meta->>'coverageAttestationId'))
  WHERE file_meta->>'coverageAttestationId' IS NOT NULL;
