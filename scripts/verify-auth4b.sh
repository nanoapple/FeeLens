#!/usr/bin/env bash
# ==========================================
# scripts/verify-auth4b.sh (patched)
# Verifies Auth-4b Edge submit flow with the new API contract:
#   Success: { ok: true, data: ... }
#   Error:   { ok: false, error_code, message, details? }
# ==========================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

PASS=0
FAIL=0

pass() { ((PASS++)); echo -e "  ${GREEN}✓${NC} $1"; }
fail() { ((FAIL++)); echo -e "  ${RED}✗${NC} $1"; }
info() { echo -e "  ${YELLOW}ℹ${NC} $1"; }

SUPABASE_URL="${SUPABASE_URL:-http://127.0.0.1:54321}"

ANON_KEY=$(supabase status 2>/dev/null | grep -oE 'sb_publishable_[A-Za-z0-9_-]+' | head -n1 || true)
if [ -z "${ANON_KEY}" ]; then
  echo -e "${RED}ERROR: Cannot get Publishable anon key from 'supabase status'. Is Supabase running?${NC}"
  exit 1
fi

APPROVED_RE_PROVIDER="00000000-0000-0000-0000-000000000101"
APPROVED_LEGAL_PROVIDER="00000000-0000-0000-0000-000000000201"
PENDING_PROVIDER="00000000-0000-0000-0000-000000000901"
FAKE_PROVIDER="00000000-0000-0000-0000-ffffffffffff"

echo "=========================================="
echo "Auth-4b: Submit Flow Verification"
echo "=========================================="
echo ""

login() {
  local email="$1"
  local password="$2"
  curl -s "${SUPABASE_URL}/auth/v1/token?grant_type=password" \
    -H "apikey: ${ANON_KEY}" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"${email}\",\"password\":\"${password}\"}" \
    | jq -r '.access_token // empty'
}

get_user_id() {
  local token="$1"
  curl -s "${SUPABASE_URL}/auth/v1/user" \
    -H "apikey: ${ANON_KEY}" \
    -H "Authorization: Bearer ${token}" \
    | jq -r '.id // empty'
}

call_fn() {
  local fn="$1"
  local token="$2"
  local payload="$3"

  local tmp
  tmp="$(mktemp)"

  local http
  http=$(curl -sS -o "$tmp" -w "%{http_code}" "${SUPABASE_URL}/functions/v1/${fn}" \
    -H "apikey: ${ANON_KEY}" \
    -H "Authorization: Bearer ${token}" \
    -H "Content-Type: application/json" \
    -d "$payload" || true)

  local body
  body="$(cat "$tmp")"
  rm -f "$tmp"

  echo "$http"
  echo "$body"
}

expect_ok() {
  local http="$1"
  local body="$2"
  local label="$3"

  info "HTTP ${http} | raw body: ${body:0:280}"

  local ok
  ok="$(echo "$body" | jq -r '.ok // empty' 2>/dev/null || true)"

  if [ "$ok" = "true" ]; then
    pass "${label} returned ok=true"
    return 0
  fi

  local code msg
  code="$(echo "$body" | jq -r '.error_code // empty' 2>/dev/null || true)"
  msg="$(echo "$body" | jq -r '.message // empty' 2>/dev/null || true)"
  fail "${label} expected ok=true, got ok=${ok:-empty} code=${code:-empty} msg=${msg:-empty}"
  return 1
}

expect_error_code() {
  local http="$1"
  local body="$2"
  local want="$3"
  local label="$4"

  info "HTTP ${http} | raw body: ${body:0:280}"

  local ok code msg
  ok="$(echo "$body" | jq -r '.ok // empty' 2>/dev/null || true)"
  code="$(echo "$body" | jq -r '.error_code // empty' 2>/dev/null || true)"
  msg="$(echo "$body" | jq -r '.message // empty' 2>/dev/null || true)"

  if [ "$ok" = "false" ] && [ "$code" = "$want" ]; then
    pass "${label} returned error_code=${want}"
    info "message = ${msg}"
    return 0
  fi

  fail "${label} expected ok=false error_code=${want}, got ok=${ok:-empty} code=${code:-empty} msg=${msg:-empty}"
  return 1
}

echo "── Login test@feelens.local ──"
TOKEN="$(login "test@feelens.local" "testpass123")"
if [ -z "$TOKEN" ]; then
  echo -e "${RED}FATAL: Cannot login test@feelens.local${NC}"
  exit 1
fi
pass "Login OK"

