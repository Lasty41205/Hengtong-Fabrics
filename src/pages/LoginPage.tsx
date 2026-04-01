import { FormEvent, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { listActiveLoginAccounts, type LoginAccountOption } from "../services/loginAccounts";

type LoginRouteState = {
  from?: {
    pathname?: string;
  };
  forceEditorRedirect?: boolean;
};

const LAST_LOGIN_ACCOUNT_KEY = "last-login-account-id";

function loadLastLoginAccountId() {
  try {
    return localStorage.getItem(LAST_LOGIN_ACCOUNT_KEY)?.trim() || "";
  } catch {
    return "";
  }
}

function saveLastLoginAccountId(accountId: string) {
  try {
    localStorage.setItem(LAST_LOGIN_ACCOUNT_KEY, accountId.trim());
  } catch {
    // 忽略本地缓存失败，不影响登录主流程
  }
}

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signInWithAccountId, authMessage, isConfigured } = useAuth();
  const [accounts, setAccounts] = useState<LoginAccountOption[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [password, setPassword] = useState("");
  const [errorText, setErrorText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loadingAccounts, setLoadingAccounts] = useState(false);

  const routeState = location.state as LoginRouteState | null;
  const redirectTo = useMemo(
    () => (routeState?.forceEditorRedirect ? "/" : routeState?.from?.pathname || "/"),
    [routeState?.forceEditorRedirect, routeState?.from?.pathname]
  );
  const selectedAccount = useMemo(
    () => accounts.find((item) => item.id === selectedAccountId),
    [accounts, selectedAccountId]
  );

  useEffect(() => {
    if (!isConfigured) return;

    let active = true;

    const loadAccounts = async () => {
      try {
        setLoadingAccounts(true);
        const nextAccounts = await listActiveLoginAccounts();
        if (!active) return;
        const lastAccountId = loadLastLoginAccountId();
        const matchedLastAccount = nextAccounts.find((item) => item.id === lastAccountId);
        setAccounts(nextAccounts);
        setSelectedAccountId((current) => current || matchedLastAccount?.id || nextAccounts[0]?.id || "");
      } catch (error) {
        if (!active) return;
        setErrorText(error instanceof Error ? error.message : "店员列表读取失败，请稍后再试。");
      } finally {
        if (active) {
          setLoadingAccounts(false);
        }
      }
    };

    void loadAccounts();

    return () => {
      active = false;
    };
  }, [isConfigured]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!selectedAccount) {
      setErrorText("请先选择店员。");
      return;
    }

    if (!password.trim()) {
      setErrorText("请输入密码。");
      return;
    }

    try {
      setSubmitting(true);
      setErrorText("");
      await signInWithAccountId(selectedAccount.id, password);
      saveLastLoginAccountId(selectedAccount.id);
      navigate(redirectTo, { replace: true });
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : "登录失败，请稍后再试。");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="page-shell page-shell--auth">
      <div className="page phone-frame">
        <section className="hero-card auth-card auth-card--login">
          <div className="hero-card__heading hero-card__heading--stack">
            <div>
              <p className="topbar__brand">AI销货单助手</p>
              <h2>店员登录</h2>
              <p>店员只需要选择自己的姓名，再输入密码即可登录。</p>
            </div>
            <span className={isConfigured ? "success-chip" : "danger-chip"}>
              {isConfigured ? "Supabase 已连接" : "缺少 Supabase 配置"}
            </span>
          </div>

          {!isConfigured ? (
            <div className="auth-tip-card">
              <strong>先配置环境变量</strong>
              <p>
                在项目根目录创建 `.env.local`，填入 `VITE_SUPABASE_URL`、`VITE_SUPABASE_PUBLISHABLE_KEY` 和
                `SUPABASE_SERVICE_ROLE_KEY`，然后重新运行 `npm run dev`。
              </p>
            </div>
          ) : null}

          {isConfigured && loadingAccounts ? <div className="auth-tip-card"><p>正在读取可登录店员列表...</p></div> : null}

          {isConfigured && !loadingAccounts && accounts.length === 0 ? (
            <div className="auth-tip-card">
              <strong>还没有可登录店员</strong>
              <p>请先确认 `profiles.display_name` 已填写，并且已配置服务端登录接口环境变量。</p>
            </div>
          ) : null}

          <form className="auth-form" onSubmit={handleSubmit}>
            <label className="field-block">
              <span className="field-label">店员</span>
              <select
                className="field-input field-select"
                value={selectedAccountId}
                onChange={(event) => setSelectedAccountId(event.target.value)}
                disabled={!isConfigured || loadingAccounts || accounts.length === 0}
              >
                <option value="">请选择店员</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.displayName}
                  </option>
                ))}
              </select>
            </label>

            <label className="field-block">
              <span className="field-label">密码</span>
              <input
                className="field-input"
                type="password"
                autoComplete="current-password"
                placeholder="请输入密码"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>

            {errorText || authMessage ? <div className="auth-error">{errorText || authMessage}</div> : null}

            <button
              className="primary-button btn-action-primary auth-submit"
              type="submit"
              disabled={submitting || !isConfigured || loadingAccounts || !selectedAccount}
            >
              {submitting ? "登录中..." : "登录进入系统"}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
