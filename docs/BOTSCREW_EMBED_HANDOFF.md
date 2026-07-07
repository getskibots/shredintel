# ShredIntel × BotScrew — Analytics Embed Integration

**Handoff for Daria (BotScrew) — prepared 2026-07-07**

This document is everything needed to embed the ShredIntel analytics dashboard
inside the BotScrew admin's **Analytics** tab, per-bot and securely. It is grounded
in a live inspection of the real admin (Jackson Hole, bot 43) done on 2026-07-07 —
see **§2 Verified environment**.

---

## 1. TL;DR — BotScrew's surface is tiny (3 things)

Everything about the dashboard, the data, and the security enforcement lives on the
GetSkiBots (GSB) side. BotScrew only needs to:

1. **Add one session-authed endpoint** — `GET /api/private/analytics-token?botId={id}`
   that returns `{ "token": "<JWT>" }` (a 1-hour HS256 JWT signed with a shared secret).
   It slots in right next to your existing `/api/private/chart/...` endpoints.
2. **Include one hosted script** on the admin — `<script src="https://analytics.getskibots.com/embed.js" defer></script>`.
   It watches for the Analytics route, fetches a token, and swaps in the iframe. Nothing else to wire.
3. **Store one shared secret** (`BOTSCREW_TOKEN_SECRET`, 32+ chars) that GSB gives you, used only to sign the JWT.

That's the whole integration on your end. No new UI, no data plumbing, no session table.

---

## 2. Verified environment (live recon, admin bot 43, 2026-07-07)

I inspected the running admin so the loader is built against reality, not guesses:

| What | Finding | Why it matters |
|---|---|---|
| **Router** | pathname-based (BrowserRouter), route `/admin/bot/{id}/analytics`, **no `#`** | Loader watches `history.pushState` + `popstate` and matches `/admin/bot/(\d+)/analytics`. |
| **Mount point** | A `<main>` element wraps the page content (right of the ~110px sidebar; today its single child is `div.styles_container__…`) | Loader targets `<main>` by default — no per-page selector needed. |
| **Existing iframes** | The admin **already runs iframes** (the `/widget/` chat preview + a GTM `/ns.html`) | Iframe embedding is a normal, permitted pattern here — nothing structurally blocks ours. |
| **CSP** | **No `<meta http-equiv="Content-Security-Policy">`** in the document; injecting a test iframe to `analytics.getskibots.com` produced **no "Refused to frame" error** | Your admin does **not** need any CSP/`frame-src` change to allow our iframe. |
| **Analytics API pattern** | `GET /api/private/chart/{metric}/{botId}?from=YYYY-MM-DD&to=YYYY-MM-DD` (users, conversationCovering, hourlyConversation), `GET /api/private/bot/{botId}/analytics/funnels`, all **session-cookie authed** | The new token endpoint fits this exact convention: `/api/private/…`, session-authed, botId param. |
| **Backend** | Java / Spring + MongoDB | JWT signing example below uses `jjwt` (io.jsonwebtoken). |

**One prerequisite is on the GSB side, not yours** — see §3.

---

## 3. ⚠️ GSB-side prerequisite (do this first, before testing)

During recon, framing `analytics.getskibots.com` from inside the admin **redirected to
`vercel.com/sso-api` → `vercel.com/login`**. The domain is currently behind **Vercel
Deployment Protection (Vercel Authentication)**. It loads fine in a normal browser tab
(that browser has a Vercel session cookie), but a cross-site **iframe** carries no such
cookie, so it bounces to a Vercel login instead of the dashboard.

**Action (GSB):** In the Vercel project → **Settings → Deployment Protection**, make the
production domain **publicly accessible** (disable protection on production, or restrict
protection to preview deployments only). End users are resort staff with no Vercel
accounts, so the production URL must be genuinely public. Until this is done, the embed
will show a Vercel login screen for everyone except Brandon.

This is a GSB task — flagged here so it isn't discovered as a mystery "blank/login iframe"
during BotScrew's testing.

---

## 4. How it works (the flow)

