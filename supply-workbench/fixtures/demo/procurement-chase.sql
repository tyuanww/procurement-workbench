insert into parties (id, created_at, updated_at, display_name, is_supplier, is_factory, is_own_warehouse)
values ('hz09-factory-a', date_trunc('milliseconds', current_timestamp), date_trunc('milliseconds', current_timestamp), '合成催货甲厂', true, true, false),
       ('hz09-factory-b', date_trunc('milliseconds', current_timestamp), date_trunc('milliseconds', current_timestamp), '合成催货乙厂', true, true, false);
insert into purchase_orders (id, created_at, updated_at, po_raw, po_format, related_po_raws, lane, supplier_party_id)
select 'hz09-po-' || n, date_trunc('milliseconds', current_timestamp), date_trunc('milliseconds', current_timestamp), 'HZ09-' || lpad(n::text, 4, '0'), 'OTHER', array[]::text[], 'finished',
       case n when 250 then 'hz09-factory-b' else 'hz09-factory-a' end
from generate_series(1, 502) as n;
insert into order_lines (id, created_at, updated_at, purchase_order_id, lane, name_raw, qty_ordered, unit,
  buyer_user_id, receiver_party_id, origin, missing_in_latest_import, latest_import_presence, stage, stage_changed_at)
select 'hz09-line-' || n, date_trunc('milliseconds', current_timestamp), date_trunc('milliseconds', current_timestamp), 'hz09-po-' || n, 'finished', '合成待催 ' || n,
       case n when 1 then 10000 when 501 then 30000 else 100 end, case n when 2 then '箱' else '件' end,
       case n when 502 then '0199f0a0-0000-7000-8000-000000000003' else '0199f0a0-0000-7000-8000-000000000002' end,
       '0199f0a0-0000-7000-8000-000000000010', 'manual', false, 'not_applicable', 'awaiting_shipment', date_trunc('milliseconds', current_timestamp)
from generate_series(1, 502) as n;
insert into line_factory_links (id, created_at, updated_at, order_line_id, factory_party_id, status, source, confidence, linked_at)
values ('hz09-link-1', date_trunc('milliseconds', current_timestamp), date_trunc('milliseconds', current_timestamp),
        'hz09-line-1', 'hz09-factory-a', 'linked', 'po_master', 'po', date_trunc('milliseconds', current_timestamp)),
       ('hz09-link-251', date_trunc('milliseconds', current_timestamp), date_trunc('milliseconds', current_timestamp),
        'hz09-line-251', 'hz09-factory-b', 'manual', 'manual', 'manual', date_trunc('milliseconds', current_timestamp));
insert into delivery_batches (id, created_at, updated_at, order_line_id, seq, planned_qty, planned_unit, receiver_party_id,
  date_buyer_confirmed, first_confirmed_date, status, status_changed_at, origin)
select 'hz09-batch-' || n, date_trunc('milliseconds', current_timestamp), date_trunc('milliseconds', current_timestamp), 'hz09-line-' || n, 1,
       case n when 1 then 10000 when 501 then 30000 else 100 end, case n when 2 then '箱' else '件' end,
       '0199f0a0-0000-7000-8000-000000000010',
       case n when 501 then '2025-02-01'::date else '2025-01-01'::date end,
       case n when 501 then '2025-02-01'::date else '2025-01-01'::date end,
       'confirmed', date_trunc('milliseconds', current_timestamp), 'manual'
from generate_series(1, 502) as n;
