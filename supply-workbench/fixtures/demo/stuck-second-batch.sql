update delivery_batches as second
set status_changed_at = first.status_changed_at
from delivery_batches as first
where first.id = 'hz09-batch-1'
  and second.order_line_id = first.order_line_id
  and second.seq = 2;
