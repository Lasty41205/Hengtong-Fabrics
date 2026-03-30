import { listCustomers } from "./customers";
import { requireSupabaseClient } from "../lib/supabase";
import { CustomerPriceGroup, DefaultPriceRecord } from "../types";

type CustomerLookupRow = {
  id: string;
  name: string | null;
  updated_at: string;
};

type CustomerPriceRow = {
  id: string;
  customer_id: string;
  price_key: string | null;
  price: number | null;
  updated_at: string;
  customer: {
    id: string;
    name: string | null;
  } | null;
};

type DefaultPriceRow = {
  id: string;
  price_key: string | null;
  price: number | null;
  updated_at: string;
};

type CustomerPriceWritePayload = {
  id: string;
  customer_id: string;
  price_key: string;
  price: number;
};

type DefaultPriceWritePayload = {
  id: string;
  price_key: string;
  price: number;
};

type DefaultPricePageOptions = {
  page: number;
  pageSize: number;
  keyword?: string;
};

export type DefaultPricePageResult = {
  records: DefaultPriceRecord[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

const customerPriceSelect = `
  id,
  customer_id,
  price_key,
  price,
  updated_at,
  customer:customers(id, name)
`;

function normalizeText(value: string | null | undefined) {
  return (value ?? "").trim();
}

function normalizeKey(value: string | null | undefined) {
  return normalizeText(value).toUpperCase();
}

function toSafeNumber(value: string | number | null | undefined) {
  const next = typeof value === "number" ? value : Number(value || 0);
  return Number.isFinite(next) ? next : 0;
}

function toPriceText(value: string | number | null | undefined) {
  const fixed = toSafeNumber(value).toFixed(2);
  return fixed.replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
}

function normalizePriceError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (message.includes("duplicate key")) {
    return "价格表里有重复版号，请先检查后再保存。";
  }
  return message || "价格表云端操作失败。";
}

function buildDefaultPageResult(
  records: DefaultPriceRecord[],
  page: number,
  pageSize: number,
  totalCount: number
): DefaultPricePageResult {
  const safePageSize = Math.max(1, pageSize);
  const totalPages = Math.max(1, Math.ceil(totalCount / safePageSize));

  return {
    records,
    totalCount,
    page: Math.min(Math.max(1, page), totalPages),
    pageSize: safePageSize,
    totalPages
  };
}

function mapCustomerPriceRows(rows: CustomerPriceRow[]) {
  const groups = new Map<string, CustomerPriceGroup>();

  rows.forEach((row) => {
    const customerId = row.customer?.id || row.customer_id;
    const customerName = normalizeText(row.customer?.name);
    if (!customerId || !customerName) return;

    const currentGroup = groups.get(customerId) ?? {
      id: customerId,
      customerName,
      prices: [],
      updatedAt: row.updated_at
    };

    currentGroup.prices.push({
      id: row.id,
      modelCode: normalizeText(row.price_key),
      unitPrice: toPriceText(row.price),
      updatedAt: row.updated_at
    });

    if (new Date(row.updated_at).getTime() > new Date(currentGroup.updatedAt).getTime()) {
      currentGroup.updatedAt = row.updated_at;
    }

    groups.set(customerId, currentGroup);
  });

  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      prices: [...group.prices].sort(
        (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
      )
    }))
    .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
}

function mapDefaultPriceRow(row: DefaultPriceRow): DefaultPriceRecord {
  return {
    id: row.id,
    modelCode: normalizeText(row.price_key),
    unitPrice: toPriceText(row.price),
    updatedAt: row.updated_at
  };
}

function mapDefaultPriceRows(rows: DefaultPriceRow[]) {
  return rows
    .map(mapDefaultPriceRow)
    .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
}

function buildCustomerPricePayloads(groups: CustomerPriceGroup[], customerIdByName: Map<string, string>) {
  const payloads: CustomerPriceWritePayload[] = [];

  groups.forEach((group) => {
    const customerName = normalizeText(group.customerName);
    if (!customerName) return;

    const customerId = customerIdByName.get(normalizeKey(customerName));
    if (!customerId) {
      throw new Error(`客户专属价格里的客户「${customerName}」还没在客户信息表里建立，无法保存。`);
    }

    group.prices.forEach((entry) => {
      const modelCode = normalizeText(entry.modelCode);
      if (!modelCode) return;
      payloads.push({
        id: entry.id || crypto.randomUUID(),
        customer_id: customerId,
        price_key: modelCode,
        price: toSafeNumber(entry.unitPrice)
      });
    });
  });

  return payloads;
}

