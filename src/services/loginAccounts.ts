export type LoginAccountOption = {
  id: string;
  displayName: string;
};

type LoginAccountResponse = {
  accounts?: Array<{
    id: string;
    displayName: string;
  }>;
  error?: string;
};

export async function listActiveLoginAccounts() {
  const response = await fetch("/api/login-accounts", {
    method: "GET",
    headers: {
      Accept: "application/json"
    }
  });

  const payload = (await response.json().catch(() => ({}))) as LoginAccountResponse;

  if (!response.ok) {
    throw new Error(payload.error || "店员列表读取失败，请稍后再试。");
  }

  const accounts = Array.isArray(payload.accounts) ? payload.accounts : [];

  return accounts
    .map((row) => ({
      id: row.id?.trim() || "",
      displayName: row.displayName?.trim() || ""
    }))
    .filter((row) => row.id && row.displayName)
    .sort((left, right) => left.displayName.localeCompare(right.displayName, "zh-Hans-CN", { sensitivity: "base" }));
}
