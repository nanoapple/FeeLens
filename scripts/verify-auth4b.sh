#!/usr/bin/env bash
# ==========================================
# scripts/verify-auth4b.sh
#
# Auth-4b 验证脚本
# 前置条件:
#   supabase start
#   supabase db reset
#   npm run dev (端口 3000)
#
# 测试内容:
#   1. Edge Function submit-entry 成功写入（real_estate）
#   2. Edge Function create-entry-v2 成功写入（legal_services）
#   3. provider 不存在 → 错误返回
#   4. provider 未审核 → 错误返回
#   5. 列表页可见（v_public_entries）
#   6. mine 模式可见（fee_entries + RLS）
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

# ── Config ─────────────────────────────────────────────────────────────────

SUPABASE_URL="${SUPABASE_URL:-http://127.0.0.1:54321}"
ANON_KEY=$(supabase status 2>/dev/null | grep -E '(anon|Publishable)' | awk '{print $NF}' || echo "")

if [ -z "$ANON_KEY" ]; then
  echo -e "${RED}ERROR: Cannot get anon key. Is Supabase running?${NC}"
  exit 1
fi

# ── Seed data IDs ──────────────────────────────────────────────────────────

APPROVED_RE_PROVIDER="00000000-0000-0000-0000-000000000101"  # Ray White Sydney CBD (real_estate)
APPROVED_LEGAL_PROVIDER="00000000-0000-0000-0000-000000000201"  # Sydney Conveyancing Group (legal_services)
PENDING_PROVIDER="00000000-0000-0000-0000-000000000901"  # Test Property Management (pending)
FAKE_PROVIDER="00000000-0000-0000-0000-ffffffffffff"  # does not exist

echo "=========================================="
echo "Auth-4b: Submit Flow Verification"
echo "=========================================="
echo ""

# ── Helper: login ──────────────────────────────────────────────────────────

login() {
  local email="$1"
  local password="$2"
  local resp
  resp=$(curl -s "${SUPABASE_URL}/auth/v1/token?grant_type=password" \
    -H "apikey: ${ANON_KEY}" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"${email}\",\"password\":\"${password}\"}")

  echo "$resp" | jq -r '.access_token // empty'
}

# ── Get test user token ───────────────────────────────────────────────────

echo "── Login test@feelens.local ──"
TOKEN=$(login "test@feelens.local" "testpass123")

if [ -z "$TOKEN" ]; then
  echo -e "${RED}FATAL: Cannot login test@feelens.local${NC}"
  exit 1
fi
pass "Login OK"
echo ""

# ── Test 1: Submit real_estate entry (legacy Edge Function) ───────────────

echo "── Test 1: submit-entry (real_estate, approved provider) ──"
RESULT=$(curl -s -w "\n__HTTP_CODE__%{http_code}" "${SUPABASE_URL}/functions/v1/submit-entry" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -H "apikey: ${ANON_KEY}" \
  -d "{
    \"provider_id\": \"${APPROVED_RE_PROVIDER}\",
    \"property_type\": \"apartment\",
    \"management_fee_pct\": 7.5,
    \"management_fee_incl_gst\": true,
    \"hidden_items\": [\"admin_fee\"],
    \"quote_transparency_score\": 4
  }")

HTTP_CODE=$(echo "$RESULT" | grep '__HTTP_CODE__' | sed 's/__HTTP_CODE__//')
BODY=$(echo "$RESULT" | grep -v '__HTTP_CODE__')
info "HTTP ${HTTP_CODE} | raw body: ${BODY:0:300}"

SUCCESS=$(echo "$BODY" | jq -r '.success // .entry_id // empty' 2>/dev/null)
ENTRY_ID_RE=$(echo "$BODY" | jq -r '.entry_id // empty' 2>/dev/null)

if [ -n "$SUCCESS" ] && [ "$SUCCESS" != "false" ]; then
  pass "submit-entry returned success"
  info "entry_id = ${ENTRY_ID_RE:-unknown}"
else
  fail "submit-entry failed: $(echo "$RESULT" | jq -r '.error // "unknown"')"
fi
echo ""

# ── Test 2: Create legal_services entry (v2 Edge Function) ────────────────

