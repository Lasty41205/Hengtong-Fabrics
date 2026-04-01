import { createCustomer, findCustomerByNameExact } from "./customers";
import { requireSupabaseClient } from "../lib/supabase";
import {
  BillingCustomerSummary,
  BillingPaymentMethod,
  BillingRecord,
  BillingRecordType,
  CustomerRecord
} from "../types";

type ProfileRef = {
  display_name: string | null;
  email: string | null;
} | null;

type CustomerRef = {
  id: string;
  name: string | null;
} | null;

type InvoiceRef = {
  id: string;
  raw_input_text: string | null;
  total_amount: number | null;
  created_at: string | null;
  customer: {
    name: string | null;
  } | null;
} | null;

type BillingEntryRow = {
  id: string;
  customer_id: string | null;
  invoice_id: string | null;
  entry_type: BillingRecordType;
  amount: number | null;
  payment_method: string | null;
  note: string | null;
  occurred_at: string;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  customer: CustomerRef;
  invoice: InvoiceRef;
  created_by_profile: ProfileRef;
  updated_by_profile: ProfileRef;
};

type BillingEntryWritePayload = {
  id?: string;
  customer_id: string | null;
  invoice_id: string | null;
  entry_type: BillingRecordType;
  amount: number;
  payment_method: string;
  note: string;
  occurred_at: string;
};

type BillingEntryInput = {
  id?: string;
  customerName: string;
  customerId?: string;
  type: BillingRecordType;
  dateTime?: string;
  amount: string;
  note?: string;
  paymentMethod?: BillingPaymentMethod | "";
  relatedOrderId?: string;
};

const billingSelect = `
  id,
  customer_id,
  invoice_id,
  entry_type,
  amount,
  payment_method,
  note,
  occurred_at,
  created_at,
  updated_at,
  created_by,
  updated_by,
  customer:customers(id, name),
  invoice:invoices(id, raw_input_text, total_amount, created_at, customer:customers(name)),
  created_by_profile:profiles!billing_entries_created_by_fkey(display_name, email),
  updated_by_profile:profiles!billing_entries_updated_by_fkey(display_name, email)
`;

const billingTypeLabels: Record<BillingRecordType, string> = {
  auto_add: "自动追加",
  manual_add: "手动记账",
  manual_payment: "手动已支付"
};

const paymentWeights: Record<BillingRecordType, 1 | -1> = {
  auto_add: 1,
  manual_add: 1,
  manual_payment: -1
};

function normalizeText(value: string | null | undefined) {
  return (value ?? "").trim();
}

function normalizeNameKey(value: string | null | undefined) {
  return normalizeText(value).toUpperCase();
}

function toSafeNumber(value: string | number | null | undefined) {
  const next = typeof value === "number" ? value : Number(value || 0);
  return Number.isFinite(next) ? next : 0;
}

function toMoneyText(value: string | number | null | undefined) {
  const fixed = toSafeNumber(value).toFixed(2);
  return fixed.replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
}

function pickUserLabel(profile: ProfileRef, fallbackId: string | null) {
  if (profile?.display_name?.trim()) return profile.display_name.trim();
  if (profile?.email?.trim()) return profile.email.trim();
  return fallbackId ?? "";
}

function getRecordCustomerName(row: BillingEntryRow) {
  return normalizeText(row.customer?.name) || normalizeText(row.invoice?.customer?.name);
}

function mapRowToBillingRecord(row: BillingEntryRow): BillingRecord {
  return {
    id: row.id,
    customerName: getRecordCustomerName(row),
    customerId: row.customer_id ?? undefined,
    type: row.entry_type,
    dateTime: row.occurred_at,
    amount: toMoneyText(row.amount),
    note: normalizeText(row.note),
    paymentMethod: normalizeText(row.payment_method) as BillingPaymentMethod | "",
    relatedOrderId: row.invoice_id ?? "",
    invoiceId: row.invoice_id ?? undefined,
    orderInfo: row.invoice
      ? {
          rawInput: normalizeText(row.invoice.raw_input_text),
          customer: normalizeText(row.invoice.customer?.name),
          totalAmount: toMoneyText(row.invoice.total_amount),
          createdAtText: normalizeText(row.invoice.created_at)
        }
      : undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdByName: pickUserLabel(row.created_by_profile, row.created_by) || undefined,
    updatedByName: pickUserLabel(row.updated_by_profile, row.updated_by) || undefined
  };
}

function normalizeBillingError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return message || "账单云端操作失败。";
}

async function ensureCustomer(customerName: string, customerId?: string) {
  const safeCustomerId = normalizeText(customerId);
  if (safeCustomerId) {
    return safeCustomerId;
  }

  const safeName = normalizeText(customerName);
  if (!safeName) {
    return null;
  }

  const matchedCustomer = await findCustomerByNameExact(safeName);
  if (matchedCustomer) {
    return matchedCustomer.id;
  }

  const createdCustomer = await createCustomer({
    id: crypto.randomUUID(),
    name: safeName,
    phone: "",
    address: "",
    defaultLogistics: "",
    note: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  } satisfies CustomerRecord);

  return createdCustomer.id;
}

function buildWritePayload(input: BillingEntryInput, customerId: string | null): BillingEntryWritePayload {
  const safeType = input.type;
  const safeAmount = Math.abs(toSafeNumber(input.amount));
  return {
    id: input.id,
    customer_id: customerId,
    invoice_id: normalizeText(input.relatedOrderId) || null,
    entry_type: safeType,
    amount: safeAmount,
    payment_method: safeType === "manual_payment" ? normalizeText(input.paymentMethod) : "",
    note: normalizeText(input.note),
    occurred_at: input.dateTime ? new Date(input.dateTime).toISOString() : new Date().toISOString()
  };
}

