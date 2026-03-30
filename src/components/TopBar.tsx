import { useState } from "react";
import { useAuth } from "../auth/AuthContext";

type TopBarProps = {
  title: string;
  rightText?: string;
};

export function TopBar({ title, rightText }: TopBarProps) {
  const { profile, signOut } = useAuth();
  const [submitting, setSubmitting] = useState(false);

  const handleSignOut = async () => {
    try {
      setSubmitting(true);
      await signOut();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <header className="topbar">
      <div>
        <p className="topbar__brand">AI销货单助手</p>
        <h1>{title}</h1>
      </div>

      <div className="topbar__aside">
        {rightText ? <span className="topbar__meta">{rightText}</span> : null}
        {profile ? (
          <div className="topbar__user">
            <span>
              {profile.displayName} · {profile.role === "admin" ? "管理员" : "店员"}
            </span>
            <button className="ghost-button topbar__logout" type="button" onClick={handleSignOut} disabled={submitting}>
              {submitting ? "退出中..." : "退出登录"}
            </button>
          </div>
        ) : null}
      </div>
    </header>
  );
}
