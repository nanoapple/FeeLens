 ## Getting Started (Local)

### 1) Start Supabase locally
```bash
supabase start

supabase db reset
# or, if you prefer pushing migrations without full reset:
# supabase db push

npm run dev


> 如果你们团队统一用 `db reset`（推荐），所有人本地环境会更一致。

---

## 3) 推送到 GitHub（GitHub 目前还没有该 repo）
你有两种方式：**网页创建 repo**（最稳）或 **GitHub CLI**。我给你网页方式（不依赖额外工具）。

### A. 在 GitHub 网页创建仓库
1. 登录 GitHub
2. 右上角 `+` → **New repository**
3. 填：
   - Repository name：例如 `feelens`
   - Visibility：Private（MVP 建议先 Private）
4. **不要勾选** “Add a README / .gitignore / License”（因为你本地已有）
5. Create repository

创建后 GitHub 会给你一个 repo 地址，形如：
- `https://github.com/<your-username>/feelens.git`

---

### B. 在本地项目目录执行推送命令
在 TRAE 里打开终端，确保当前目录是项目根目录（有 package.json 那层）。

```bash
# 1) 初始化 git（如果还没初始化）
git init

# 2) 添加文件
git add .

# 3) 提交
git commit -m "Initial commit"

# 4) 设置主分支名（推荐 main）
git branch -M main

# 5) 添加远程仓库（把 URL 换成你自己的）
git remote add origin https://github.com/<your-username>/feelens.git

# 6) 推送
git push -u origin main
