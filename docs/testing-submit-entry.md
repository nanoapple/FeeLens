# submit-entry E2E 测试手册

## 前置条件

1. Supabase 本地环境已启动：`supabase start`
2. 迁移已应用：`supabase db reset`
3. 前端开发服务器运行：`npm run dev`

## 测试步骤

### 1. 创建测试用户

访问 http://localhost:54323
- 进入 Authentication > Users
- 点击 "Add user"
- Email: test@feelens.local
- Password: testpass123
- 点击 "Create user"
- 复制用户 UUID

### 2. 登录前端

访问 http://localhost:3000/login
- 使用上面创建的账号登录

### 3. 提交费用条目

访问 http://localhost:3000/submit?provider=<PROVIDER_ID>
- 从 seed 数据获取 provider ID：
  ```sql
  SELECT id, name FROM providers WHERE status='approved' LIMIT 1;
