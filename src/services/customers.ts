import { buildLogisticsValue, splitLogisticsValue } from "../lib/shipping";
import { requireSupabaseClient } from "../lib/supabase";
import { CustomerRecord } from "../types";

type ProfileRef = {
  display_name: string | null;
  email: string | null;
} | null;

type CustomerRow = {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  default_shipping_type: string | null;
  default_shipping_name: string | null;
  note: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  created_by_profile: ProfileRef;
  updated_by_profile: ProfileRef;
};

type CustomerWritePayload = {
  id: string;
  name: string;
  phone: string;
  address: string;
  default_shipping_type: string;
  default_shipping_name: string;
  note: string;
};

type CustomerPageOptions = {
  page: number;
  pageSize: number;
  keyword?: string;
};

export type CustomerPageResult = {
  records: CustomerRecord[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

const customerSelect = `
  id,
  name,
  phone,
  address,
  default_shipping_type,
  default_shipping_name,
  note,
  created_by,
  updated_by,
  created_at,
  updated_at,
  created_by_profile:profiles!customers_created_by_fkey(display_name, email),
  updated_by_profile:profiles!customers_updated_by_fkey(display_name, email)
`;

function normalizeText(value: string | null | undefined) {
  return (value ?? "").trim();
}

function normalizeCustomerKey(value: string | null | undefined) {
  return normalizeText(value).toUpperCase();
}

function pickUserLabel(profile: ProfileRef, fallbackId: string | null) {
  if (profile?.display_name?.trim()) return profile.display_name.trim();
  if (profile?.email?.trim()) return profile.email.trim();
  return fallbackId ?? "";
}

function mapRowToCustomer(row: CustomerRow): CustomerRecord {
  return {
    id: row.id,
    name: normalizeText(row.name),
    phone: normalizeText(row.phone),
    address: normalizeText(row.address),
    defaultLogistics: buildLogisticsValue(row.default_shipping_type, row.default_shipping_name),
    note: normalizeText(row.note),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by ?? undefined,
    updatedBy: row.updated_by ?? undefined,
    createdByName: pickUserLabel(row.created_by_profile, row.created_by) || undefined,
    updatedByName: pickUserLabel(row.updated_by_profile, row.updated_by) || undefined
  };
}

function toWritePayload(customer: CustomerRecord): CustomerWritePayload {
  const shipping = splitLogisticsValue(customer.defaultLogistics);

  return {
    id: customer.id,
    name: normalizeText(customer.name),
    phone: normalizeText(customer.phone),
    address: normalizeText(customer.address),
    default_shipping_type: shipping.type,
    default_shipping_name: shipping.name,
    note: normalizeText(customer.note)
  };
}

function toUpdatePayload(customer: CustomerRecord) {
  const { id: _id, ...payload } = toWritePayload(customer);
  return payload;
}

function normalizeCustomerError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");

  if (message.includes("duplicate key")) {
    return "客户名重复，云端 customers 不允许保存同名客户。";
  }

  if (message.includes("null value") || message.includes("violates not-null constraint")) {
    return "customers 写入失败：当前有必填文本字段被传成了空值。已修复代码，请刷新后重试。";
  }

  return message || "云端 customers 操作失败。";
}

function buildCustomerPageResult(
  records: CustomerRecord[],
  page: number,
  pageSize: number,
  totalCount: number
): CustomerPageResult {
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

export async function listCustomers() {
  const client = requireSupabaseClient();
  const { data, error } = await client
    .from("customers")
    .select(customerSelect)
    .order("name", { ascending: true })
    .returns<CustomerRow[]>();

  if (error) {
    throw new Error(normalizeCustomerError(error));
  }

  return (data ?? []).map(mapRowToCustomer);
}

export async function getCustomerById(customerId: string) {
  const safeCustomerId = normalizeText(customerId);
  if (!safeCustomerId) return null;

  const client = requireSupabaseClient();
  const { data, error } = await client
    .from("customers")
    .select(customerSelect)
    .eq("id", safeCustomerId)
    .maybeSingle<CustomerRow>();

  if (error) {
    throw new Error(normalizeCustomerError(error));
  }

  return data ? mapRowToCustomer(data) : null;
}

export async function findCustomerByNameExact(customerName: string) {
  const safeCustomerName = normalizeText(customerName);
  if (!safeCustomerName) return null;

  const client = requireSupabaseClient();
  const { data, error } = await client
    .from("customers")
    .select(customerSelect)
    .ilike("name", safeCustomerName)
    .limit(20)
    .returns<CustomerRow[]>();

  if (error) {
    throw new Error(normalizeCustomerError(error));
  }

  const matchedRow = (data ?? []).find((row) => normalizeCustomerKey(row.name) === normalizeCustomerKey(safeCustomerName));
  return matchedRow ? mapRowToCustomer(matchedRow) : null;
}

export async function listCustomerPage(options: CustomerPageOptions) {
  const client = requireSupabaseClient();
  const page = Math.max(1, options.page);
  const pageSize = Math.max(1, options.pageSize);
  const keyword = normalizeText(options.keyword);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = client
    .from("customers")
    .select(customerSelect, { count: "exact" })
    .order("updated_at", { ascending: false });

  if (keyword) {
    query = query.or(`name.ilike.%${keyword}%,phone.ilike.%${keyword}%,address.ilike.%${keyword}%,note.ilike.%${keyword}%`);
  }

  const { data, error, count } = await query.range(from, to).returns<CustomerRow[]>();

  if (error) {
    throw new Error(normalizeCustomerError(error));
  }

  return buildCustomerPageResult((data ?? []).map(mapRowToCustomer), page, pageSize, count ?? 0);
}

export async function createCustomer(customer: CustomerRecord) {
  const client = requireSupabaseClient();
  const payload = toWritePayload(customer);
  const { data, error } = await client
    .from("customers")
    .insert(payload)
    .select(customerSelect)
    .single<CustomerRow>();

  if (error) {
    throw new Error(normalizeCustomerError(error));
  }

  return mapRowToCustomer(data);
}

export async function updateCustomer(customer: CustomerRecord) {
  const client = requireSupabaseClient();
  const payload = toUpdatePayload(customer);
  const { data, error } = await client
    .from("customers")
    .update(payload)
    .eq("id", customer.id)
    .select(customerSelect)
    .single<CustomerRow>();

  if (error) {
    throw new Error(normalizeCustomerError(error));
  }

  return mapRowToCustomer(data);
}

export async function deleteCustomerById(customerId: string) {
  const client = requireSupabaseClient();
  const { error } = await client.from("customers").delete().eq("id", customerId);

  if (error) {
    throw new Error(normalizeCustomerError(error));
  }
}

export async function importCustomers(customers: CustomerRecord[]) {
  const existingCustomers = await listCustomers();
  const existingById = new Map(existingCustomers.map((customer) => [customer.id, customer]));
  const existingByName = new Map(
    existingCustomers.map((customer) => [normalizeCustomerKey(customer.name), customer])
  );

  for (const customer of customers) {
    const matchedById = existingById.get(customer.id);
    const matchedByName = existingByName.get(normalizeCustomerKey(customer.name));

    if (matchedById) {
      await updateCustomer({
        ...matchedById,
        ...customer,
        id: matchedById.id
      });
      continue;
    }

    if (matchedByName) {
      await updateCustomer({
        ...matchedByName,
        ...customer,
        id: matchedByName.id
      });
      continue;
    }

    const createdCustomer = await createCustomer(customer);
    existingById.set(createdCustomer.id, createdCustomer);
    existingByName.set(normalizeCustomerKey(createdCustomer.name), createdCustomer);
  }

  return listCustomers();
}