export function getBillingTypeLabel(type: BillingRecordType) {
  return billingTypeLabels[type];
}

export function calculateBillingSummaries(records: BillingRecord[]) {
  const summaryMap = new Map<string, BillingCustomerSummary>();

  records.forEach((record) => {
    const key = normalizeNameKey(record.customerName);
    if (!key) return;

    const current = summaryMap.get(key) ?? {
      customerName: record.customerName,
      currentBalance: "0",
      lastUpdatedAt: record.dateTime,
      lastRecordSummary: `${getBillingTypeLabel(record.type)} ${record.amount}`
    };

    const nextBalance = toSafeNumber(current.currentBalance) + paymentWeights[record.type] * toSafeNumber(record.amount);
    const isNewer = new Date(record.dateTime).getTime() >= new Date(current.lastUpdatedAt).getTime();

    summaryMap.set(key, {
      customerName: current.customerName || record.customerName,
      currentBalance: toMoneyText(nextBalance),
      lastUpdatedAt: isNewer ? record.dateTime : current.lastUpdatedAt,
      lastRecordSummary: isNewer ? `${getBillingTypeLabel(record.type)} ${record.amount}` : current.lastRecordSummary
    });
  });

  return Array.from(summaryMap.values()).sort((left, right) =>
    left.customerName.localeCompare(right.customerName, "zh-Hans-CN", { sensitivity: "base" })
  );
}

export function calculateCustomerCurrentBalance(
  records: BillingRecord[],
  customerName: string,
  options?: { excludeRelatedOrderId?: string }
) {
  const normalizedName = normalizeNameKey(customerName);
  if (!normalizedName) return "0";

  const balance = records.reduce((total, record) => {
    if (normalizeNameKey(record.customerName) !== normalizedName) return total;
    if (options?.excludeRelatedOrderId && record.relatedOrderId === options.excludeRelatedOrderId) return total;
    return total + paymentWeights[record.type] * toSafeNumber(record.amount);
  }, 0);

  return toMoneyText(balance);
}

export async function listBillingEntries() {
  const client = requireSupabaseClient();
  const { data, error } = await client
    .from("billing_entries")
    .select(billingSelect)
    .order("occurred_at", { ascending: false })
    .returns<BillingEntryRow[]>();

  if (error) {
    throw new Error(normalizeBillingError(error));
  }

  return (data ?? []).map(mapRowToBillingRecord);
}

export async function createBillingEntry(input: BillingEntryInput) {
  const client = requireSupabaseClient();
  const customerId = await ensureCustomer(input.customerName, input.customerId);
  const payload = buildWritePayload(input, customerId);
  const { data, error } = await client
    .from("billing_entries")
    .insert(payload)
    .select(billingSelect)
    .single<BillingEntryRow>();

  if (error) {
    throw new Error(normalizeBillingError(error));
  }

  return mapRowToBillingRecord(data);
}

export async function updateBillingEntry(id: string, input: BillingEntryInput) {
  const client = requireSupabaseClient();
  const customerId = await ensureCustomer(input.customerName, input.customerId);
  const payload = buildWritePayload(input, customerId);
  const { id: _discardId, ...updatePayload } = payload;
  const { data, error } = await client
    .from("billing_entries")
    .update(updatePayload)
    .eq("id", id)
    .select(billingSelect)
    .single<BillingEntryRow>();

  if (error) {
    throw new Error(normalizeBillingError(error));
  }

  return mapRowToBillingRecord(data);
}

export async function deleteBillingEntryById(id: string) {
  const client = requireSupabaseClient();
  const { error } = await client.from("billing_entries").delete().eq("id", id);

  if (error) {
    throw new Error(normalizeBillingError(error));
  }
}

async function findAutoBillingEntryByInvoiceId(invoiceId: string) {
  const safeInvoiceId = normalizeText(invoiceId);
  if (!safeInvoiceId) return null;

  const client = requireSupabaseClient();
  const { data, error } = await client
    .from("billing_entries")
    .select(billingSelect)
    .eq("invoice_id", safeInvoiceId)
    .eq("entry_type", "auto_add")
    .limit(1)
    .maybeSingle<BillingEntryRow>();

  if (error) {
    throw new Error(normalizeBillingError(error));
  }

  return data ? mapRowToBillingRecord(data) : null;
}

export async function saveAutoBillingEntryForInvoice(options: {
  invoiceId: string;
  customerName: string;
  customerId?: string;
  amount: string;
  note?: string;
}) {
  const existingRecord = await findAutoBillingEntryByInvoiceId(options.invoiceId);

  if (existingRecord) {
    return updateBillingEntry(existingRecord.id, {
      id: existingRecord.id,
      customerName: options.customerName,
      customerId: options.customerId || existingRecord.customerId,
      type: "auto_add",
      amount: options.amount,
      note: options.note || "订单累计到账单",
      paymentMethod: "",
      relatedOrderId: options.invoiceId,
      dateTime: new Date().toISOString()
    });
  }

  return createBillingEntry({
    customerName: options.customerName,
    customerId: options.customerId,
    type: "auto_add",
    amount: options.amount,
    note: options.note || "订单累计到账单",
    paymentMethod: "",
    relatedOrderId: options.invoiceId,
    dateTime: new Date().toISOString()
  });
}

export async function removeAutoBillingEntryByInvoiceId(invoiceId: string) {
  if (!normalizeText(invoiceId)) return;
  const target = await findAutoBillingEntryByInvoiceId(invoiceId);
  if (!target) return;
  await deleteBillingEntryById(target.id);
}

