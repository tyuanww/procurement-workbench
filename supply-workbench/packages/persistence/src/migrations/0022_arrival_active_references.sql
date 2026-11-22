-- Keep the registration key (which can also serve as the count document).
-- Drop count-only claims released by earlier corrections or rollbacks. Revisions and audit stay intact.
WITH reference_history AS (
  SELECT
    ref.arrival_id,
    ref.key,
    ref.key::jsonb AS parts,
    jsonb_build_array(arrival.source ->> 'kind') || (
      SELECT jsonb_agg(
        btrim(regexp_replace(normalize(field.value, NFKC), U&'[\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]+', ' ', 'g')) ORDER BY field.ordinality
      )
      FROM unnest(ARRAY[arrival.source ->> 'source', arrival.source ->> 'number', arrival.source ->> 'row'])
        WITH ORDINALITY AS field(value, ordinality)
    ) AS source_key,
    active.request_key::jsonb ->> 2 AS active_key
  FROM arrival_references AS ref
  JOIN arrivals AS arrival ON arrival.id = ref.arrival_id
  LEFT JOIN arrival_revisions AS active
    ON active.arrival_id = arrival.id AND active.revision = arrival.revision AND arrival.allocation IS NOT NULL
  WHERE EXISTS (
    SELECT 1 FROM arrival_revisions AS history
    WHERE history.arrival_id = arrival.id
      AND history.request_key::jsonb ->> 0 = 'allocate'
      AND history.request_key::jsonb ->> 2 = ref.key
  )
)
DELETE FROM arrival_references AS claim
USING reference_history AS history
WHERE claim.key = history.key
  AND claim.arrival_id = history.arrival_id
  AND history.key IS DISTINCT FROM history.active_key
  AND history.parts <> history.source_key
  AND EXISTS (
    SELECT 1 FROM arrival_references AS registration
    WHERE registration.arrival_id = history.arrival_id AND registration.key::jsonb = history.source_key
  );