echo "── Test 2: create-entry-v2 (legal_services, approved provider) ──"
RESULT=$(curl -s -w "\n__HTTP_CODE__%{http_code}" "${SUPABASE_URL}/functions/v1/create-entry-v2" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -H "apikey: ${ANON_KEY}" \
  -d "{
    \"provider_id\": \"${APPROVED_LEGAL_PROVIDER}\",
    \"industry_key\": \"legal_services\",
    \"service_key\": \"conveyancing\",
    \"fee_breakdown\": {
      \"pricing_model\": \"fixed\",
      \"fixed_fee_amount\": 1500,
      \"gst_included\": true,
      \"total_estimated\": 1650
    },
    \"context\": {
      \"matter_type\": \"conveyancing\",
      \"jurisdiction\": \"NSW\",
      \"property_value\": 850000,
      \"transaction_side\": \"purchase\"
    },
    \"quote_transparency_score\": 4
  }")

HTTP_CODE=$(echo "$RESULT" | grep '__HTTP_CODE__' | sed 's/__HTTP_CODE__//')
BODY=$(echo "$RESULT" | grep -v '__HTTP_CODE__')
info "HTTP ${HTTP_CODE} | raw body: ${BODY:0:300}"

SUCCESS=$(echo "$BODY" | jq -r '.success // .entry_id // empty' 2>/dev/null)
ENTRY_ID_LEGAL=$(echo "$BODY" | jq -r '.entry_id // empty' 2>/dev/null)

if [ -n "$SUCCESS" ] && [ "$SUCCESS" != "false" ]; then
  pass "create-entry-v2 returned success"
  info "entry_id = ${ENTRY_ID_LEGAL:-unknown}"
else
  fail "create-entry-v2 failed: $(echo "$RESULT" | jq -r '.error // "unknown"')"
fi
echo ""

# ── Test 3: Provider not found → error ────────────────────────────────────

echo "── Test 3: create-entry-v2 with fake provider ──"
RESULT=$(curl -s -w "\n__HTTP_CODE__%{http_code}" "${SUPABASE_URL}/functions/v1/create-entry-v2" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -H "apikey: ${ANON_KEY}" \
  -d "{
    \"provider_id\": \"${FAKE_PROVIDER}\",
    \"industry_key\": \"legal_services\",
    \"service_key\": \"conveyancing\",
    \"fee_breakdown\": {
      \"pricing_model\": \"fixed\",
      \"fixed_fee_amount\": 1000,
      \"gst_included\": true
    }
  }")

HTTP_CODE=$(echo "$RESULT" | grep '__HTTP_CODE__' | sed 's/__HTTP_CODE__//')
BODY=$(echo "$RESULT" | grep -v '__HTTP_CODE__')
info "HTTP ${HTTP_CODE} | raw body: ${BODY:0:300}"

ERROR_MSG=$(echo "$BODY" | jq -r '.error // empty' 2>/dev/null)

if echo "$ERROR_MSG" | grep -qi "not found"; then
  pass "Provider not found → error returned"
  info "error = ${ERROR_MSG}"
else
  fail "Expected 'not found' error, got: ${ERROR_MSG:-no error field}"
fi
echo ""

# ── Test 4: Provider not approved → error ─────────────────────────────────

echo "── Test 4: submit-entry with pending provider ──"
RESULT=$(curl -s -w "\n__HTTP_CODE__%{http_code}" "${SUPABASE_URL}/functions/v1/submit-entry" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -H "apikey: ${ANON_KEY}" \
  -d "{
    \"provider_id\": \"${PENDING_PROVIDER}\",
    \"property_type\": \"apartment\",
    \"management_fee_pct\": 8.0,
    \"management_fee_incl_gst\": true,
    \"hidden_items\": [],
    \"quote_transparency_score\": 3
  }")

HTTP_CODE=$(echo "$RESULT" | grep '__HTTP_CODE__' | sed 's/__HTTP_CODE__//')
BODY=$(echo "$RESULT" | grep -v '__HTTP_CODE__')
info "HTTP ${HTTP_CODE} | raw body: ${BODY:0:300}"

ERROR_MSG=$(echo "$BODY" | jq -r '.error // empty' 2>/dev/null)

if echo "$ERROR_MSG" | grep -qi "not.*approved\|pending"; then
  pass "Pending provider → error returned"
  info "error = ${ERROR_MSG}"
else
  fail "Expected 'not approved' error, got: ${ERROR_MSG:-no error field}"
fi
echo ""

# ── Test 5: Public entries visible via view ───────────────────────────────

echo "── Test 5: v_public_entries shows new entries ──"

# Small delay for DB to settle
sleep 1