function buildDefaultPricePayloads(rows: DefaultPriceRecord[]) {
  return rows
    .filter((row) => normalizeText(row.modelCode))
    .map((row) => ({
      id: row.id || crypto.randomUUID(),
      price_key: normalizeText(row.modelCode),
      price: toSafeNumber(row.unitPrice)
    }));
}

async function findCustomerByNameExact(customerName: string) {
  const client = requireSupabaseClient();
  const trimmedName = normalizeText(customerName);
  if (!trimmedName) return null;

  const { data, error } = await client
    .from("customers")
    .select("id, name, updated_at")
    .ilike("name", trimmedName)
    .limit(20)
    .returns<CustomerLookupRow[]>();

  if (error) {
    throw new Error(normalizePriceError(error));
  }

  return (data ?? []).find((row) => normalizeKey(row.name) === normalizeKey(trimmedName)) ?? null;
}

async function listCustomerPriceRowsByCustomerId(customerId: string) {
  const client = requireSupabaseClient();
  const { data, error } = await client
    .from("customer_prices")
    .select(customerPriceSelect)
    .eq("customer_id", customerId)
    .order("updated_at", { ascending: false })
    .returns<CustomerPriceRow[]>();

  if (error) {
    throw new Error(normalizePriceError(error));
  }

  return data ?? [];
}

export async function listCustomerPriceGroups() {
  const client = requireSupabaseClient();
  const { data, error } = await client
    .from("customer_prices")
    .select(customerPriceSelect)
    .order("updated_at", { ascending: false })
    .returns<CustomerPriceRow[]>();

  if (error) {
    throw new Error(normalizePriceError(error));
  }

  return mapCustomerPriceRows(data ?? []);
}

export async function findCustomerPriceGroupByCustomerName(customerName: string) {
  const customer = await findCustomerByNameExact(customerName);
  if (!customer) return null;

  const rows = await listCustomerPriceRowsByCustomerId(customer.id);
  const groups = mapCustomerPriceRows(rows);

  return (
    groups[0] ?? {
      id: customer.id,
      customerName: normalizeText(customer.name),
      prices: [],
      updatedAt: customer.updated_at
    }
  );
}

export async function saveCustomerPriceGroup(group: CustomerPriceGroup) {
  const client = requireSupabaseClient();
  const currentRows = await listCustomerPriceRowsByCustomerId(group.id);
  const currentGroups = mapCustomerPriceRows(currentRows);
  const currentEntries = currentGroups[0]?.prices ?? [];
  const nextEntries = group.prices
    .filter((entry) => normalizeText(entry.modelCode))
    .map((entry) => ({
      id: entry.id || crypto.randomUUID(),
      customer_id: group.id,
      price_key: normalizeText(entry.modelCode),
      price: toSafeNumber(entry.unitPrice)
    }));

  const currentIds = new Set(currentEntries.map((entry) => entry.id));
  const nextIds = new Set(nextEntries.map((entry) => entry.id));

  for (const entry of currentEntries) {
    if (!nextIds.has(entry.id)) {
      const { error } = await client.from("customer_prices").delete().eq("id", entry.id);
      if (error) {
        throw new Error(normalizePriceError(error));
      }
    }
  }

  for (const payload of nextEntries) {
    if (currentIds.has(payload.id)) {
      const { id, ...updatePayload } = payload;
      const { error } = await client.from("customer_prices").update(updatePayload).eq("id", id);
      if (error) {
        throw new Error(normalizePriceError(error));
      }
      continue;
    }

    const { error } = await client.from("customer_prices").insert(payload);
    if (error) {
      throw new Error(normalizePriceError(error));
    }
  }

  const nextGroup = await findCustomerPriceGroupByCustomerName(group.customerName);
  return (
    nextGroup ?? {
      ...group,
      prices: [],
      updatedAt: new Date().toISOString()
    }
  );
}

export async function listDefaultPrices() {
  const client = requireSupabaseClient();
  const { data, error } = await client
    .from("default_prices")
    .select("id, price_key, price, updated_at")
    .order("updated_at", { ascending: false })
    .returns<DefaultPriceRow[]>();

  if (error) {
    throw new Error(normalizePriceError(error));
  }

  return mapDefaultPriceRows(data ?? []);
}