USER_ID="$(get_user_id "$TOKEN")"
if [ -z "$USER_ID" ]; then
  echo -e "${RED}FATAL: Cannot fetch user id via /auth/v1/user${NC}"
  exit 1
fi
info "user_id = ${USER_ID}"
echo ""

# ── Test 1: submit-entry success ──────────────────────────────────────────
echo "── Test 1: submit-entry (real_estate, approved provider) ──"
read -r HTTP BODY < <( (call_fn "submit-entry" "$TOKEN" "{
  \"provider_id\": \"${APPROVED_RE_PROVIDER}\",
  \"property_type\": \"apartment\",
  \"management_fee_pct\": 7.5,
  \"management_fee_incl_gst\": true,
  \"hidden_items\": [\"admin_fee\"],
  \"quote_transparency_score\": 4
}") )
# call_fn prints two lines; bash read reads first only — so fetch body separately:
HTTP="$(call_fn "submit-entry" "$TOKEN" "{
  \"provider_id\": \"${APPROVED_RE_PROVIDER}\",
  \"property_type\": \"apartment\",
  \"management_fee_pct\": 7.5,
  \"management_fee_incl_gst\": true,
  \"hidden_items\": [\"admin_fee\"],
  \"quote_transparency_score\": 4
}" | sed -n '1p')"
BODY="$(call_fn "submit-entry" "$TOKEN" "{
  \"provider_id\": \"${APPROVED_RE_PROVIDER}\",
  \"property_type\": \"apartment\",
  \"management_fee_pct\": 7.5,
  \"management_fee_incl_gst\": true,
  \"hidden_items\": [\"admin_fee\"],
  \"quote_transparency_score\": 4
}" | sed -n '2p')"

if expect_ok "$HTTP" "$BODY" "submit-entry"; then
  ENTRY_ID_RE="$(echo "$BODY" | jq -r '.data.entry_id // .data.id // empty' 2>/dev/null || true)"
  info "entry_id = ${ENTRY_ID_RE:-unknown}"
fi
echo ""

# ── Test 2: create-entry-v2 success ───────────────────────────────────────
echo "── Test 2: create-entry-v2 (legal_services, approved provider) ──"
HTTP="$(call_fn "create-entry-v2" "$TOKEN" "{
  \"provider_id\": \"${APPROVED_LEGAL_PROVIDER}\",
  \"industry_key\": \"legal_services\",
  \"service_key\": \"conveyancing\",
  \"fee_breakdown\": {
    \"pricing_model\": \"fixed\",
    \"fixed_fee_amount\": 1500,
    \"gst_included\": true,
    \"total_estimated\": 1650
  },
  \"context\": { \"matter_type\": \"conveyancing\", \"jurisdiction\": \"NSW\" },
  \"quote_transparency_score\": 4
}" | sed -n '1p')"
BODY="$(call_fn "create-entry-v2" "$TOKEN" "{
  \"provider_id\": \"${APPROVED_LEGAL_PROVIDER}\",
  \"industry_key\": \"legal_services\",
  \"service_key\": \"conveyancing\",
  \"fee_breakdown\": {
    \"pricing_model\": \"fixed\",
    \"fixed_fee_amount\": 1500,
    \"gst_included\": true,
    \"total_estimated\": 1650
  },
  \"context\": { \"matter_type\": \"conveyancing\", \"jurisdiction\": \"NSW\" },
  \"quote_transparency_score\": 4
}" | sed -n '2p')"

if expect_ok "$HTTP" "$BODY" "create-entry-v2"; then
  ENTRY_ID_LEGAL="$(echo "$BODY" | jq -r '.data.entry_id // .data.id // empty' 2>/dev/null || true)"
  info "entry_id = ${ENTRY_ID_LEGAL:-unknown}"
fi
echo ""

# ── Test 3: Provider not found ────────────────────────────────────────────
echo "── Test 3: create-entry-v2 with fake provider ──"
HTTP="$(call_fn "create-entry-v2" "$TOKEN" "{
  \"provider_id\": \"${FAKE_PROVIDER}\",
  \"industry_key\": \"legal_services\",
  \"service_key\": \"conveyancing\",
  \"fee_breakdown\": { \"pricing_model\": \"fixed\", \"fixed_fee_amount\": 1000, \"gst_included\": true }
}" | sed -n '1p')"
BODY="$(call_fn "create-entry-v2" "$TOKEN" "{
  \"provider_id\": \"${FAKE_PROVIDER}\",
  \"industry_key\": \"legal_services\",
  \"service_key\": \"conveyancing\",
  \"fee_breakdown\": { \"pricing_model\": \"fixed\", \"fixed_fee_amount\": 1000, \"gst_included\": true }
}" | sed -n '2p')"
expect_error_code "$HTTP" "$BODY" "PROVIDER_NOT_FOUND" "create-entry-v2 fake provider"
echo ""

