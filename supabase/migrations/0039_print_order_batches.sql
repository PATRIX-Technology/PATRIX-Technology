-- ============================================================================
-- 0039_print_order_batches.sql
-- Lets one Stripe Checkout session cover several printed copies at once
-- (a nursery ordering prints for its whole bulk-generated batch in one
-- paid checkout, not one story at a time) -- see docs/DECISIONS.md "Bulk
-- print ordering, paid online, replaces the WhatsApp no-payment bypass".
-- print_orders stays one row per story (so per-story status/shipping/
-- amount bookkeeping doesn't change), with batch_id grouping the rows
-- that were paid for in the same Checkout session. A single-story order
-- is just a batch of one.
-- ============================================================================

alter table print_orders add column batch_id uuid;

create index print_orders_batch_id_idx on print_orders (batch_id) where batch_id is not null;

comment on column print_orders.batch_id is
  'Groups the print_orders rows paid for in one Stripe Checkout session. Null for pre-batch rows (none exist yet in production). Set at insert time by /api/print-orders/checkout, shared across every story in that checkout; the webhook marks every row sharing a batch_id as paid together.';
