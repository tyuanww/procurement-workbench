ALTER TABLE products ADD COLUMN IF NOT EXISTS workbook_field_sources jsonb NOT NULL DEFAULT '{}'::jsonb;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS product_images_visible_file ON product_images (file_id) WHERE hidden_at IS NULL;
