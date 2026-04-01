import { Buffer } from "node:buffer";
import { createClient } from "@supabase/supabase-js";

function sendJson(response, statusCode, payload) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(payload));
}

function createClients() {
  const supabaseUrl = process.env.VITE_SUPABASE_URL?.trim();
  const publishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!supabaseUrl || !publishableKey || !serviceRoleKey) {
    throw new Error("登录服务未配置：缺少 Supabase 环境变量。请补充 SUPABASE_SERVICE_ROLE_KEY。");
  }

  return {
    adminClient: createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    }),
    authClient: createClient(supabaseUrl, publishableKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    })
  };
}

async function readJsonBody(request) {
  if (typeof request.body === "string") {
    return request.body ? JSON.parse(request.body) : {};
  }

  if (request.body && typeof request.body === "object") {
    return request.body;
  }

  const chunks = [];
  for await (const chunk of request) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }

  const rawText = Buffer.concat(chunks).toString("utf8").trim();
  return rawText ? JSON.parse(rawText) : {};
}

export async function handleLoginAccountsRequest(request, response) {
  if (request.method !== "GET") {
    sendJson(response, 405, { error: "只支持 GET 请求。" });
    return;
  }

  try {
    const { adminClient } = createClients();
    const { data, error } = await adminClient
      .from("profiles")
      .select("id, display_name")
      .eq("is_active", true)
      .order("display_name", { ascending: true });

    if (error) {
      throw error;
    }

    const accounts = Array.isArray(data)
      ? data
          .map((row) => ({
            id: row.id,
            displayName: row.display_name?.trim() || ""
          }))
          .filter((row) => row.id && row.displayName)
      : [];

    sendJson(response, 200, { accounts });
  } catch (error) {
    sendJson(response, 500, {
      error: error instanceof Error ? error.message : "店员列表读取失败，请稍后再试。"
    });
  }
}

export async function handleStaffLoginRequest(request, response) {
  if (request.method !== "POST") {
    sendJson(response, 405, { error: "只支持 POST 请求。" });
    return;
  }

  try {
    const { adminClient, authClient } = createClients();
    const body = await readJsonBody(request);
    const accountId = typeof body.accountId === "string" ? body.accountId.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";

    if (!accountId || !password.trim()) {
      sendJson(response, 400, { error: "请先选择店员并输入密码。" });
      return;
    }

    const { data: profile, error: profileError } = await adminClient
      .from("profiles")
      .select("id, email, is_active")
      .eq("id", accountId)
      .eq("is_active", true)
      .maybeSingle();

    if (profileError) {
      throw profileError;
    }

    if (!profile?.email?.trim()) {
      sendJson(response, 401, { error: "账号或密码不正确。" });
      return;
    }

    const { data, error } = await authClient.auth.signInWithPassword({
      email: profile.email.trim(),
      password
    });

    if (error || !data.session) {
      sendJson(response, 401, { error: "账号或密码不正确。" });
      return;
    }

    sendJson(response, 200, {
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token
      }
    });
  } catch (error) {
    sendJson(response, 500, {
      error: error instanceof Error ? error.message : "登录失败，请稍后再试。"
    });
  }
}
