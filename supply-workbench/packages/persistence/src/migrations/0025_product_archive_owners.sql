CREATE TABLE product_archive_owners (
  product_id text NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  part_code_raw text NOT NULL,
  owner_name text NOT NULL,
  PRIMARY KEY (product_id, part_code_raw),
  CONSTRAINT product_archive_owners_name_check CHECK (char_length(trim(owner_name)) BETWEEN 1 AND 100)
);
