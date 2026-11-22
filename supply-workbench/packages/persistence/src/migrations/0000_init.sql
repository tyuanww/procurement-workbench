CREATE TABLE "audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"actor_user_id" text NOT NULL,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "code_links" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"from_code_id" text NOT NULL,
	"to_code_id" text NOT NULL,
	"status" text NOT NULL,
	"evidence" jsonb,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "item_codes" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"code_type" text NOT NULL,
	"code_raw" text NOT NULL,
	"code_norm" text NOT NULL,
	"item_id" text,
	"status" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "item_names" (
	"item_id" text NOT NULL,
	"name_raw" text NOT NULL,
	"name_norm" text NOT NULL,
	"seen_count" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "items" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"display_name" text NOT NULL,
	"kind" text NOT NULL,
	"spec" text,
	"shared_code_flag" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "parties" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"display_name" text NOT NULL,
	"is_supplier" boolean NOT NULL,
	"is_factory" boolean NOT NULL,
	"is_own_warehouse" boolean NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "party_aliases" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"raw_name" text NOT NULL,
	"norm_name" text NOT NULL,
	"party_id" text,
	"status" text NOT NULL,
	"first_seen_import_batch_id" text,
	"seen_count" integer NOT NULL,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" text PRIMARY KEY NOT NULL,
	"upcoming_days" integer NOT NULL,
	"shipped_not_received_alert_days" integer,
	"delivery_note_alert_days" integer,
	"missing_date_hint_window_days" integer NOT NULL,
	"date_sanity_range" jsonb NOT NULL,
	"own_warehouse_party_id" text
);
--> statement-breakpoint
CREATE TABLE "stored_files" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"sha256" text NOT NULL,
	"original_name" text NOT NULL,
	"size" integer NOT NULL,
	"mime" text NOT NULL,
	"stored_path" text NOT NULL,
	"uploaded_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"name" text NOT NULL,
	"roles" text[] NOT NULL,
	"feishu_open_id" text,
	"active" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "batch_date_changes" (
	"id" text PRIMARY KEY NOT NULL,
	"batch_id" text NOT NULL,
	"field" text NOT NULL,
	"old_value" date,
	"new_value" date,
	"reason" text,
	"changed_by" text NOT NULL,
	"changed_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "delivery_batches" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"order_line_id" text NOT NULL,
	"seq" integer NOT NULL,
	"planned_qty" numeric(18, 4) NOT NULL,
	"receiver_party_id" text NOT NULL,
	"date_factory_required" date,
	"date_supplier_promised" date,
	"date_buyer_confirmed" date,
	"first_confirmed_date" date,
	"confirmed_by" text,
	"confirmed_at" timestamp with time zone,
	"status" text NOT NULL,
	"status_changed_at" timestamp with time zone NOT NULL,
	"origin" text NOT NULL,
	"origin_ref" jsonb,
	"closed_at" timestamp with time zone,
	"closed_reason" text,
	"cancelled_at" timestamp with time zone,
	"cancel_reason" text
);
--> statement-breakpoint
CREATE TABLE "delivery_notes" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"batch_id" text NOT NULL,
	"status" text NOT NULL,
	"returned_on" date,
	"verified_on" date,
	"file_id" text,
	"note" text,
	"created_by" text NOT NULL,
	"voided_at" timestamp with time zone,
	"voided_by" text,
	"void_reason" text
);
--> statement-breakpoint
CREATE TABLE "exceptions" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"order_line_id" text NOT NULL,
	"batch_id" text,
	"type" text NOT NULL,
	"note" text NOT NULL,
	"status" text NOT NULL,
	"opened_by" text NOT NULL,
	"closed_by" text,
	"closed_at" timestamp with time zone,
	"close_note" text
);
--> statement-breakpoint
CREATE TABLE "follow_ups" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"order_line_id" text NOT NULL,
	"batch_id" text,
	"kind" text NOT NULL,
	"text" text NOT NULL,
	"party_id" text,
	"created_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_line_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"order_line_id" text NOT NULL,
	"import_batch_id" text NOT NULL,
	"import_row_id" text NOT NULL,
	"data" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"purchase_order_id" text NOT NULL,
	"lane" text NOT NULL,
	"item_id" text,
	"item_code_raw" text,
	"barcode_raw" text,
	"name_raw" text,
	"qty_ordered" numeric(18, 4),
	"unit" text,
	"buyer_user_id" text,
	"receiver_party_id" text,
	"origin" text NOT NULL,
	"current_snapshot_id" text,
	"candidate_key" text,
	"missing_in_latest_import" boolean NOT NULL,
	"cancelled_at" timestamp with time zone,
	"cancel_reason" text,
	"stage" text NOT NULL,
	"stage_changed_at" timestamp with time zone NOT NULL,
	"next_due_batch_id" text,
	"next_due_date" date
);
--> statement-breakpoint
CREATE TABLE "purchase_orders" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"po_raw" text,
	"po_norm" text,
	"po_format" text NOT NULL,
	"related_po_raws" text[] NOT NULL,
	"supplier_party_id" text,
	"supplier_raw" text,
	"lane" text NOT NULL,
	"oa_demand_ref" text
);
--> statement-breakpoint
CREATE TABLE "receipts" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"batch_id" text NOT NULL,
	"qty" numeric(18, 4) NOT NULL,
	"received_on" date NOT NULL,
	"category" text NOT NULL,
	"source" text NOT NULL,
	"note" text,
	"created_by" text NOT NULL,
	"voided_at" timestamp with time zone,
	"voided_by" text,
	"void_reason" text
);
--> statement-breakpoint
CREATE TABLE "shipments" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"batch_id" text NOT NULL,
	"qty" numeric(18, 4) NOT NULL,
	"shipped_on" date NOT NULL,
	"source" text NOT NULL,
	"factory_shipment_row_id" text,
	"note" text,
	"created_by" text NOT NULL,
	"voided_at" timestamp with time zone,
	"voided_by" text,
	"void_reason" text
);
--> statement-breakpoint
CREATE TABLE "customer_supplied_receipt_rows" (
	"id" text PRIMARY KEY NOT NULL,
	"import_batch_id" text NOT NULL,
	"factory_party_id" text NOT NULL,
	"sheet_name" text NOT NULL,
	"row_no" integer NOT NULL,
	"raw" jsonb NOT NULL,
	"fingerprint" text NOT NULL,
	"linked_order_line_id" text,
	"link_status" text NOT NULL,
	"link_reason" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"registered_on" date,
	"seq_raw" text,
	"item_code_raw" text,
	"name_raw" text,
	"lot_raw" text,
	"spec_kg" numeric(18, 4),
	"pieces" numeric(18, 4),
	"net_qty" numeric(18, 4),
	"expires_on" date,
	"owner_note_raw" text
);
--> statement-breakpoint
CREATE TABLE "factory_in_transit_rows" (
	"id" text PRIMARY KEY NOT NULL,
	"import_batch_id" text NOT NULL,
	"factory_party_id" text NOT NULL,
	"sheet_name" text NOT NULL,
	"row_no" integer NOT NULL,
	"raw" jsonb NOT NULL,
	"fingerprint" text NOT NULL,
	"linked_order_line_id" text,
	"link_status" text NOT NULL,
	"link_reason" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"po_raw" text,
	"po_norm" text,
	"po_format" text,
	"name_raw" text,
	"supplier_raw" text,
	"barcode_raw" text,
	"ordered_on" date,
	"qty_required" numeric(18, 4),
	"qty_delivered_factory" numeric(18, 4),
	"qty_factory_stock" numeric(18, 4),
	"qty_unproduced" numeric(18, 4),
	"closed_raw" text,
	"item_code_raw" text,
	"material_po_raws" jsonb,
	"buyer_name_raw" text,
	"extra" jsonb
);
--> statement-breakpoint
CREATE TABLE "factory_material_demand_rows" (
	"id" text PRIMARY KEY NOT NULL,
	"import_batch_id" text NOT NULL,
	"factory_party_id" text NOT NULL,
	"sheet_name" text NOT NULL,
	"row_no" integer NOT NULL,
	"raw" jsonb NOT NULL,
	"fingerprint" text NOT NULL,
	"linked_order_line_id" text,
	"link_status" text NOT NULL,
	"link_reason" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"role" text NOT NULL,
	"block_po_raw" text,
	"block_material_po_raw" text,
	"block_label_raw" text,
	"item_code_raw" text,
	"name_raw" text,
	"unit_raw" text,
	"qty_on_hand" numeric(18, 4),
	"qty_finished_estimate" numeric(18, 4),
	"qty_gross" numeric(18, 4),
	"qty_net" numeric(18, 4),
	"slots" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "factory_packaging_combo_rows" (
	"id" text PRIMARY KEY NOT NULL,
	"import_batch_id" text NOT NULL,
	"factory_party_id" text NOT NULL,
	"sheet_name" text NOT NULL,
	"row_no" integer NOT NULL,
	"raw" jsonb NOT NULL,
	"fingerprint" text NOT NULL,
	"linked_order_line_id" text,
	"link_status" text NOT NULL,
	"link_reason" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"po_raw" text,
	"item_code_raw" text,
	"name_raw" text,
	"spec_raw" text,
	"qty" numeric(18, 4),
	"combo_suppliers_raw" text,
	"bom_code_raw" text,
	"material_po_raw" text
);
--> statement-breakpoint
CREATE TABLE "factory_schedule_cells" (
	"id" text PRIMARY KEY NOT NULL,
	"import_batch_id" text NOT NULL,
	"factory_party_id" text NOT NULL,
	"sheet_name" text NOT NULL,
	"row_no" integer NOT NULL,
	"raw" jsonb NOT NULL,
	"fingerprint" text NOT NULL,
	"linked_order_line_id" text,
	"link_status" text NOT NULL,
	"link_reason" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"po_raw" text,
	"item_code_raw" text,
	"name_raw" text,
	"month_raw" text,
	"new_or_old_raw" text,
	"qty_required_total" numeric(18, 4),
	"day" date,
	"qty" numeric(18, 4),
	"step_raw" text
);
--> statement-breakpoint
CREATE TABLE "factory_shipment_rows" (
	"id" text PRIMARY KEY NOT NULL,
	"import_batch_id" text NOT NULL,
	"factory_party_id" text NOT NULL,
	"sheet_name" text NOT NULL,
	"row_no" integer NOT NULL,
	"raw" jsonb NOT NULL,
	"fingerprint" text NOT NULL,
	"linked_order_line_id" text,
	"link_status" text NOT NULL,
	"link_reason" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"po_raw" text,
	"po_norm" text,
	"item_code_raw" text,
	"name_raw" text,
	"lot_raw" text,
	"qty" numeric(18, 4),
	"case_pack_raw" text,
	"pallets_raw" text,
	"shipment_kind_raw" text,
	"ship_or_arrive_on" date,
	"destination_raw" text,
	"vehicle_raw" text,
	"note2_raw" text
);
--> statement-breakpoint
CREATE TABLE "factory_stock_rows" (
	"id" text PRIMARY KEY NOT NULL,
	"import_batch_id" text NOT NULL,
	"factory_party_id" text NOT NULL,
	"sheet_name" text NOT NULL,
	"row_no" integer NOT NULL,
	"raw" jsonb NOT NULL,
	"fingerprint" text NOT NULL,
	"linked_order_line_id" text,
	"link_status" text NOT NULL,
	"link_reason" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"po_raw" text,
	"item_code_raw" text,
	"item_code_norm" text,
	"name_raw" text,
	"lot_raw" text,
	"qty_on_hand" numeric(18, 4),
	"pallets_raw" text,
	"coa_on" date,
	"produced_on" date,
	"inspection_raw" text,
	"inspected" boolean
);
--> statement-breakpoint
CREATE TABLE "bom_lines" (
	"product_barcode_raw" text NOT NULL,
	"product_name" text NOT NULL,
	"reorder_count" integer,
	"cumulative_qty" numeric(18, 4),
	"part_code_raw" text NOT NULL,
	"part_name" text NOT NULL,
	"import_batch_id" text NOT NULL,
	"row_no" integer NOT NULL,
	"merged_fill" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_batches" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"file_id" text NOT NULL,
	"template" text NOT NULL,
	"factory_party_id" text,
	"status" text NOT NULL,
	"file_meta" jsonb NOT NULL,
	"stats" jsonb NOT NULL,
	"decisions" jsonb NOT NULL,
	"created_by" text NOT NULL,
	"committed_by" text,
	"committed_at" timestamp with time zone,
	"rolled_back_by" text,
	"rolled_back_at" timestamp with time zone,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "import_rows" (
	"id" text PRIMARY KEY NOT NULL,
	"import_batch_id" text NOT NULL,
	"sheet_name" text NOT NULL,
	"row_no" integer NOT NULL,
	"raw" jsonb NOT NULL,
	"parsed" jsonb NOT NULL,
	"issues" jsonb NOT NULL,
	"action" text NOT NULL,
	"target_id" text,
	"skip_reason" text
);
--> statement-breakpoint
CREATE TABLE "product_contacts" (
	"product_id" text NOT NULL,
	"role" text NOT NULL,
	"user_id" text,
	"name_raw" text,
	"note" text,
	"source" text NOT NULL,
	"updated_by" text NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_images" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"slot" text NOT NULL,
	"file_id" text NOT NULL,
	"order" integer NOT NULL,
	"source" text NOT NULL,
	"import_batch_id" text,
	"uploaded_by" text,
	"hidden_at" timestamp with time zone,
	"hidden_by" text,
	"hidden_reason" text
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"barcode_raw" text NOT NULL,
	"barcode_base" text NOT NULL,
	"filing_name" text,
	"spu_key" text,
	"filing_no" text,
	"sku_name" text NOT NULL,
	"net_content" text,
	"case_pack" text,
	"outer_size" text,
	"product_line" text,
	"field_sources" jsonb NOT NULL,
	"import_batch_id" text,
	"row_no" integer,
	"edited_by" text,
	"edited_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "weekly_reports" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"week_start" date NOT NULL,
	"generated_at" timestamp with time zone NOT NULL,
	"generated_by" text NOT NULL,
	"data" jsonb NOT NULL,
	"data_watermark" jsonb NOT NULL,
	"exports" jsonb NOT NULL,
	"superseded_by" text
);
--> statement-breakpoint
CREATE INDEX "audit_log_entity" ON "audit_log" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "item_codes_type_norm" ON "item_codes" USING btree ("code_type","code_norm");--> statement-breakpoint
CREATE UNIQUE INDEX "party_aliases_norm_name" ON "party_aliases" USING btree ("norm_name");--> statement-breakpoint
CREATE INDEX "delivery_batches_order_line_id" ON "delivery_batches" USING btree ("order_line_id");--> statement-breakpoint
CREATE INDEX "delivery_batches_status_confirmed" ON "delivery_batches" USING btree ("status","date_buyer_confirmed");--> statement-breakpoint
CREATE INDEX "order_lines_purchase_order_id" ON "order_lines" USING btree ("purchase_order_id");--> statement-breakpoint
CREATE INDEX "order_lines_candidate_key" ON "order_lines" USING btree ("candidate_key");--> statement-breakpoint
CREATE INDEX "order_lines_stage_due" ON "order_lines" USING btree ("stage","next_due_date");--> statement-breakpoint
CREATE INDEX "order_lines_buyer_user_id" ON "order_lines" USING btree ("buyer_user_id");--> statement-breakpoint
CREATE INDEX "order_lines_barcode_raw" ON "order_lines" USING btree ("barcode_raw");--> statement-breakpoint
CREATE INDEX "purchase_orders_po_norm" ON "purchase_orders" USING btree ("po_norm");--> statement-breakpoint
CREATE INDEX "customer_supplied_receipt_rows_import_batch_id" ON "customer_supplied_receipt_rows" USING btree ("import_batch_id");--> statement-breakpoint
CREATE INDEX "customer_supplied_receipt_rows_linked_order_line_id" ON "customer_supplied_receipt_rows" USING btree ("linked_order_line_id");--> statement-breakpoint
CREATE INDEX "factory_in_transit_rows_import_batch_id" ON "factory_in_transit_rows" USING btree ("import_batch_id");--> statement-breakpoint
CREATE INDEX "factory_in_transit_rows_linked_order_line_id" ON "factory_in_transit_rows" USING btree ("linked_order_line_id");--> statement-breakpoint
CREATE INDEX "factory_material_demand_rows_import_batch_id" ON "factory_material_demand_rows" USING btree ("import_batch_id");--> statement-breakpoint
CREATE INDEX "factory_material_demand_rows_linked_order_line_id" ON "factory_material_demand_rows" USING btree ("linked_order_line_id");--> statement-breakpoint
CREATE INDEX "factory_packaging_combo_rows_import_batch_id" ON "factory_packaging_combo_rows" USING btree ("import_batch_id");--> statement-breakpoint
CREATE INDEX "factory_packaging_combo_rows_linked_order_line_id" ON "factory_packaging_combo_rows" USING btree ("linked_order_line_id");--> statement-breakpoint
CREATE INDEX "factory_schedule_cells_import_batch_id" ON "factory_schedule_cells" USING btree ("import_batch_id");--> statement-breakpoint
CREATE INDEX "factory_schedule_cells_linked_order_line_id" ON "factory_schedule_cells" USING btree ("linked_order_line_id");--> statement-breakpoint
CREATE INDEX "factory_shipment_rows_import_batch_id" ON "factory_shipment_rows" USING btree ("import_batch_id");--> statement-breakpoint
CREATE INDEX "factory_shipment_rows_linked_order_line_id" ON "factory_shipment_rows" USING btree ("linked_order_line_id");--> statement-breakpoint
CREATE INDEX "factory_stock_rows_import_batch_id" ON "factory_stock_rows" USING btree ("import_batch_id");--> statement-breakpoint
CREATE INDEX "factory_stock_rows_linked_order_line_id" ON "factory_stock_rows" USING btree ("linked_order_line_id");--> statement-breakpoint
CREATE INDEX "factory_stock_rows_item_code_norm" ON "factory_stock_rows" USING btree ("item_code_norm");--> statement-breakpoint
CREATE INDEX "bom_lines_product_barcode" ON "bom_lines" USING btree ("product_barcode_raw");--> statement-breakpoint
CREATE INDEX "bom_lines_part_code" ON "bom_lines" USING btree ("part_code_raw");--> statement-breakpoint
CREATE INDEX "import_rows_batch_action" ON "import_rows" USING btree ("import_batch_id","action");--> statement-breakpoint
CREATE INDEX "product_contacts_product_role" ON "product_contacts" USING btree ("product_id","role");--> statement-breakpoint
CREATE UNIQUE INDEX "products_barcode_raw" ON "products" USING btree ("barcode_raw");--> statement-breakpoint
CREATE INDEX "products_barcode_base" ON "products" USING btree ("barcode_base");