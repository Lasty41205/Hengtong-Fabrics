import { requireSupabaseClient } from "../lib/supabase";

export type LoginAccountOption = {
  id: string;
  displayName: string;
  email: string;
};

type LoginAccountRow = {
  id: string;
  display_name: string | null;
  email: string | null;
};

export async function listActiveLoginAccounts() {
  const client = requireSupabaseClient();
  const { data, error } = await client.rpc("list_active_login_accounts");

  if (error) {
    throw new Error("店员列表读取失败，请确认 SQL 已重新执行。");
  }

  const rows = Array.isArray(data) ? (data as LoginAccountRow[]) : [];

  return rows
    .map((row: LoginAccountRow) => ({
      id: row.id,
      displayName: row.display_name?.trim() || "",
      email: row.email?.trim() || ""
    }))
    .filter((row: LoginAccountOption) => row.id && row.displayName && row.email)
    .sort((left: LoginAccountOption, right: LoginAccountOption) =>
      left.displayName.localeCompare(right.displayName, "zh-Hans-CN", { sensitivity: "base" })
    );
}
