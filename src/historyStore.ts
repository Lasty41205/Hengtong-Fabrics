import { HistoryRecord, OrderForm } from "./types";

const HISTORY_STORAGE_KEY = "invoice-history-records";
export const PENDING_HISTORY_ID_KEY = "invoice-pending-history-id";

const padText = (value: number) => String(value).padStart(2, "0");

export const formatHistoryDate = (dateValue: Date | string) => {
  const date = typeof dateValue === "string" ? new Date(dateValue) : dateValue;
  return `${date.getFullYear()}-${padText(date.getMonth() + 1)}-${padText(date.getDate())}`;
};

export const formatHistoryTime = (dateValue: Date | string) => {
  const date = typeof dateValue === "string" ? new Date(dateValue) : dateValue;
  return `${formatHistoryDate(date)} ${padText(date.getHours())}:${padText(date.getMinutes())}:${padText(date.getSeconds())}`;
};

const sanitizeHistoryRecord = (record: Partial<HistoryRecord>): HistoryRecord => {
  const createdAt = record.createdAt || new Date().toISOString();
  const updatedAt = record.updatedAt || createdAt;

  return {
    id: record.id || crypto.randomUUID(),
    createdAt,
    createdAtText: record.createdAtText || formatHistoryTime(createdAt),
    updatedAt,
    updatedAtText: record.updatedAtText || formatHistoryTime(updatedAt),
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
    previewImageDataUrl: record.previewImageDataUrl || "",
    createdByName: record.createdByName || "",
    updatedByName: record.updatedByName || ""
  };
};

function isQuotaExceededError(error: unknown) {
  if (error instanceof DOMException) {
    return error.name === "QuotaExceededError" || error.name === "NS_ERROR_DOM_QUOTA_REACHED";
  }

  return String(error ?? "").includes("QuotaExceeded");
}

function stripHistoryPreviewImages(records: HistoryRecord[]) {
  return records.map((record) => ({
    ...record,
    previewImageDataUrl: ""
  }));
}

export function loadHistoryRecords() {
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw) as Partial<HistoryRecord>[];
    return parsed
      .map(sanitizeHistoryRecord)
      .sort(
        (left, right) => new Date(right.updatedAt || right.createdAt).getTime() - new Date(left.updatedAt || left.createdAt).getTime()
      );
  } catch {
    return [];
  }
}

export function saveHistoryRecords(records: HistoryRecord[]) {
  const normalizedRecords = records.map(sanitizeHistoryRecord);

  try {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(normalizedRecords));
    return normalizedRecords;
  } catch (error) {
    if (!isQuotaExceededError(error)) {
      throw error;
    }

    const compactRecords = stripHistoryPreviewImages(normalizedRecords);
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(compactRecords));
    return compactRecords;
  }
}

export function saveHistoryRecord(rawInput: string, form: OrderForm, recordId?: string, extra?: Partial<HistoryRecord>) {
  const now = new Date();
  const createdAt = extra?.createdAt || now.toISOString();
  const updatedAt = extra?.updatedAt || createdAt;

  const nextRecord = sanitizeHistoryRecord({
    id: recordId || crypto.randomUUID(),
    createdAt,
    createdAtText: extra?.createdAtText || formatHistoryTime(createdAt),
    updatedAt,
    updatedAtText: extra?.updatedAtText || formatHistoryTime(updatedAt),
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
    previewImageDataUrl: extra?.previewImageDataUrl || "",
    createdByName: extra?.createdByName || "",
    updatedByName: extra?.updatedByName || ""
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