```
BotScrew admin (bots.getskitickets.com)          GSB (analytics.getskibots.com)
──────────────────────────────────────          ──────────────────────────────
1. Admin navigates to /admin/bot/43/analytics
2. embed.js detects the route
3. embed.js → GET /api/private/analytics-token?botId=43   (session cookie)
        │  (your endpoint verifies the session, signs a JWT)
        └──────────────► { token: "eyJ…" }
4. embed.js replaces <main> with:
   <iframe src="https://analytics.getskibots.com/?embed=1#/bot/43?token=eyJ…">
5.                                        ──────────►  App boots in embed mode
6.                                        Every data/API call carries
                                          Authorization: Bearer <token>
7.                                        Server verifies the JWT, and takes
                                          botId FROM THE TOKEN (ignores any
                                          client-supplied botId) → returns only
                                          bot 43's data. Tampered/expired → 401.
8. iframe posts its height back via postMessage; embed.js resizes the frame.
```

**Design intent:** stateless — the JWT *is* the session. No cookies in the cross-site
flow (works in Safari / with third-party cookies blocked), no session table, and per-bot
data isolation is enforced **server-side** because `report.*` are materialized views the
client can't be trusted to scope.

---

## 5. Part A — BotScrew's token endpoint (your one deliverable)

Add an endpoint at **`GET /api/private/analytics-token?botId={id}`**, protected by the
**same session auth as your other `/api/private/` endpoints**. It returns a short-lived
HS256 JWT.

### Token contract

| Claim | Type | Value / rule |
|---|---|---|
| `botId` | **number** | the bot being viewed (must be a JSON number, not a string) |
| `iss` | string | `"botscrew"` |
| `iat` | number | issued-at (epoch seconds) |
| `exp` | number | expiry — **≤ 1 hour** after `iat` |
| alg | — | **HS256**, signed with the shared secret (§6) |

Response body: `{ "token": "<jwt>" }`, `Content-Type: application/json`.

### Spring example (using `io.jsonwebtoken` / jjwt)

```java
@GetMapping("/api/private/analytics-token")
public Map<String, String> analyticsToken(@RequestParam long botId /*, session/principal */) {
    // The caller is already session-authenticated (same guard as /api/private/chart/**).
    // OPTIONAL but recommended: assert the logged-in admin may access `botId`
    //   (same check your analytics page already relies on) — else 403.

    Instant now = Instant.now();
    String token = Jwts.builder()
        .claim("botId", botId)                 // NUMBER claim (important)
        .setIssuer("botscrew")
        .setIssuedAt(Date.from(now))
        .setExpiration(Date.from(now.plusSeconds(3600)))   // <= 1h
        .signWith(
            Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8)),  // secret = BOTSCREW_TOKEN_SECRET
            SignatureAlgorithm.HS256)
        .compact();

    return Map.of("token", token);
}
```

### Rules & edge cases

- **Session required.** If the admin isn't logged in, respond as your other `/api/private/`
  endpoints do (401/redirect). The token endpoint must never be callable anonymously — it's
  the trust boundary that says "this logged-in admin is allowed to view this bot."
