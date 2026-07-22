#!/usr/bin/env bash
# Usage: ./scripts/deploy.sh "commit message"
# Commits staged changes, pushes to main, then redeploys the Portainer stack.
# Requires PORTAINER_TOKEN env var (set in .env.deploy or export before running).

set -e

# Load token from local .env.deploy if present (not committed to git)
if [ -f "$(dirname "$0")/../.env.deploy" ]; then
  source "$(dirname "$0")/../.env.deploy"
fi

if [ -z "$PORTAINER_TOKEN" ]; then
  echo "Error: PORTAINER_TOKEN not set. Create .env.deploy with: PORTAINER_TOKEN=ptr_..." >&2
  exit 1
fi

MSG="${1:-deploy}"
PORTAINER="${PORTAINER_URL:-http://192.168.20.7:9000}"
STACK_ID="${PORTAINER_STACK_ID:-26}"
ENDPOINT_ID="${PORTAINER_ENDPOINT_ID:-3}"

echo "==> Committing: $MSG"
git commit -m "$MSG

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"

echo "==> Pushing to origin/main..."
# Use Authorization header to avoid persisting the token in .git/config
GIT_ASKPASS=/bin/true git \
  -c "credential.helper=" \
  -c "http.extraHeader=Authorization: Basic $(printf "%s:%s" "${GITHUB_USER:-Bloodyly}" "${GITHUB_TOKEN}" | base64 -w0)" \
  push origin main

echo "==> Triggering Portainer redeploy (Stack $STACK_ID)..."
RESULT=$(curl -s -X PUT \
  -H "X-API-Key: $PORTAINER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"pullImage": false, "prune": false}' \
  "${PORTAINER}/api/stacks/${STACK_ID}/git/redeploy?endpointId=${ENDPOINT_ID}")

echo "$RESULT" | python3 -c "
import sys, json
r = json.load(sys.stdin)
print(f'OK — Stack: {r.get(\"Name\")} | Status: {r.get(\"Status\")}')
" 2>/dev/null || echo "Response: $RESULT"
