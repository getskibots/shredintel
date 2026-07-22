# BotScrew Platform DB — Schema Catalog & API Scope

**Database:** `botscrew_platform` · **83 base tables · 546 columns · 0 views.**
ShredIntel currently mirrors **7** of these. This catalog describes all 83 and
recommends which belong in a bot-scoped API contract.

## How bot-scoping works (the one thing to standardize)

Almost every data table carries a `user_id`, and **`admin_user.bot_id` is the
single anchor** that ties a visitor to a bot. So the universal scoping rule is:

```
<table>.user_id  →  admin_user.id  (admin_user.bot_id = :botId)
```

Direct exceptions: `admin_bot` (scope by `id`), `admin_user` (`bot_id` directly),
`admin_attribute` (`bot_id` directly). Indirect: `admin_conversation` and
`admin_call` reach `bot_id` through `user_id` (call goes `conversation_id → conversation.user_id → user.bot_id`).

No table needs date filtering on BotScrew's side — return all history, incremental
by `id`; ShredIntel windows by date downstream.

---

## Tier 1 — Core conversation data (INCLUDE — already mirrored today)

| Table | Rows | Scope | What it is / key columns |
|---|---|---|---|
| **admin_bot** | 455 | `id` | The bot itself. `name`, `active`, `type`, `parent_bot_id`, `timezone`, `public_identifier`, plus config FKs (`voice_configs_id`, `twilio_configs_id`, `odin_configs_id`…). The resort/channel registry. |
| **admin_user** | 503,697 | `bot_id` | The visitor record + **the bot anchor**. Rich: `bot_id`, `platform`, `first_name`/`last_name`/`email`/`phone` (PII), `page_url`, `ip_address`/`ip_address_country` (PII), `browser`, `device_category`, `browser_language`, `timezone`, `language_id`, `registered_at`. Geo, device, page, identity all live here. |
| **admin_conversation** | 758,281 | `user_id`→bot | One session/thread. `started_at`, `closed_at`, `last_message_date_time`, `user_id`, `outcome`. (Note: no `bot_id` column — scope via user.) |
| **admin_chat_history** | 4,899,918 | `user_id` / `conversation_id` | Every message. `message` (json), `native_message`, `is_message`, `is_echo`, `is_from_support` (live-agent flag), `visible`, `timestamp`, `user_id`, `conversation_id`, `admin_id`, `language_id`, `postback`, `page_id`. The transcript spine. |
| **admin_knowledge_reply** | 447,572 | `user_id`→bot | Answer-source metadata per bot reply. `user_phrase`, `odin_reply`, `source_type`/`source_value`/`source_name`/`source_id`, `is_failed`, `contextualized_user_phrase`, `sent_at`. Powers "answered from what" + failure rate. |
| **admin_attribute** | 16,658 | `bot_id` | Attribute definitions (the fields a bot captures). `name`, `type`, `bot_id`. Needed to label the values below. |
| **admin_attribute_user_value** | 1,406,995 | `user_id`→bot | Captured attribute/lead values per visitor. `value`, `attribute_id`, `user_id`. Lead capture + any custom data the bot collected. |

---

## Tier 2 — High-value additions (INCLUDE — new signal we don't have today)

