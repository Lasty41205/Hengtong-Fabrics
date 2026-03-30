import {
  Session,
  User,
  AuthChangeEvent,
  type AuthError
} from "@supabase/supabase-js";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";
import { isSupabaseConfigured, requireSupabaseClient } from "../lib/supabase";
import { AppProfile, UserRole } from "../types";

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  profile: AppProfile | null;
  loading: boolean;
  authMessage: string;
  isConfigured: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

type ProfileRow = {
  id: string;
  email: string | null;
  display_name: string | null;
  role: UserRole;
  is_active: boolean;
  created_at: string;
};

function mapProfile(row: ProfileRow): AppProfile {
  return {
    id: row.id,
    email: row.email ?? "",
    displayName: row.display_name?.trim() || row.email?.trim() || "未命名账号",
    role: row.role,
    isActive: row.is_active,
    createdAt: row.created_at
  };
}

function normalizeAuthError(error: AuthError | Error | null) {
  if (!error) return "";
  const message = error.message || "";

  if (message.includes("Invalid login credentials")) {
    return "邮箱或密码不正确。";
  }

  if (message.includes("Email not confirmed")) {
    return "该账号还没有启用，请联系管理员确认。";
  }

  return message || "登录失败，请稍后再试。";
}

async function fetchProfile(userId: string) {
  const client = requireSupabaseClient();
  const { data, error } = await client
    .from("profiles")
    .select("id, email, display_name, role, is_active, created_at")
    .eq("id", userId)
    .maybeSingle<ProfileRow>();

  if (error) {
    throw error;
  }

  return data ? mapProfile(data) : null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<AppProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [authMessage, setAuthMessage] = useState("");

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      setAuthMessage("Supabase 环境变量还没配置，当前不能启用登录。");
      return;
    }

    const client = requireSupabaseClient();
    let active = true;

    const syncFromSession = async (nextSession: Session | null, event?: AuthChangeEvent) => {
      if (!active) return;

      setSession(nextSession);

      if (!nextSession?.user) {
        setProfile(null);
        if (event !== "SIGNED_OUT") {
          setAuthMessage("");
        }
        setLoading(false);
        return;
      }

      try {
        const nextProfile = await fetchProfile(nextSession.user.id);
        if (!active) return;

        if (!nextProfile) {
          setProfile(null);
          setAuthMessage("账号资料不存在，请让管理员重新创建账号。");
          await client.auth.signOut();
          setSession(null);
          setLoading(false);
          return;
        }

        if (!nextProfile.isActive) {
          setProfile(nextProfile);
          setAuthMessage("该账号已被停用，请联系管理员。");
          await client.auth.signOut();
          setSession(null);
          setLoading(false);
          return;
        }

        setProfile(nextProfile);
        setAuthMessage("");
      } catch (error) {
        if (!active) return;
        setProfile(null);
        setAuthMessage(normalizeAuthError(error as Error));
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    client.auth
      .getSession()
      .then(({ data }) => syncFromSession(data.session))
      .catch((error) => {
        if (!active) return;
        setAuthMessage(normalizeAuthError(error));
        setLoading(false);
      });

    const {
      data: { subscription }
    } = client.auth.onAuthStateChange((event, nextSession) => {
      void syncFromSession(nextSession, event);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      loading,
      authMessage,
      isConfigured: isSupabaseConfigured,
      signIn: async (email: string, password: string) => {
        const client = requireSupabaseClient();
        setAuthMessage("");

        const { data, error } = await client.auth.signInWithPassword({
          email: email.trim(),
          password
        });

        if (error) {
          throw new Error(normalizeAuthError(error));
        }

        const nextProfile = data.user ? await fetchProfile(data.user.id) : null;

        if (!nextProfile) {
          await client.auth.signOut();
          throw new Error("账号资料不存在，请联系管理员。");
        }

        if (!nextProfile.isActive) {
          await client.auth.signOut();
          throw new Error("该账号已被停用，请联系管理员。");
        }

        setSession(data.session);
        setProfile(nextProfile);
      },
      signOut: async () => {
        if (!isSupabaseConfigured) return;
        const client = requireSupabaseClient();
        await client.auth.signOut();
        setSession(null);
        setProfile(null);
        setAuthMessage("");
      },
      refreshProfile: async () => {
        if (!session?.user) return;
        const nextProfile = await fetchProfile(session.user.id);
        setProfile(nextProfile);
      }
    }),
    [authMessage, loading, profile, session]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth 必须在 AuthProvider 内使用。");
  }

  return context;
}
