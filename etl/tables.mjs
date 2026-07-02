// Table sync configuration.
//
// mode:
//   'full'        — small dimension tables: truncate + reload every run (cheap, always correct)
//   'incremental' — big fact tables: pull only rows where <syncKey> > high-water-mark
//
// syncKey: the monotonic column used as the incremental high-water mark.
//   Defaults to 'id' (auto-increment PK — guaranteed increasing, always present).
//   If a table has a reliable 'updated_at', prefer it so row UPDATES are also
//   captured (not just inserts). We confirm per-table from the schema query.
//
// pk: primary-key column, used for ON CONFLICT upserts.
//
// Row counts (from raw.* on 2026-07-02) are just context for batch sizing.

export const TABLES = [
  // ── Small dimension tables → full reload ─────────────────────────
  { name: 'admin_bot',                    mode: 'full',        pk: 'id', rows: 451 },
  { name: 'admin_attribute',              mode: 'full',        pk: 'id', rows: 18_513 },

  // ── Big fact tables → incremental ────────────────────────────────
  { name: 'admin_conversation',           mode: 'incremental', pk: 'id', syncKey: 'id', rows: 884_524,
    note: 'Conversation rows can be UPDATED after close (outcome/status). id-sync catches new rows; boundary updates handled by periodic full-refresh in Phase 2, or switch syncKey to updated_at if present.' },
  { name: 'admin_chat_history',           mode: 'incremental', pk: 'id', syncKey: 'id', rows: 5_451_072 },
  { name: 'admin_user',                   mode: 'incremental', pk: 'id', syncKey: 'id', rows: 552_803 },
  { name: 'admin_knowledge_reply',        mode: 'incremental', pk: 'id', syncKey: 'id', rows: 502_675 },
  { name: 'admin_attribute_user_value',   mode: 'incremental', pk: 'id', syncKey: 'id', rows: 1_383_066 },

  // NOTE: admin_widget_greeting_event has 23.8M rows in Botscrew MySQL but Dru
  // intentionally left raw.* at 0 — no report.* view depends on it. Skipped
  // on purpose. Do NOT add it back without a reason; it's a huge pointless pull.
  // { name: 'admin_widget_greeting_event', mode: 'incremental', pk: 'id', syncKey: 'id' },
]

// Sync order matters for FK integrity: dimensions before facts.
// The array above is already in dependency-safe order.
