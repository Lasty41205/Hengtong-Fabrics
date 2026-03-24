import { HistoryRecord, OrderForm } from "./types";

const HISTORY_STORAGE_KEY = "invoice-history-records";
export const PENDING_HISTORY_ID_KEY = "invoice-pending-history-id";

const padText = (value: number) => String(value).padStart(2, "0");

export const formatHistoryTime = (dateValue: Date | string) => {
  const date = typeof dateValue === "string" ? new Date(dateValue) : dateValue;
  return `${date.getFullYear()}-${padText(date.getMonth() + 1)}-${padText(date.getDate())} ${padText(date.getHours())}:${padText(date.getMinutes())}:${padText(date.getSeconds())}`;
};

const sanitizeHistoryRecord = (record: Partial<HistoryRecord>): HistoryRecord => ({
  id: record.id || crypto.randomUUID(),
  createdAt: record.createdAt || new Date().toISOString(),
  createdAtText: record.createdAtText || formatHistoryTime(record.createdAt || new Date()),
  rawInput: record.rawInput || "",
  customer: record.customer || "",
  phone: record.phone || "",
  address: record.address || "",
  logistics: record.logistics || "",
  remark: record.remark || "",
  items: (record.items || []).map((item) => ({
    id: item.id || crypto.randomUUID(),
    nameSpec: item.nameSpec || "",
    modelCode: item.modelCode || "",
    quantity: item.quantity || "",
    unitPrice: item.unitPrice || "",
    amount: item.amount || "",
    priceSource: item.priceSource || "manual"
  })),
  totalAmount: record.totalAmount || "0",
  previewImageDataUrl: record.previewImageDataUrl || ""
});

export function loadHistoryRecords() {
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw) as Partial<HistoryRecord>[];
    return parsed
      .map(sanitizeHistoryRecord)
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
  } catch {
    return [];
  }
}

export function saveHistoryRecords(records: HistoryRecord[]) {
  localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(records));
  return records;
}

export function saveHistoryRecord(rawInput: string, form: OrderForm, recordId?: string) {
  const now = new Date();
  const nextRecord = sanitizeHistoryRecord({
    id: recordId || crypto.randomUUID(),
    createdAt: now.toISOString(),
    createdAtText: formatHistoryTime(now),
    rawInput,
    customer: form.customer,
    phone: form.phone,
    address: form.address,
    logistics: form.logistics,
    remark: form.remark,
    items: form.items.map((item) => ({
      id: item.id,
      nameSpec: item.nameSpec,
      modelCode: item.modelCode,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      amount: item.amount,
      priceSource: item.priceSource
    })),
    totalAmount: form.totalAmount,
    previewImageDataUrl: ""
  });

  const existingRecords = loadHistoryRecords().filter((record) => record.id !== nextRecord.id);
  const nextRecords = [nextRecord, ...existingRecords];
  saveHistoryRecords(nextRecords);
  return nextRecord;
}

export function updateHistoryRecordImage(recordId: string, previewImageDataUrl: string) {
  if (!recordId || !previewImageDataUrl) return;

  const nextRecords = loadHistoryRecords().map((record) =>
    record.id === recordId
      ? {
          ...record,
          previewImageDataUrl
        }
      : record
  );

  saveHistoryRecords(nextRecords);
}
