# AI销货单助手

## 结论
当前 Phase 3 已完成主要共享化改造：
- 前端继续是 Vite + React
- 登录使用 Supabase Auth，支持中文店员姓名选择登录，且不再向匿名前端暴露邮箱映射
- `customers`、`customer_prices`、`default_prices`、`invoices`、`invoice_items`、`billing_entries` 已接入 Supabase 共享库
- 历史记录、账单、价格表都已改为多店员共享使用
- 销货单图片只在前端临时生成，不再长期存进数据库
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
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
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
6. 如果你之前已经执行过旧版 SQL，请再执行一次最新 SQL，把登录账号函数的匿名邮箱暴露收回去

## 当前数据策略
- `profiles`、登录、角色、RLS：已接好
- `customers`：Supabase 云端共享，支持审计字段
- `customer_prices`：Supabase 云端共享；数据库页改为先搜索客户，再编辑该客户全部专属价格
- `default_prices`：Supabase 云端共享；数据库页按最近更新时间排序，并支持分页
- `invoices`、`invoice_items`：生成销货单时写入云端，历史记录页从云端读取
- `billing_entries`：账单页和订单自动累计都已接入 Supabase
- `generated_image_url`：保留字段，但当前不长期保存 base64 图片内容

## 当前已知限制
- 目前系统仍按“客户名”识别客户，因此还不支持“同名不同客户”的安全区分
- 数据库管理页里的“导出兼容快照”导出的是本地兼容快照，不是整套云端数据库全量导出
- 数据库管理页里的“恢复当前草稿”只作用于当前标签页草稿，不会直接重置整套云端数据

## Vercel 部署
1. 把项目推到 Git 仓库
2. 在 Vercel 导入该仓库
3. Framework Preset 选择 `Vite`
4. 在 Vercel 环境变量里配置：
```bash
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY
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
- [src/services/priceTables.ts](/E:/⭐求职上岸/HTBY_project/src/services/priceTables.ts)
- [src/services/invoices.ts](/E:/⭐求职上岸/HTBY_project/src/services/invoices.ts)
- [src/services/billingEntries.ts](/E:/⭐求职上岸/HTBY_project/src/services/billingEntries.ts)
- [src/pages/DatabaseManagerPage.tsx](/E:/⭐求职上岸/HTBY_project/src/pages/DatabaseManagerPage.tsx)
- [src/pages/OrderEditorPage.tsx](/E:/⭐求职上岸/HTBY_project/src/pages/OrderEditorPage.tsx)
- [src/pages/HistoryPage.tsx](/E:/⭐求职上岸/HTBY_project/src/pages/HistoryPage.tsx)
- [src/pages/BillingPage.tsx](/E:/⭐求职上岸/HTBY_project/src/pages/BillingPage.tsx)
