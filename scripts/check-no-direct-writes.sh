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
matches=$(grep -rnE '\.(insert|update|delete|upsert)\s*\(' "$SCAN_DIR" \
  --include='*.ts' \
  --include='*.tsx' \
  --include='*.js' \
  --include='*.jsx' \
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
  exit 0
fi