- **`botId` from the request is fine here** because your session auth is what's being trusted;
  the JWT then carries that botId to us. (On our side, once a token exists, we ignore any
  client-supplied botId and use the token's — see §8.)
- **Short expiry.** ≤ 1h. The loader re-fetches a fresh token on each navigation to the
  analytics route, so expiry mid-session is a non-issue.
- **No CORS needed** — the loader calls this endpoint **same-origin** (`credentials:'same-origin'`).

---

## 6. Part B — Include the loader (your second deliverable)

Add this one line to the admin shell (wherever global scripts load), or inject it on the
analytics route:

```html
<script src="https://analytics.getskibots.com/embed.js" defer></script>
```

What GSB's `embed.js` does (you don't implement any of this — it's hosted by us):

- Wraps `history.pushState` + listens to `popstate` to detect SPA navigation.
- On matching `/admin/bot/(\d+)/analytics`: calls `GET /api/private/analytics-token?botId={id}`
  (`credentials:'same-origin'`), then injects the iframe into **`<main>`** (verified mount point).
- Iframe src: `https://analytics.getskibots.com/?embed=1#/bot/{id}?token={jwt}` — full width,
  no border, min-height ~80vh.
- Listens for `postMessage {source:'shredintel', type:'height', height}` (origin-checked to
  `https://analytics.getskibots.com`) and resizes the iframe to fit — no inner scrollbar.
- Removes the iframe when navigating away from the analytics route.
- Idempotent (safe if the script is included twice), and on token-fetch failure renders a
  plain "Analytics is temporarily unavailable" fallback — never a broken frame.

**Optional override** — if you ever move the content out of `<main>`, set a selector before
the script loads: `window.SHREDINTEL_MOUNT = '#your-content-container';`. Not needed today.

---

## 7. Part C — Shared secret exchange

- GSB generates a random **32+ char** secret and shares it with you over a secure channel
  (1Password / secrets manager — **not** email/Slack in plaintext).
- Store it as `BOTSCREW_TOKEN_SECRET` in your backend config/secrets (never in the client
  bundle, never committed). It's only used server-side to *sign* the JWT.
- GSB holds the identical value server-side to *verify*. HS256 is symmetric — same secret
  both sides.
- **Rotation:** to rotate, GSB can accept two secrets during a short overlap window; coordinate
  timing so tokens signed with the old secret still verify until they expire (≤1h).

---

## 8. What GSB owns (for context — you don't build these)

So the responsibility split is unambiguous:

| Piece | Owner |
|---|---|
| `GET /api/private/analytics-token` endpoint | **BotScrew** |
| Include `<script src=".../embed.js">` | **BotScrew** |
| Store `BOTSCREW_TOKEN_SECRET` | **BotScrew** |
| The dashboard app + all analytics data | GSB |
| `embed.js` loader (hosted at analytics.getskibots.com) | GSB |
| **JWT verification on every data endpoint** (Bearer, HS256, require `botId`+`iss`+`exp`; botId from token, ignore client-supplied) | GSB |
| Make `analytics.getskibots.com` public + add `Content-Security-Policy: frame-ancestors https://bots.getskitickets.com` | GSB |
| Generate + share the secret; soft→strict rollout | GSB |

**Rollout safety (GSB):** the server runs in `soft` mode first — requests without a Bearer
token behave as today, so nothing breaks while your endpoint is still being built. Once your
endpoint ships and is verified, GSB flips to `strict` (401 without a valid token). No
coordinated big-bang deploy required.

---

## 9. Test / acceptance checklist

Once §3 (public domain) is done and the secret is exchanged:

1. **Happy path** — open `/admin/bot/43/analytics`: token endpoint returns `{token}`, iframe
   appears in `<main>`, JH's dashboard renders, iframe auto-sizes to content.
2. **Per-bot isolation** — open a different bot's analytics: the iframe shows *that* bot; a
   token minted for bot A can never surface bot B's data (GSB enforces botId from the token).
3. **Route cleanup** — navigate away from analytics → iframe is removed; navigate back → fresh
   token + fresh iframe.
4. **Expiry** — an expired/tampered token yields a clean "session expired, reload" card, never
   partial data (GSB side).
5. **Safari** — works with third-party cookies blocked (no cookies in the cross-site flow).
6. **Double-include** — including the script twice is harmless (idempotent).

---

## 10. Open questions for Daria

1. **Where to include the script** — is there a global admin layout/shell where a `<script>` is
   cleanest, or should it be injected on the analytics route specifically?
2. **Per-admin bot authorization** — does your session already gate which bots a given admin may
   view? If so, we'd like the token endpoint to enforce it (only mint a token for bots the admin
   can access). What's the existing check to reuse?
3. **Secret management** — preferred secure channel to receive `BOTSCREW_TOKEN_SECRET`, and do you
   have a rotation policy we should match?
4. **Any WAF/proxy** in front of the admin that could strip an `Authorization` header or block the
   `analytics.getskibots.com` origin? (We saw none, but worth confirming for prod.)

---

### Appendix — quick reference

- **Loader tag:** `<script src="https://analytics.getskibots.com/embed.js" defer></script>`
- **Token endpoint:** `GET /api/private/analytics-token?botId={id}` → `{ "token": "<HS256 JWT>" }`
- **JWT claims:** `{ botId:<number>, iss:"botscrew", iat, exp≤iat+3600 }`, signed HS256 with `BOTSCREW_TOKEN_SECRET`
- **Iframe URL (loader builds this):** `https://analytics.getskibots.com/?embed=1#/bot/{id}?token={jwt}`
- **Mount target:** `<main>` (override via `window.SHREDINTEL_MOUNT`)
- **Height message:** `postMessage({source:'shredintel', type:'height', height}, ...)` — origin `https://analytics.getskibots.com`