# ── Test 4: Provider not approved ─────────────────────────────────────────
echo "── Test 4: submit-entry with pending provider ──"
HTTP="$(call_fn "submit-entry" "$TOKEN" "{
  \"provider_id\": \"${PENDING_PROVIDER}\",
  \"property_type\": \"apartment\",
  \"management_fee_pct\": 8.0,
  \"management_fee_incl_gst\": true,
  \"hidden_items\": [],
  \"quote_transparency_score\": 3
}" | sed -n '1p')"
BODY="$(call_fn "submit-entry" "$TOKEN" "{
  \"provider_id\": \"${PENDING_PROVIDER}\",
  \"property_type\": \"apartment\",
  \"management_fee_pct\": 8.0,
  \"management_fee_incl_gst\": true,
  \"hidden_items\": [],
  \"quote_transparency_score\": 3
}" | sed -n '2p')"
expect_error_code "$HTTP" "$BODY" "PROVIDER_NOT_APPROVED" "submit-entry pending provider"
echo ""

# ── Test 5: Public view visibility (optional) ─────────────────────────────
echo "── Test 5: v_public_entries shows new entries ──"
sleep 1

if [ -n "${ENTRY_ID_RE:-}" ]; then
  COUNT=$(curl -s "${SUPABASE_URL}/rest/v1/v_public_entries?id=eq.${ENTRY_ID_RE}&select=id" \
    -H "apikey: ${ANON_KEY}" -H "Authorization: Bearer ${TOKEN}" | jq 'length')
  if [ "$COUNT" = "1" ]; then pass "Real estate entry visible in v_public_entries"; else fail "Real estate entry NOT visible (count=${COUNT})"; fi
else
  info "Skipped: no real estate entry_id"
fi

if [ -n "${ENTRY_ID_LEGAL:-}" ]; then
  COUNT=$(curl -s "${SUPABASE_URL}/rest/v1/v_public_entries?id=eq.${ENTRY_ID_LEGAL}&select=id" \
    -H "apikey: ${ANON_KEY}" -H "Authorization: Bearer ${TOKEN}" | jq 'length')
  if [ "$COUNT" = "1" ]; then pass "Legal entry visible in v_public_entries"; else fail "Legal entry NOT visible (count=${COUNT})"; fi
else
  info "Skipped: no legal entry_id"
fi
echo ""

# ── Test 6: Mine mode (RLS) ───────────────────────────────────────────────
echo "── Test 6: fee_entries visible to submitter via RLS ──"
if [ -n "${ENTRY_ID_RE:-}" ]; then
  COUNT=$(curl -s "${SUPABASE_URL}/rest/v1/fee_entries?id=eq.${ENTRY_ID_RE}&select=id" \
    -H "apikey: ${ANON_KEY}" -H "Authorization: Bearer ${TOKEN}" | jq 'length')
  if [ "$COUNT" = "1" ]; then pass "Submitter can see own entry via fee_entries"; else fail "Submitter cannot see own entry (count=${COUNT})"; fi
else
  info "Skipped: no entry_id"
fi
echo ""

# ── Test 7: Validation failure ────────────────────────────────────────────
echo "── Test 7: create-entry-v2 with missing required field ──"
HTTP="$(call_fn "create-entry-v2" "$TOKEN" "{
  \"provider_id\": \"${APPROVED_LEGAL_PROVIDER}\",
  \"industry_key\": \"legal_services\",
  \"fee_breakdown\": { \"gst_included\": true }
}" | sed -n '1p')"
BODY="$(call_fn "create-entry-v2" "$TOKEN" "{
  \"provider_id\": \"${APPROVED_LEGAL_PROVIDER}\",
  \"industry_key\": \"legal_services\",
  \"fee_breakdown\": { \"gst_included\": true }
}" | sed -n '2p')"
expect_error_code "$HTTP" "$BODY" "VALIDATION_FAILED" "create-entry-v2 missing field"
echo ""

echo "=========================================="
echo "Results: ${PASS} passed, ${FAIL} failed"
echo "=========================================="
exit $FAIL