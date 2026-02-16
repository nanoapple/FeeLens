-- 1. 检查 providers
SELECT id, name, status FROM providers WHERE status = 'approved' LIMIT 5;

-- 2. 检查 fee_entries
SELECT 
  id, 
  provider_id, 
  management_fee_pct, 
  visibility, 
  created_at
FROM fee_entries 
ORDER BY created_at DESC 
LIMIT 5;

-- 3. 检查用户
SELECT id, email FROM auth.users;

-- 4. 检查用户角色
SELECT u.email, ur.role 
FROM user_roles ur 
JOIN auth.users u ON u.id = ur.user_id;
