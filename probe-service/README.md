# Ahhh FAQ It — Probe Service

Drives a live Botscrew chat widget in **headless Chromium** and captures each
answer as a guest would see it. Runs on a small server (a DigitalOcean droplet);
ShredIntel's `/api/probe` proxies to it, so the audit runs **server-side, never
in anyone's browser**.

Why a server and not Vercel: the widget messages over **WebSocket** (no HTTP
send endpoint to replicate), so the probe must be a real browser — and a full
audit can run for minutes, past any serverless timeout. A persistent droplet has
no such limit.

## API

```
GET  /health                          → { ok: true }
POST /probe                           (Authorization: Bearer <PROBE_TOKEN>)
     { widgetUrl, questions[], concurrency? }
     → { results: [{ q, a, ms, error? }], ms, count }
```

`widgetUrl` must be on `bots.getskitickets.com`. Up to 100 questions/run, up to
6 in parallel.

## Deploy to a DigitalOcean droplet (~10 min)

1. **Create the droplet.** DigitalOcean → Create → Droplet. Pick the
   **Docker on Ubuntu** Marketplace image, the cheapest **2 GB / 1 vCPU** plan
   ($12/mo — Chromium needs the RAM; the $6 box is too small). Add your SSH key.

2. **Copy this folder up** (from your machine, in `dev/shredintel`):

   ```bash
   scp -r probe-service root@YOUR_DROPLET_IP:/root/probe-service
   ```

3. **SSH in, set the token, build, run:**

   ```bash
   ssh root@YOUR_DROPLET_IP
   cd /root/probe-service

   # generate a secret and save it (you'll paste the same value into Vercel)
   export TOKEN=$(openssl rand -hex 32); echo "$TOKEN"

   docker build -t gsb-probe .
   docker run -d --name probe --restart unless-stopped \
     -p 8080:8080 -e PROBE_TOKEN="$TOKEN" gsb-probe
   ```

4. **Smoke test** (on the droplet):

   ```bash
   curl localhost:8080/health          # → {"ok":true,...}
   ```

5. **Lock it down.** Only Vercel should reach port 8080. Simplest: DigitalOcean
   Cloud Firewall → allow inbound `8080` from anywhere but keep the bearer token
   (already required). Better: put it behind Caddy/nginx with a real domain +
   HTTPS. For a first cut, token-over-HTTP is acceptable since the browser never
   talks to it — only Vercel does.

6. **Point ShredIntel at it.** In the Vercel project (shredintel) → Settings →
   Environment Variables, add:

   | Name | Value |
   |---|---|
   | `PROBE_SERVICE_URL` | `http://YOUR_DROPLET_IP:8080` |
   | `PROBE_SERVICE_TOKEN` | the `$TOKEN` from step 3 |

   Redeploy. Now the discreet **Ahhh FAQ It** link on a bot page → **Go** runs a
   real audit.

## Update after code changes

```bash
scp -r probe-service root@YOUR_DROPLET_IP:/root/
ssh root@YOUR_DROPLET_IP 'cd /root/probe-service && docker build -t gsb-probe . && docker rm -f probe && docker run -d --name probe --restart unless-stopped -p 8080:8080 -e PROBE_TOKEN="$(cat .token)" gsb-probe'
```

(Save the token to `/root/probe-service/.token` on first deploy if you want the
one-liner above to work.)

## Run locally (optional)

```bash
cd probe-service
npm install
npx playwright install chromium
PROBE_TOKEN=dev npm start
# then:
curl -s localhost:8080/probe -H 'authorization: Bearer dev' -H 'content-type: application/json' \
  -d '{"widgetUrl":"https://bots.getskitickets.com/widget-demo/b924a927-14f8-4955-ac87-0a74e73408df?isTestMode=true","questions":["How much are lift tickets?"]}'
```

## Roadmap

- **Background jobs** (`POST /probe/start` → `GET /probe/:id`) so the full
  100-question audit runs past any proxy timeout and streams progress.
- **Knowledge-layer grading** — join each captured answer back to its source
  layer (Instructions / Text Edits / Website / Files / Failed) so gaps aren't
  just heuristic.
- **Voice parity** — same idea against the voice channel.
