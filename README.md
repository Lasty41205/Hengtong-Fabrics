# AI销货单助手

## 结论
当前 Phase 3 已按“最小增量改造”接入登录和 Supabase 基础层：
- 前端继续是 Vite + React
- 登录使用 Supabase Auth
- customers 先迁到 Supabase 共享库
- 其他模块暂时保留原有 localStorage / 本地数据库逻辑
- 可直接部署到 Vercel

## 本地运行
1. 安装依赖
```bash
npm install
```

2. 配置环境变量
把 `.env.example` 复制为 `.env.local`，填入：
```bash
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-supabase-anon-key
```

3. 启动开发环境
```bash
npm run dev
```

## Supabase 初始化
1. 在 Supabase 项目里打开 SQL Editor
2. 执行 [supabase/phase3_shared_schema.sql](/E:/⭐求职上岸/HTBY_project/supabase/phase3_shared_schema.sql)
3. 去 Authentication 里由管理员预先创建账号
4. 首个管理员账号创建后，到 `public.profiles` 把对应用户的 `role` 改成 `admin`
5. 其他店员默认可保持 `staff`

## 当前数据策略
- `profiles`、登录、角色、RLS：已接好
- `customers`：已切 Supabase 云端共享
- `customer_prices`、`default_prices`：本轮仍保留本地
- `invoices`、`invoice_items`、`billing_entries`：本轮只先建表和权限，前端下一轮再接

## Vercel 部署
1. 把项目推到 Git 仓库
2. 在 Vercel 导入该仓库
3. Framework Preset 选择 `Vite`
4. 在 Vercel 环境变量里配置：
```bash
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
```
5. 点击 Deploy

项目根目录已增加 `vercel.json`，用于把前端路由统一回退到 `index.html`，避免刷新 `/login`、`/history` 这类页面时报 404。

## 本轮关键文件
- [src/lib/supabase.ts](/E:/⭐求职上岸/HTBY_project/src/lib/supabase.ts)
- [src/auth/AuthContext.tsx](/E:/⭐求职上岸/HTBY_project/src/auth/AuthContext.tsx)
- [src/auth/RouteGuards.tsx](/E:/⭐求职上岸/HTBY_project/src/auth/RouteGuards.tsx)
- [src/pages/LoginPage.tsx](/E:/⭐求职上岸/HTBY_project/src/pages/LoginPage.tsx)
- [src/services/customers.ts](/E:/⭐求职上岸/HTBY_project/src/services/customers.ts)
- [src/services/businessDatabase.ts](/E:/⭐求职上岸/HTBY_project/src/services/businessDatabase.ts)
- [src/pages/DatabaseManagerPage.tsx](/E:/⭐求职上岸/HTBY_project/src/pages/DatabaseManagerPage.tsx)
- [src/pages/OrderEditorPage.tsx](/E:/⭐求职上岸/HTBY_project/src/pages/OrderEditorPage.tsx)