# Check real_estate entry
if [ -n "$ENTRY_ID_RE" ]; then
  COUNT=$(curl -s "${SUPABASE_URL}/rest/v1/v_public_entries?id=eq.${ENTRY_ID_RE}&select=id" \
    -H "apikey: ${ANON_KEY}" \
    -H "Authorization: Bearer ${TOKEN}" | jq 'length')
  if [ "$COUNT" = "1" ]; then
    pass "Real estate entry visible in v_public_entries"
  else
    fail "Real estate entry NOT visible in v_public_entries (count=${COUNT})"
  fi
else
  info "Skipped: no real estate entry_id"
fi

# Check legal entry
if [ -n "$ENTRY_ID_LEGAL" ]; then
  COUNT=$(curl -s "${SUPABASE_URL}/rest/v1/v_public_entries?id=eq.${ENTRY_ID_LEGAL}&select=id" \
    -H "apikey: ${ANON_KEY}" \
    -H "Authorization: Bearer ${TOKEN}" | jq 'length')
  if [ "$COUNT" = "1" ]; then
    pass "Legal entry visible in v_public_entries"
  else
    fail "Legal entry NOT visible in v_public_entries (count=${COUNT})"
  fi
else
  info "Skipped: no legal entry_id"
fi
echo ""

# ── Test 6: Mine mode (fee_entries + RLS) ─────────────────────────────────

echo "── Test 6: fee_entries visible to submitter via RLS ──"

if [ -n "$ENTRY_ID_RE" ]; then
  COUNT=$(curl -s "${SUPABASE_URL}/rest/v1/fee_entries?id=eq.${ENTRY_ID_RE}&select=id&submitter_user_id=eq.11111111-1111-1111-1111-111111111111" \
    -H "apikey: ${ANON_KEY}" \
    -H "Authorization: Bearer ${TOKEN}" | jq 'length')
  if [ "$COUNT" = "1" ]; then
    pass "Submitter can see own entry via fee_entries"
  else
    fail "Submitter cannot see own entry via fee_entries (count=${COUNT})"
  fi
else
  info "Skipped: no entry_id"
fi
echo ""

# ── Test 7: Validation failure (missing required field) ───────────────────

echo "── Test 7: create-entry-v2 with missing required field ──"
RESULT=$(curl -s -w "\n__HTTP_CODE__%{http_code}" "${SUPABASE_URL}/functions/v1/create-entry-v2" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -H "apikey: ${ANON_KEY}" \
  -d "{
    \"provider_id\": \"${APPROVED_LEGAL_PROVIDER}\",
    \"industry_key\": \"legal_services\",
    \"fee_breakdown\": {
      \"gst_included\": true
    }
  }")

HTTP_CODE=$(echo "$RESULT" | grep '__HTTP_CODE__' | sed 's/__HTTP_CODE__//')
BODY=$(echo "$RESULT" | grep -v '__HTTP_CODE__')
info "HTTP ${HTTP_CODE} | raw body: ${BODY:0:300}"

ERROR_MSG=$(echo "$BODY" | jq -r '.error // empty' 2>/dev/null)
HAS_DETAILS=$(echo "$BODY" | jq 'has("details")' 2>/dev/null)

if echo "$ERROR_MSG" | grep -qi "validation\|required"; then
  pass "Validation error returned for missing pricing_model"
  if [ "$HAS_DETAILS" = "true" ]; then
    pass "Error includes details array (field-level errors)"
  else
    info "No details array (field errors not exposed)"
  fi
else
  fail "Expected validation error, got: ${ERROR_MSG:-no error}"
fi
echo ""

# ── Summary ────────────────────────────────────────────────────────────────

echo "=========================================="
echo "Results: ${PASS} passed, ${FAIL} failed"
echo ""
echo "Browser walkthrough (manual):"
echo "  1. Open http://localhost:3000/submit?provider=${APPROVED_RE_PROVIDER}"
echo "     → If not logged in, should redirect to /login"
echo "     → Login as test@feelens.local / testpass123"
echo "     → Submit → redirect to /entries?mine=true&created=1"
echo "     → Green toast appears → auto-dismisses after 5s"
echo ""
echo "  2. Open http://localhost:3000/entries/new?industry=legal_services&provider=${APPROVED_LEGAL_PROVIDER}"
echo "     → Fill form → Submit → same redirect + toast"
echo ""
echo "  3. Open http://localhost:3000/submit?provider=${PENDING_PROVIDER}"
echo "     → Should show amber 'Provider pending verification' message"
echo ""
echo "  4. Open http://localhost:3000/entries?mine=true"
echo "     → Should show your submitted entries with status badges"
echo "=========================================="

exit $FAIL
