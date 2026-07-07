#!/usr/bin/env bash
# One-shot deploy: open the port, build the image, run the container, print the
# token + health check. Safe to re-run (it replaces any existing container).
set -e
cd /root/probe-service

echo ">>> opening port 8080"
ufw allow 8080/tcp || true

# Reuse the existing token on re-runs so rebuilds don't rotate it (Vercel stays valid).
if [ -f /root/probe-service/.token ]; then
  TOKEN=$(cat /root/probe-service/.token)
else
  TOKEN=$(openssl rand -hex 32)
  echo "$TOKEN" > /root/probe-service/.token
fi

echo ">>> building image (this takes ~2-4 min)"
docker build -t gsb-probe .

echo ">>> starting container"
docker rm -f probe 2>/dev/null || true
docker run -d --name probe --restart unless-stopped -p 8080:8080 -e PROBE_TOKEN="$TOKEN" gsb-probe

sleep 4
echo ""
echo "======================================"
echo "HEALTH:"
curl -s localhost:8080/health || echo "(no response yet)"
echo ""
echo "TOKEN: $TOKEN"
echo "======================================"
