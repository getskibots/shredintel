-- report._ai_prompts — the two editable AI-instruction layers for ShredIntel.
--
--   bot_id = 0  → MASTER  (global ShredIntel base: persona + report methodology,
--                          shared by every bot; GetSkiBots-controlled)
--   bot_id > 0  → SLAVE   (per-bot, resort-specific guidance)
--
-- Both layers are read server-side by /api/ask and /api/realtime-session and
-- appended AFTER the fixed grounding in api/_lib/{prompts,voices}.ts. They can
-- NEVER override the schema / SQL-safety / date-window / chart-safety rules.
--
-- The `_` prefix keeps this table OUT of schemaCatalog() (which excludes _* rels),
-- so the model never sees its own prompts as a queryable source.
--
-- Read/write path: api/prompt.ts (GET/POST) ← src/components/PromptEditor.
-- The master row (bot_id 0) is seeded from the ShredIntel Resort Performance
-- Report Template; edit it via the "Master · all resorts" tab or SQL.

create table if not exists report._ai_prompts (
  bot_id     integer primary key,        -- 0 = master (global); else per-bot slave
  prompt     text not null default '',
  updated_at timestamptz not null default now()
);

-- Master seed lives in the app (see the MASTER string in the one-off seed and
-- the "Master · all resorts" editor). To (re)seed manually:
-- insert into report._ai_prompts (bot_id, prompt) values (0, '<master prompt>')
--   on conflict (bot_id) do update set prompt = excluded.prompt, updated_at = now();