| Table | Rows | Scope | Why it's worth pulling |
|---|---|---|---|
| **admin_call** | 16,239 | `conversation_id`→conv→user | **Voice call metadata.** `call_sid`, `recording_sid`, `summary`, `from_city`/`from_country`, `recording_status`. Ground-truth voice enrichment (we partly use this already but it isn't in the curated 7). |
| **admin_feedback** | 2,010 | `user_id`→bot | **CSAT.** `score`, `comment`, `date`, `message_id`, `user_id`. A real satisfaction rating we have no equivalent for today. |
| **admin_support_request** | 27,461 | `user_id`→bot | **Human handover ground truth.** `status`, `admin_id` (which agent), `user_id`, `expiration_date`. Today we *infer* escalation; this is the actual record. |
| **admin_support_events_history** | 73,364 | `support_request_id`→req→user | Handover timeline. `event`, `timestamp` per support request. Time-to-agent, resolution flow. |
| **admin_support_chat_info** | 528,506 | `user_id` | Per-visitor support state. `support_request_id`, `last_event_at`, `last_user_action_at`, `last_message_at`, `message_preview`. Links a conversation to its support episode. |
| **admin_web_button_click** | 24,021 | `user_id`→bot | **CTA / button engagement.** `url`, `metadata`, `time`, `user_id`. Intent + funnel signal (what guests actually click). |

---

## Tier 3 — Situational (MAYBE — pull if the matching feature is on the roadmap)

| Table | Rows | Note |
|---|---|---|
| **admin_widget_greeting_event** | 18,710,058 | Greeting **impressions** (`event`, `timestamp`, `user_id`). Enables an impression→engagement *reach* funnel, but it's huge (heaviest table in the DB) — pull only if reach metrics are wanted. Deliberately skipped today. |
| **admin_nlp_request** | 362,792 | NLP detections: `user_say`, `triggered_intent_id`, `detection_confidence`, `user_id`. Intent-classification signal. (`detection_confidence` is deprecated/noisy per prior research.) |
| **admin_api_call_history** | 107,194 | External API / AI-action calls the bot made: `url`, `request_body`, `response_body`, `status_code`, `atom_id`, `user_id`. Tool-use + failure analytics — but bodies are large and may carry PII. |
| **admin_voice_configs** | 149 | Voice setup per bot: `voice`, `model`, `transcription_model`, `greeting`. Context for voice bots. |
| **admin_intent** | 457 | Intent/FAQ taxonomy: `name`, `user_phrase`, `faq`, `odin_id`, `bot_id`. Labels for NLP requests. |
| **admin_ai_action** / **_param** / **_param_value** | 640 / 425 / 6 | AI-action (function/tool) definitions per bot: `name`, `description`, params. Labels for `admin_api_call_history`. |
| **admin_atom** / **admin_flow** | 7,991 / 3,337 | Bot conversation building blocks + flows: `name`, `bot_id`. Lets us name atom-driven messages. |
| **admin_funnel** / **_step** / **_step_atom** | 16 / 33 / 33 | BotScrew's own funnel definitions (`name`, `bot_id`). Their notion of funnels — worth comparing to ours. |
| **admin_language** / **admin_bot_language** | 144 / 470 | Language dimension + per-bot languages. We already use `language_id`; these give the labels. |
| **admin_attribute_default_value** / **_suggestion_value** | 627 / 54 | Attribute config defaults. Minor. |

---

## Tier 4 — Skip (framework, secrets, config, or empty)

**Framework / infra (15) — no analytics value:** `DATABASECHANGELOG`,
`DATABASECHANGELOGLOCK` (Liquibase migrations); `QRTZ_*` (11 Quartz scheduler
tables); `TOGGLZ` (feature flags).

**Auth / secrets / channel config (18) — do NOT pull (tokens, keys, passwords):**
`admin_admin` (staff logins + password hashes), `admin_api_key`,
`admin_reset_password_token`, `admin_bot_access`, `admin_bot_invite`,
`admin_bot_invite_access`, `admin_twilio_configs` (auth tokens),
`admin_odin_configs`, `admin_messenger_configs`, `admin_telegram_configs`,
`admin_dialogflow_configs`, `admin_amio_whatsapp_configs`,
`admin_dialog360_whatsapp_configs`, `admin_witai_app`, `admin_witai_configs`,
`admin_zapier_configs` (+ `_attribute`), `admin_support_settings`.

**Empty / internal-state / bookkeeping (~23):** `admin_context`,
`admin_dynamic_payload`, `admin_random_atom`, `admin_broadcast` (+ `_tags`),
`admin_user_last_random_text`, `admin_user_last_random_atom`,
`admin_user_first_time_random_redirect`, `admin_*_tags` (atom/bot/user/tag — all
empty), `admin_chat_export_job`, `admin_widget_default_translation`,
`admin_dialog360_whatsapp_media`, `admin_nlp_provider` (+ `_language`),
`admin_copilot_config`, `admin_witai_configs_apps`, `admin_twilio_stored_pending_payload`,
`admin_support_request_notification`.

---

## Key findings for the API decision

1. **`user_id` is the universal join key.** Nearly every table hangs off
   `admin_user`, so the API is simple: for each table, `JOIN admin_user USING(user_id)
   WHERE admin_user.bot_id = :botId`, rows `WHERE id > :cursor ORDER BY id`. One
   pattern, every table.

2. **The resort-merge lever exists in the data.** `admin_bot.parent_bot_id` and
   `admin_bot.type`, plus `admin_user.platform`, distinguish and group channels.
   If BotScrew populates `parent_bot_id`, a resort-level (merged) dashboard is
   feasible later — the grouping doesn't have to be invented. Worth confirming
   with Daria whether `parent_bot_id` is reliably set.

3. **Insist on whole-row feeds for Tier 1+2, not curated columns.** New columns
   BotScrew adds then flow through for free; only a genuinely new *table* needs a
   new endpoint. With 76 tables outside our current 7, that flexibility matters.

4. **Explicitly exclude secrets.** Several config tables hold `auth_token` /
   `api_key` / `password`. The API should never return those, even for included
   bots.

5. **PII columns** (`email`, `phone`, `first_name`, `last_name`, `ip_address` on
   `admin_user`; bodies in `admin_api_call_history`) come through the feed but
   should stay on the authorized, bot-scoped path, never anon-exposed — same rule
   we already apply.