export async function listDefaultPricePage(options: DefaultPricePageOptions) {
  const client = requireSupabaseClient();
  const page = Math.max(1, options.page);
  const pageSize = Math.max(1, options.pageSize);
  const keyword = normalizeText(options.keyword);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = client
    .from("default_prices")
    .select("id, price_key, price, updated_at", { count: "exact" })
    .order("updated_at", { ascending: false });

  if (keyword) {
    query = query.ilike("price_key", `%${keyword}%`);
  }

  const { data, error, count } = await query.range(from, to).returns<DefaultPriceRow[]>();

  if (error) {
    throw new Error(normalizePriceError(error));
  }

  return buildDefaultPageResult(mapDefaultPriceRows(data ?? []), page, pageSize, count ?? 0);
}

export async function createDefaultPrice(row: DefaultPriceRecord) {
  const client = requireSupabaseClient();
  const payload: DefaultPriceWritePayload = {
    id: row.id || crypto.randomUUID(),
    price_key: normalizeText(row.modelCode),
    price: toSafeNumber(row.unitPrice)
  };

  const { data, error } = await client
    .from("default_prices")
    .insert(payload)
    .select("id, price_key, price, updated_at")
    .single<DefaultPriceRow>();

  if (error) {
    throw new Error(normalizePriceError(error));
  }

  return mapDefaultPriceRow(data);
}

export async function updateDefaultPrice(row: DefaultPriceRecord) {
  const client = requireSupabaseClient();
  const payload = {
    price_key: normalizeText(row.modelCode),
    price: toSafeNumber(row.unitPrice)
  };

  const { data, error } = await client
    .from("default_prices")
    .update(payload)
    .eq("id", row.id)
    .select("id, price_key, price, updated_at")
    .single<DefaultPriceRow>();

  if (error) {
    throw new Error(normalizePriceError(error));
  }

  return mapDefaultPriceRow(data);
}

export async function deleteDefaultPriceById(rowId: string) {
  const client = requireSupabaseClient();
  const { error } = await client.from("default_prices").delete().eq("id", rowId);

  if (error) {
    throw new Error(normalizePriceError(error));
  }
}

export async function saveCustomerPriceGroups(groups: CustomerPriceGroup[]) {
  const client = requireSupabaseClient();
  const customers = await listCustomers();
  const customerIdByName = new Map(customers.map((customer) => [normalizeKey(customer.name), customer.id]));
  const currentRows = await listCustomerPriceGroups();
  const currentEntryIds = new Set(currentRows.flatMap((group) => group.prices.map((entry) => entry.id)));
  const nextPayloads = buildCustomerPricePayloads(groups, customerIdByName);
  const nextEntryIds = new Set(nextPayloads.map((payload) => payload.id));

  for (const group of currentRows) {
    for (const entry of group.prices) {
      if (!nextEntryIds.has(entry.id)) {
        const { error } = await client.from("customer_prices").delete().eq("id", entry.id);
        if (error) {
          throw new Error(normalizePriceError(error));
        }
      }
    }
  }

  for (const payload of nextPayloads) {
    if (currentEntryIds.has(payload.id)) {
      const { id, ...updatePayload } = payload;
      const { error } = await client.from("customer_prices").update(updatePayload).eq("id", id);
      if (error) {
        throw new Error(normalizePriceError(error));
      }
      continue;
    }

    const { error } = await client.from("customer_prices").insert(payload);
    if (error) {
      throw new Error(normalizePriceError(error));
    }
  }

  return listCustomerPriceGroups();
}

export async function saveDefaultPrices(rows: DefaultPriceRecord[]) {
  const client = requireSupabaseClient();
  const currentRows = await listDefaultPrices();
  const currentIds = new Set(currentRows.map((row) => row.id));
  const nextPayloads = buildDefaultPricePayloads(rows);
  const nextIds = new Set(nextPayloads.map((payload) => payload.id));

  for (const row of currentRows) {
    if (!nextIds.has(row.id)) {
      const { error } = await client.from("default_prices").delete().eq("id", row.id);
      if (error) {
        throw new Error(normalizePriceError(error));
      }
    }
  }

  for (const payload of nextPayloads) {
    if (currentIds.has(payload.id)) {
      const { id, ...updatePayload } = payload;
      const { error } = await client.from("default_prices").update(updatePayload).eq("id", id);
      if (error) {
        throw new Error(normalizePriceError(error));
      }
      continue;
    }

    const { error } = await client.from("default_prices").insert(payload);
    if (error) {
      throw new Error(normalizePriceError(error));
    }
  }

  return listDefaultPrices();
}
