import { findCustomerRecord, extractModelCode } from "../localDb";
import { formatHistoryTime, loadHistoryRecords } from "../historyStore";
import { splitLogisticsValue, buildLogisticsValue } from "../lib/shipping";
import { requireSupabaseClient } from "../lib/supabase";
import { CustomerRecord, HistoryListRecord, HistoryRecord, LocalBusinessDatabase, OrderForm } from "../types";
import { createCustomer, listCustomers, updateCustomer } from "./customers";

type ProfileRef = {
  display_name: string | null;
  email: string | null;
} | null;

type CustomerRef = {
  id: string;
  name: string | null;
  phone: string | null;
  address: string | null;
} | null;

type CustomerListRef = {
  id: string;
  name: string | null;
} | null;

type InvoiceItemRow = {
  id: string;
  spec_name: string;
  quantity: number | null;
  unit: string | null;
  unit_price: number | null;
  amount: number | null;
  sort_order: number | null;
};

type InvoiceRow = {
  id: string;
  customer_id: string | null;
  invoice_no: string;
  invoice_date: string;
  shipping_type: string | null;
  shipping_name: string | null;
  total_amount: number | null;
  note: string | null;
  raw_input_text: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  customer: CustomerRef;
  invoice_items: InvoiceItemRow[] | null;
  created_by_profile: ProfileRef;
  updated_by_profile: ProfileRef;
};

type InvoiceListRow = {
  id: string;
  customer_id: string | null;
  invoice_no: string;
  shipping_type: string | null;
  shipping_name: string | null;
  total_amount: number | null;
  note: string | null;
  raw_input_text: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  customer: CustomerListRef;
  created_by_profile: ProfileRef;
  updated_by_profile: ProfileRef;
};

type InvoiceWritePayload = {
  id: string;
  customer_id: string | null;
  invoice_no: string;
  invoice_date: string;
  shipping_type: string;
  shipping_name: string;
  total_amount: number;
  note: string;
  raw_input_text: string;
  generated_image_url: string;
};

type InvoiceItemWritePayload = {
  invoice_id: string;
  spec_name: string;
  quantity: number;
  unit: string;
  unit_price: number;
  amount: number;
  sort_order: number;
};

type HistoryPageParams = {
  page: number;
  pageSize: number;
  keyword?: string;
};

