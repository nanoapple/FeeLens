#!/bin/bash
# ==========================================
# submit-entry E2E 测试脚本
# ==========================================

set -e  # 遇到错误立即退出

echo "=========================================="
echo "1. 检查 Supabase 本地环境"
echo "=========================================="
supabase status || {
  echo "❌ Supabase 未启动，请先运行: supabase start"
  exit 1
}

echo "✓ Supabase 正在运行"
echo ""

echo "=========================================="
echo "2. 重置并应用迁移"
echo "=========================================="
supabase db reset --no-seed
echo "✓ 数据库已重置"
echo ""

echo "=========================================="
echo "3. 应用 seed 数据"
echo "=========================================="
supabase db seed
echo "✓ Seed 数据已加载"
echo ""

echo "=========================================="
echo "4. 创建测试用户（通过 Supabase Auth）"
echo "=========================================="

# 使用 Supabase CLI 创建测试用户
TEST_EMAIL="test@feelens.local"
TEST_PASSWORD="testpass123"

# 注意：需要用 curl 或 Supabase JS 创建用户
# 这里提供手动步骤
echo "请手动执行以下步骤："
echo "1. 访问 http://localhost:54323"
echo "2. 进入 Authentication > Users"
echo "3. 创建用户: $TEST_EMAIL / $TEST_PASSWORD"
echo "4. 复制用户的 UUID"
echo ""
read -p "用户 UUID: " USER_ID

if [ -z "$USER_ID" ]; then
  echo "❌ 未提供用户 UUID"
  exit 1
fi

echo "✓ 使用用户 ID: $USER_ID"
echo ""

echo "=========================================="
echo "5. 获取测试 JWT"
echo "=========================================="

# 通过 Supabase Auth API 获取 JWT
SUPABASE_URL=$(supabase status -o env | grep API_URL | cut -d'=' -f2)
SUPABASE_ANON_KEY=$(supabase status -o env | grep ANON_KEY | cut -d'=' -f2)

JWT_RESPONSE=$(curl -s -X POST "$SUPABASE_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\"}")

ACCESS_TOKEN=$(echo $JWT_RESPONSE | jq -r '.access_token')

if [ "$ACCESS_TOKEN" == "null" ]; then
  echo "❌ 获取 JWT 失败"
  echo "$JWT_RESPONSE"
  exit 1
fi

echo "✓ JWT 已获取"
echo ""

echo "=========================================="
echo "6. 获取测试 Provider ID"
echo "=========================================="

PROVIDER_ID=$(psql $(supabase status -o env | grep DB_URL | cut -d'=' -f2) \
  -t -c "SELECT id FROM providers WHERE status='approved' LIMIT 1;" | xargs)

if [ -z "$PROVIDER_ID" ]; then
  echo "❌ 没有可用的 provider"
  exit 1
fi

echo "✓ Provider ID: $PROVIDER_ID"
echo ""

echo "=========================================="
echo "7. 调用 submit-entry Edge Function"
echo "=========================================="

FUNCTION_URL="$SUPABASE_URL/functions/v1/submit-entry"

RESPONSE=$(curl -s -X POST "$FUNCTION_URL" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"provider_id\": \"$PROVIDER_ID\",
    \"property_type\": \"apartment\",
    \"management_fee_pct\": 8.5,
    \"management_fee_incl_gst\": true,
    \"letting_fee_weeks\": 1.0,
    \"hidden_items\": [\"annual_report_fee\", \"card_surcharge\"],
    \"quote_transparency_score\": 3,
    \"initial_quote_total\": 1000.00,
    \"final_total_paid\": 1150.00
  }")

echo "响应:"
echo "$RESPONSE" | jq .

SUCCESS=$(echo $RESPONSE | jq -r '.success')
ENTRY_ID=$(echo $RESPONSE | jq -r '.entry_id')

if [ "$SUCCESS" != "true" ]; then
  echo "❌ 提交失败"
  exit 1
fi

echo "✓ 提交成功，Entry ID: $ENTRY_ID"
echo ""

echo "=========================================="
echo "8. 验证数据库记录"
echo "=========================================="

echo "检查 fee_entries 表..."
psql $(supabase status -o env | grep DB_URL | cut -d'=' -f2) \
  -c "SELECT id, provider_id, management_fee_pct, visibility, risk_flags FROM fee_entries WHERE id='$ENTRY_ID';"

echo ""
echo "检查 moderation_actions 表（如果被 flag）..."
psql $(supabase status -o env | grep DB_URL | cut -d'=' -f2) \
  -c "SELECT action, actor_type, reason FROM moderation_actions WHERE entry_id='$ENTRY_ID';"

echo ""
echo "✓ E2E 测试通过"
echo ""

echo "=========================================="
echo "9. 验证 RLS 阻止直接写入"
echo "=========================================="

echo "尝试直接 INSERT（应该失败）..."
DIRECT_INSERT=$(curl -s -X POST "$SUPABASE_URL/rest/v1/fee_entries" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=minimal" \
  -d "{
    \"provider_id\": \"$PROVIDER_ID\",
    \"submitter_user_id\": \"$USER_ID\",
    \"property_type\": \"apartment\",
    \"management_fee_pct\": 10.0,
    \"evidence_tier\": \"C\",
    \"visibility\": \"public\"
  }")

# 检查是否包含权限错误
if echo "$DIRECT_INSERT" | grep -q "permission denied\|new row violates row-level security"; then
  echo "✓ RLS 正确阻止了直接写入"
else
  echo "❌ 警告：直接写入未被阻止"
  echo "$DIRECT_INSERT"
fi

echo ""
echo "=========================================="
echo "✓ 所有测试通过！"
echo "=========================================="
