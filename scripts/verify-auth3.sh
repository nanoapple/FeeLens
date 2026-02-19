#!/bin/bash
# ==========================================
# Auth-3 Role Verification Script
#
# Tests all 3 role tiers can log in and get correct RPC results.
# Run after: supabase db reset && npm run dev
#
# Requires: jq (brew install jq / apt-get install jq)
#
# Usage:
#   chmod +x scripts/verify-auth3.sh
#   ./scripts/verify-auth3.sh
# ==========================================

set -e

echo "=========================================="
echo "Auth-3: Role Verification"
echo "=========================================="
echo ""

# ── Prereqs ──
if ! command -v jq &> /dev/null; then
  echo "❌ jq is required but not installed."
  echo "   Install: brew install jq  (macOS) or  sudo apt-get install jq  (Linux)"
  exit 1
fi

# ── Config ──
SUPABASE_URL="http://localhost:54321"
ANON_KEY=$(supabase status -o env 2>/dev/null | grep ANON_KEY | cut -d'=' -f2)

if [ -z "$ANON_KEY" ]; then
  echo "❌ Cannot read ANON_KEY. Is Supabase running? (supabase start)"
  exit 1
fi

echo "✓ Supabase is running"
echo "✓ jq is available"
echo ""

PASS=0
FAIL=0

# ── Helper: login and test role ──
test_user() {
  local EMAIL=$1
  local PASSWORD=$2
  local EXPECTED_MOD_OR_ADMIN=$3  # "true" or "false"
  local EXPECTED_IS_ADMIN=$4      # "true" or "false"
  local LABEL=$5

  echo "── Testing: $LABEL ($EMAIL) ──"

  # Login
  local LOGIN_RESP
  LOGIN_RESP=$(curl -s -X POST "$SUPABASE_URL/auth/v1/token?grant_type=password" \
    -H "apikey: $ANON_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")

  local TOKEN
  TOKEN=$(echo "$LOGIN_RESP" | jq -r '.access_token // empty')

  if [ -z "$TOKEN" ]; then
    echo "  ❌ Login FAILED"
    echo "  Error: $(echo "$LOGIN_RESP" | jq -r '.error_description // .msg // "unknown"')"
    FAIL=$((FAIL + 1))
    echo ""
    return
  fi
  echo "  ✓ Login OK"

  # Test is_moderator_or_admin()
  local MOD_RESP
  MOD_RESP=$(curl -s -X POST "$SUPABASE_URL/rest/v1/rpc/is_moderator_or_admin" \
    -H "apikey: $ANON_KEY" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{}')

  if [ "$MOD_RESP" = "$EXPECTED_MOD_OR_ADMIN" ]; then
    echo "  ✓ is_moderator_or_admin() = $MOD_RESP"
    PASS=$((PASS + 1))
  else
    echo "  ❌ is_moderator_or_admin() = $MOD_RESP (expected: $EXPECTED_MOD_OR_ADMIN)"
    FAIL=$((FAIL + 1))
  fi

  # Test is_admin()
  local ADMIN_RESP
  ADMIN_RESP=$(curl -s -X POST "$SUPABASE_URL/rest/v1/rpc/is_admin" \
    -H "apikey: $ANON_KEY" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{}')

  if [ "$ADMIN_RESP" = "$EXPECTED_IS_ADMIN" ]; then
    echo "  ✓ is_admin() = $ADMIN_RESP"
    PASS=$((PASS + 1))
  else
    echo "  ❌ is_admin() = $ADMIN_RESP (expected: $EXPECTED_IS_ADMIN)"
    FAIL=$((FAIL + 1))
  fi

  # Test has_role() — verify the specific role
  local ROLE_RESP
  ROLE_RESP=$(curl -s -X POST "$SUPABASE_URL/rest/v1/rpc/has_role" \
    -H "apikey: $ANON_KEY" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"p_role":"user"}')

  echo "  ℹ has_role('user') = $ROLE_RESP"

  echo ""
}

# ── Run tests ──

test_user "admin@feelens.local" "adminpass123" "true"  "true"  "ADMIN"
test_user "mod@feelens.local"   "modpass123"   "true"  "false" "MODERATOR"
test_user "test@feelens.local"  "testpass123"  "false" "false" "NORMAL USER"
test_user "user2@feelens.local" "testpass123"  "false" "false" "NORMAL USER 2"

echo "=========================================="
echo "Results: $PASS passed, $FAIL failed"
echo ""
echo "Expected browser behavior:"
echo "  admin@feelens.local    → /admin/* ✓  (full access)"
echo "  mod@feelens.local      → /admin/* ✓  (view + moderate, no provider approval)"
echo "  test@feelens.local     → /admin/* ✗  (redirected to /)"
echo "  Not logged in          → /admin/* ✗  (redirected to /login)"
echo "=========================================="

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
