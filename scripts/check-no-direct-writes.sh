#!/usr/bin/env bash
# ==========================================
# check-no-direct-writes.sh
# 
# 扫描 src/ 目录，禁止出现直接写库操作：
#   .insert(   .update(   .delete(   .upsert(
#
# 如果某行确实需要豁免（极罕见），在该行末尾加注释：
#   // @allow-direct-write
#
# 用法：
#   bash scripts/check-no-direct-writes.sh
#
# 退出码：
#   0 = 无违规
#   1 = 发现违规
# ==========================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

SCAN_DIR="src"
VIOLATIONS=0
VIOLATION_LOG=""

# 豁免标记
ALLOW_MARKER='@allow-direct-write'

echo ""
echo "=========================================="
echo "  FeeLens: Direct DB Write Scanner"
echo "  Scanning: ${SCAN_DIR}/"
echo "=========================================="
echo ""

if [ ! -d "$SCAN_DIR" ]; then
  echo -e "${YELLOW}Warning: ${SCAN_DIR}/ not found, skipping scan${NC}"
  exit 0
fi

# 合并成一个 grep 调用：匹配 .insert( / .update( / .delete( / .upsert(
# 使用 -E (ERE) 避免复杂转义问题
raw_matches=$(grep -rnE '\.(insert|update|delete|upsert)\s*\(' "$SCAN_DIR" \
  --include='*.ts' \
  --include='*.tsx' \
  --include='*.js' \
  --include='*.jsx' \
  2>/dev/null || true)

# Filter out known false positives: standard JS API .delete() on
# URLSearchParams, Map, Set, Headers, FormData, etc.
# These are NOT Supabase database writes.
matches=$(echo "$raw_matches" | grep -vE \
  '(params|searchParams|headers|formData|cache|Cache|Map|Set|WeakMap|WeakSet|URLSearchParams)\.(delete|update)\s*\(' \
  2>/dev/null || true)

if [ -n "$matches" ]; then
  while IFS= read -r line; do
    if echo "$line" | grep -q "$ALLOW_MARKER"; then
      echo -e "${YELLOW}[SKIPPED]${NC} $line  (has @allow-direct-write)"
    else
      VIOLATIONS=$((VIOLATIONS + 1))
      VIOLATION_LOG="${VIOLATION_LOG}\n  ${line}"
    fi
  done <<< "$matches"
fi

echo ""

if [ "$VIOLATIONS" -gt 0 ]; then
  echo -e "${RED}✗ Found ${VIOLATIONS} forbidden direct DB write(s) in ${SCAN_DIR}/:${NC}"
  echo -e "${RED}${VIOLATION_LOG}${NC}"
  echo ""
  echo "=========================================="
  echo "  All writes must go through Edge Functions."
  echo "  Use src/lib/supabase/functions.ts instead."
  echo ""
  echo "  If this is a legitimate exception, add:"
  echo "    // @allow-direct-write"
  echo "  to the end of that line."
  echo "=========================================="
  exit 1
else
  echo -e "${GREEN}✓ No direct DB writes found in ${SCAN_DIR}/${NC}"
  echo "  All writes properly routed through Edge Functions."
fi

# ==========================================
# PART 2: service_role key leak detection
#
# service_role / SERVICE_ROLE_KEY may ONLY appear in:
#   - src/app/api/**          (server-side route handlers)
#   - src/lib/supabase/client.service.ts  (the definition itself)
#
# Anywhere else in src/ = security violation.
# ==========================================

echo ""
echo "=========================================="
echo "  FeeLens: Service Role Key Leak Scanner"
echo "=========================================="
echo ""

SR_VIOLATIONS=0
SR_LOG=""

# Allowlist: paths where service_role references are permitted
ALLOW_SERVICE_ROLE='@allow-service-role'

sr_matches=$(grep -rnE '(service_role|SERVICE_ROLE_KEY|createServiceRoleClient)' "$SCAN_DIR" \
  --include='*.ts' \
  --include='*.tsx' \
  --include='*.js' \
  --include='*.jsx' \
  2>/dev/null \
  | grep -vE '^\s*(//|/?\*|\*)' \
  | grep -vE ':\s*(//|/?\*|\*)' \
  || true)

if [ -n "$sr_matches" ]; then
  while IFS= read -r line; do
    filepath=$(echo "$line" | cut -d: -f1)

    # Allowed paths (exact match or prefix)
    if echo "$filepath" | grep -qE '^src/app/api/'; then
      echo -e "${GREEN}[OK]${NC} $filepath (server API route — allowed)"
      continue
    fi
    if echo "$filepath" | grep -qE '^src/lib/supabase/client\.service\.ts$'; then
      echo -e "${GREEN}[OK]${NC} $filepath (service client definition — allowed)"
      continue
    fi

    # Check for explicit allowance
    if echo "$line" | grep -q "$ALLOW_SERVICE_ROLE"; then
      echo -e "${YELLOW}[SKIPPED]${NC} $line  (has @allow-service-role)"
      continue
    fi

    SR_VIOLATIONS=$((SR_VIOLATIONS + 1))
    SR_LOG="${SR_LOG}\n  ${line}"
  done <<< "$sr_matches"
fi

echo ""

if [ "$SR_VIOLATIONS" -gt 0 ]; then
  echo -e "${RED}✗ Found ${SR_VIOLATIONS} service_role key reference(s) in forbidden locations:${NC}"
  echo -e "${RED}${SR_LOG}${NC}"
  echo ""
  echo "=========================================="
  echo "  service_role key may ONLY be used in:"
  echo "    - src/app/api/**  (server-side route handlers)"
  echo "    - src/lib/supabase/client.service.ts"
  echo ""
  echo "  NEVER in components, pages, or client code."
  echo "  If this is a legitimate exception, add:"
  echo "    // @allow-service-role"
  echo "=========================================="
  exit 1
else
  echo -e "${GREEN}✓ No service_role key leaks found${NC}"
  echo "  Service role usage confined to server-side API routes."
  exit 0
fi
