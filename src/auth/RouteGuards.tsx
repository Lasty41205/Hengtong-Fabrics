import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";

function AuthLoadingState({ message }: { message: string }) {
  return (
    <main className="page-shell page-shell--auth">
      <div className="page phone-frame">
        <section className="empty-card auth-card">
          <h2>{message}</h2>
          <p>请稍等，系统正在确认登录状态。</p>
        </section>
      </div>
    </main>
  );
}

export function ProtectedRoute() {
  const location = useLocation();
  const { loading, session, profile, isConfigured, authMessage } = useAuth();

  if (loading) {
    return <AuthLoadingState message="正在加载账号信息" />;
  }

  if (!isConfigured) {
    return (
      <main className="page-shell page-shell--auth">
        <div className="page phone-frame">
          <section className="empty-card auth-card">
            <h2>Supabase 未配置</h2>
            <p>请先配置 `VITE_SUPABASE_URL` 和 `VITE_SUPABASE_PUBLISHABLE_KEY`，再重新启动项目。</p>
          </section>
        </div>
      </main>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (!profile?.isActive) {
    return (
      <main className="page-shell page-shell--auth">
        <div className="page phone-frame">
          <section className="empty-card auth-card">
            <h2>账号不可用</h2>
            <p>{authMessage || "该账号未启用，请联系管理员。"}</p>
          </section>
        </div>
      </main>
    );
  }

  return <Outlet />;
}

export function PublicOnlyRoute() {
  const { loading, session, profile } = useAuth();

  if (loading) {
    return <AuthLoadingState message="正在准备登录页" />;
  }

  if (session && profile?.isActive) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