type HistoryPageResult = {
  records: HistoryListRecord[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

const invoiceDetailSelect = `
  id,
  customer_id,
  invoice_no,
  invoice_date,
  shipping_type,
  shipping_name,
  total_amount,
  note,
  raw_input_text,
  created_at,
  updated_at,
  created_by,
  updated_by,
  customer:customers(id, name, phone, address),
  invoice_items(id, spec_name, quantity, unit, unit_price, amount, sort_order),
  created_by_profile:profiles!invoices_created_by_fkey(display_name, email),
  updated_by_profile:profiles!invoices_updated_by_fkey(display_name, email)
`;

const invoiceListSelect = `
  id,
  customer_id,
  invoice_no,
  shipping_type,
  shipping_name,
  total_amount,
  note,
  raw_input_text,
  created_at,
  updated_at,
  created_by,
  updated_by,
  customer:customers(id, name),
  created_by_profile:profiles!invoices_created_by_fkey(display_name, email),
  updated_by_profile:profiles!invoices_updated_by_fkey(display_name, email)
`;

function normalizeText(value: string | null | undefined) {
  return (value ?? "").trim();
}

function normalizeNameKey(value: string | null | undefined) {
  return normalizeText(value).toUpperCase();
}

function sanitizeKeyword(value: string | undefined) {
  return normalizeText(value).replace(/[,%()]/g, " ").replace(/\s+/g, " ").trim();
}

function toSafeNumber(value: string | number | null | undefined) {
  const next = typeof value === "number" ? value : Number(value || 0);
  return Number.isFinite(next) ? next : 0;
}

function formatNumberText(value: number | null | undefined) {
  const fixed = toSafeNumber(value).toFixed(2);
  return fixed.replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
}

function buildInvoiceDateText() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function buildInvoiceNo(invoiceId: string) {
  const now = new Date();
  const dateText = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0")
  ].join("");

  return `INV${dateText}${invoiceId.replace(/-/g, "").slice(0, 6).toUpperCase()}`;
}

function pickProfileName(profile: ProfileRef, fallbackId: string | null) {
  if (profile?.display_name?.trim()) return profile.display_name.trim();
  if (profile?.email?.trim()) return profile.email.trim();
  return fallbackId ?? "";
}

function mapRowToHistoryListRecord(row: InvoiceListRow): HistoryListRecord {
  return {
    id: row.id,
    createdAt: row.created_at,
    createdAtText: formatHistoryTime(row.created_at),
    updatedAt: row.updated_at,
    updatedAtText: formatHistoryTime(row.updated_at),
    rawInput: normalizeText(row.raw_input_text),
    customer: normalizeText(row.customer?.name),
    logistics: buildLogisticsValue(row.shipping_type, row.shipping_name),
    remark: normalizeText(row.note),
    totalAmount: formatNumberText(row.total_amount),
    createdByName: pickProfileName(row.created_by_profile, row.created_by) || undefined,
    updatedByName: pickProfileName(row.updated_by_profile, row.updated_by) || undefined
  };
}

export function mapHistoryRecordToListRecord(record: HistoryRecord): HistoryListRecord {
  return {
    id: record.id,
    createdAt: record.createdAt,
    createdAtText: record.createdAtText,
    updatedAt: record.updatedAt,
    updatedAtText: record.updatedAtText,
    rawInput: record.rawInput,
    customer: record.customer,
    logistics: record.logistics,
    remark: record.remark,
    totalAmount: record.totalAmount,
    createdByName: record.createdByName,
    updatedByName: record.updatedByName
  };
}

function mapRowToHistoryRecord(row: InvoiceRow): HistoryRecord {
  const items = [...(row.invoice_items ?? [])]
    .sort((left, right) => (left.sort_order ?? 0) - (right.sort_order ?? 0))
    .map((item) => ({
      id: item.id,
      nameSpec: normalizeText(item.spec_name),
      modelCode: extractModelCode(item.spec_name),
      quantity: formatNumberText(item.quantity),
      unitPrice: formatNumberText(item.unit_price),
      amount: formatNumberText(item.amount),
      priceSource: "manual" as const
    }));

  return {
    id: row.id,
    createdAt: row.created_at,
    createdAtText: formatHistoryTime(row.created_at),
    updatedAt: row.updated_at,
    updatedAtText: formatHistoryTime(row.updated_at),
    rawInput: normalizeText(row.raw_input_text),
    customer: normalizeText(row.customer?.name),
    phone: normalizeText(row.customer?.phone),
    address: normalizeText(row.customer?.address),
    logistics: buildLogisticsValue(row.shipping_type, row.shipping_name),
    remark: normalizeText(row.note),
    items,
    totalAmount: formatNumberText(row.total_amount),
    previewImageDataUrl: "",
    createdByName: pickProfileName(row.created_by_profile, row.created_by) || undefined,
    updatedByName: pickProfileName(row.updated_by_profile, row.updated_by) || undefined
  };
}

async function ensureInvoiceCustomerId(
  database: LocalBusinessDatabase,
  form: OrderForm,
  existingInvoice: InvoiceRow | null
) {
  const customerName = normalizeText(form.customer);
  if (!customerName) {
    return existingInvoice?.customer_id ?? null;
  }

  const localCustomer = findCustomerRecord(database, customerName);
  const cloudCustomers = await listCustomers();
  const existingCloudCustomer =
    cloudCustomers.find((customer) => localCustomer?.id && customer.id === localCustomer.id) ||
    cloudCustomers.find((customer) => normalizeNameKey(customer.name) === normalizeNameKey(customerName));

  if (existingCloudCustomer) {
    const shouldPatchCustomer =
      (!normalizeText(existingCloudCustomer.phone) && normalizeText(form.phone)) ||
      (!normalizeText(existingCloudCustomer.address) && normalizeText(form.address)) ||
      (!normalizeText(existingCloudCustomer.defaultLogistics) && normalizeText(form.logistics));

    if (shouldPatchCustomer) {
      await updateCustomer({
        ...existingCloudCustomer,
        phone: normalizeText(existingCloudCustomer.phone) || normalizeText(form.phone),
        address: normalizeText(existingCloudCustomer.address) || normalizeText(form.address),
        defaultLogistics: normalizeText(existingCloudCustomer.defaultLogistics) || normalizeText(form.logistics)
      });
    }

    return existingCloudCustomer.id;
  }

  const nextCustomer: CustomerRecord = {
    id: crypto.randomUUID(),
    name: customerName,
    phone: normalizeText(form.phone),
    address: normalizeText(form.address),
    defaultLogistics: normalizeText(form.logistics),
    note: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const createdCustomer = await createCustomer(nextCustomer);
  return createdCustomer.id;
}

function buildInvoicePayload(
  invoiceId: string,
  customerId: string | null,
  form: OrderForm,
  rawInput: string,
  existingInvoice: InvoiceRow | null
): InvoiceWritePayload {
  const shipping = splitLogisticsValue(form.logistics);

  return {
    id: invoiceId,
    customer_id: customerId,
    invoice_no: existingInvoice?.invoice_no || buildInvoiceNo(invoiceId),
    invoice_date: buildInvoiceDateText(),
    shipping_type: shipping.type,
    shipping_name: shipping.name,
    total_amount: toSafeNumber(form.totalAmount),
    note: normalizeText(form.remark),
    raw_input_text: normalizeText(rawInput),
    generated_image_url: ""
  };
}

function buildInvoiceItemsPayload(invoiceId: string, form: OrderForm): InvoiceItemWritePayload[] {
  return form.items.map((item, index) => ({
    invoice_id: invoiceId,
    spec_name: normalizeText(item.nameSpec),
    quantity: toSafeNumber(item.quantity),
    unit: "",
    unit_price: toSafeNumber(item.unitPrice),
    amount: toSafeNumber(item.amount),
    sort_order: index
  }));
}

function normalizeInvoiceError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");

  if (message.includes("duplicate key")) {
    return "销货单编号重复，云端 invoices 保存失败，请重试。";
  }

  return message || "云端 invoices 操作失败。";
}

async function fetchInvoiceRowById(invoiceId: string) {
  const client = requireSupabaseClient();
  const { data, error } = await client
    .from("invoices")
    .select(invoiceDetailSelect)
    .eq("id", invoiceId)
    .maybeSingle<InvoiceRow>();

  if (error) {
    throw new Error(normalizeInvoiceError(error));
  }

  return data ?? null;
}

async function findMatchingCustomerIds(keyword: string) {
  const client = requireSupabaseClient();
  const { data, error } = await client
    .from("customers")
    .select("id")
    .ilike("name", `%${keyword}%`)
    .limit(30);

  if (error) {
    throw new Error(normalizeInvoiceError(error));
  }

  return (data ?? []).map((row: { id: string }) => row.id).filter(Boolean);
}

export async function listInvoiceHistoryPage(params: HistoryPageParams): Promise<HistoryPageResult> {
  const client = requireSupabaseClient();
  const page = Math.max(1, params.page || 1);
  const pageSize = Math.max(1, params.pageSize || 10);
  const keyword = sanitizeKeyword(params.keyword);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = client.from("invoices").select(invoiceListSelect, { count: "exact" });

  if (keyword) {
    const customerIds = await findMatchingCustomerIds(keyword);
    const filters = [
      `invoice_no.ilike.%${keyword}%`,
      `raw_input_text.ilike.%${keyword}%`,
      `note.ilike.%${keyword}%`
    ];

    if (customerIds.length > 0) {
      filters.push(`customer_id.in.(${customerIds.join(",")})`);
    }

    query = query.or(filters.join(","));
  }

  const { data, error, count } = await query
    .order("updated_at", { ascending: false })
    .range(from, to)
    .returns<InvoiceListRow[]>();

  if (error) {
    throw new Error(normalizeInvoiceError(error));
  }

  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  return {
    records: (data ?? []).map(mapRowToHistoryListRecord),
    totalCount,
    page,
    pageSize,
    totalPages
  };
}

export async function getInvoiceHistoryRecordById(invoiceId: string) {
  const invoiceRow = await fetchInvoiceRowById(invoiceId);
  return invoiceRow ? mapRowToHistoryRecord(invoiceRow) : null;
}

export function listLocalHistoryPage(params: HistoryPageParams): HistoryPageResult {
  const page = Math.max(1, params.page || 1);
  const pageSize = Math.max(1, params.pageSize || 10);
  const keyword = sanitizeKeyword(params.keyword).toUpperCase();
  const allRecords = loadHistoryRecords();
  const filteredRecords = keyword
    ? allRecords.filter((record) =>
        [record.customer, record.rawInput, record.remark, record.totalAmount]
          .filter(Boolean)
          .join(" ")
          .toUpperCase()
          .includes(keyword)
      )
    : allRecords;

  const totalCount = filteredRecords.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const safePage = Math.min(page, totalPages);
  const from = (safePage - 1) * pageSize;
  const to = from + pageSize;

  return {
    records: filteredRecords.slice(from, to).map(mapHistoryRecordToListRecord),
    totalCount,
    page: safePage,
    pageSize,
    totalPages
  };
}

export async function saveInvoiceHistoryRecord(options: {
  recordId?: string;
  form: OrderForm;
  rawInput: string;
  database: LocalBusinessDatabase;
}) {
  const client = requireSupabaseClient();
  const invoiceId = options.recordId || crypto.randomUUID();
  const existingInvoice = options.recordId ? await fetchInvoiceRowById(options.recordId) : null;
  const customerId = await ensureInvoiceCustomerId(options.database, options.form, existingInvoice);
  const invoicePayload = buildInvoicePayload(invoiceId, customerId, options.form, options.rawInput, existingInvoice);

  if (existingInvoice) {
    const { error } = await client
      .from("invoices")
      .update({
        customer_id: invoicePayload.customer_id,
        invoice_no: invoicePayload.invoice_no,
        invoice_date: invoicePayload.invoice_date,
        shipping_type: invoicePayload.shipping_type,
        shipping_name: invoicePayload.shipping_name,
        total_amount: invoicePayload.total_amount,
        note: invoicePayload.note,
        raw_input_text: invoicePayload.raw_input_text,
        generated_image_url: ""
      })
      .eq("id", invoiceId);

    if (error) {
      throw new Error(normalizeInvoiceError(error));
    }

    const { error: deleteItemsError } = await client.from("invoice_items").delete().eq("invoice_id", invoiceId);
    if (deleteItemsError) {
      throw new Error(normalizeInvoiceError(deleteItemsError));
    }
  } else {
    const { error } = await client.from("invoices").insert(invoicePayload);
    if (error) {
      throw new Error(normalizeInvoiceError(error));
    }
  }

  const itemsPayload = buildInvoiceItemsPayload(invoiceId, options.form);
  if (itemsPayload.length > 0) {
    const { error: insertItemsError } = await client.from("invoice_items").insert(itemsPayload);
    if (insertItemsError) {
      throw new Error(normalizeInvoiceError(insertItemsError));
    }
  }

  const savedHistoryRecord = await getInvoiceHistoryRecordById(invoiceId);
  if (!savedHistoryRecord) {
    throw new Error("销货单已写入云端，但回读失败，请刷新历史记录页确认。");
  }

  return savedHistoryRecord;
}
