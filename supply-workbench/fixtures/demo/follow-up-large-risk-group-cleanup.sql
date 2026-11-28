BEGIN;

DELETE FROM procurement_observations
WHERE material_line_id LIKE 'procurement-component:synthetic-follow-up-large-risk-material:%';

DELETE FROM procurement_finished_lines
WHERE material_line_id LIKE 'procurement-component:synthetic-follow-up-large-risk-material:%';

DELETE FROM delivery_batches
WHERE order_line_id LIKE 'procurement-component:synthetic-follow-up-large-risk-material:%';

DELETE FROM order_lines
WHERE id LIKE 'procurement-component:synthetic-follow-up-large-risk-material:%';

DELETE FROM purchase_orders
WHERE id LIKE 'procurement-component:synthetic-follow-up-large-risk-material:%';

COMMIT;
