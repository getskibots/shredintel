# shredintel ETL

Incremental sync: **Botscrew MySQL (read-only) → GSB Supabase `raw.*`**, then
refresh the `report.*` materialized views that shredintel reads.

Runs from any machine whose IP is whitelisted on Botscrew's MySQL. For the
Phase-1 catch-up that's **your laptop**. For ongoing nightly sync it'll live on
a DigitalOcean droplet (whose static IP Botscrew whitelists).

## One-time setup

```bash
cd etl
npm install
cp .env.example .env
# then edit .env with your Botscrew MySQL creds + Supabase connection string
```

### Where each .env value comes from

| Var | Where |
|-----|-------|
| `BOTSCREW_MYSQL_*` | Same values as your MySQL Workbench connection |
| `SUPABASE_DB_URL` | Supabase → Project Settings → Database → Connection string → **URI** |

For `SUPABASE_DB_URL`, use the **Session pooler** URI (port 5432). It looks like:
`postgresql://postgres.srodxtdiiyclawkiucsy:YOUR-DB-PASSWORD@aws-0-us-east-1.pooler.supabase.com:5432/postgres`

## Run order

```bash
# 1. Confirm BOTH databases connect from this machine (no writes)
npm run test-conn

# 2. See exactly how many rows would load, per table (no writes)
npm run dry-run

# 3. Execute the catch-up sync + refresh the report.* views
npm run sync
```

`npm run sync` is safe to re-run — it's incremental (only pulls rows past the
high-water mark) and upserts on primary key, so nothing double-loads.

```bash
# Optional: just re-refresh the report.* matviews without a sync
npm run refresh
```

## How it works

- **Small dimension tables** (`admin_bot`, `admin_attribute`) → full reload each run.
- **Big fact tables** (`admin_conversation`, `admin_chat_history`, …) → incremental
  by high-water mark on `id`, batched, upserted on PK.
- Column lists are read from each side's `information_schema` at runtime and
  intersected — no hardcoded columns, survives schema drift.
- After loading, `REFRESH MATERIALIZED VIEW CONCURRENTLY` on each `report.*` view.

## Notes / Phase-2 TODO

- `admin_conversation` rows can be **updated** after close (outcome/status change).
  `id`-based sync catches new rows but not updates to old ones. Phase-2 options:
  switch its `syncKey` to `updated_at` (if present) or add a periodic full refresh.
- Never commit `.env` (git-ignored).
