import {
  BillingCustomerSummary,
  BillingOrderSnapshot,
  BillingPaymentMethod,
  BillingRecord,
  BillingRecordType
} from "./types";

const BILLING_STORAGE_KEY = "invoice-billing-records";

const paymentWeights: Record<BillingRecordType, 1 | -1> = {
  auto_add: 1,
  manual_add: 1,
  manual_payment: -1
};

const paymentTypeLabels: Record<BillingRecordType, string> = {
  auto_add: "自动追加",
  manual_add: "手动记账",
  manual_payment: "手动已支付"
};

const toSafeNumber = (value: string) => {
  const next = Number(value || 0);
  return Number.isFinite(next) ? next : 0;
};

const toMoneyText = (value: number) => {
  const fixed = value.toFixed(2);
  return fixed.replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
};

const sanitizeRecord = (record: Partial<BillingRecord>): BillingRecord => ({
  id: record.id || crypto.randomUUID(),
  customerName: (record.customerName || "").trim(),
  type: (record.type as BillingRecordType) || "manual_add",
  dateTime: record.dateTime || new Date().toISOString(),
  amount: toMoneyText(Math.abs(toSafeNumber(record.amount || "0"))),
  note: (record.note || "").trim(),
  paymentMethod: (record.paymentMethod as BillingPaymentMethod | "") || "",
  relatedOrderId: record.relatedOrderId || "",
  orderInfo: record.orderInfo
    ? {
        rawInput: record.orderInfo.rawInput || "",
        customer: record.orderInfo.customer || "",
        totalAmount: record.orderInfo.totalAmount || "0",
        createdAtText: record.orderInfo.createdAtText || ""
      }
    : undefined
});

export function getBillingTypeLabel(type: BillingRecordType) {
  return paymentTypeLabels[type];
}

export function loadBillingRecords() {
  try {
    const raw = localStorage.getItem(BILLING_STORAGE_KEY);
    if (!raw) return [];
    return (JSON.parse(raw) as Partial<BillingRecord>[])
      .map(sanitizeRecord)
      .sort((left, right) => new Date(right.dateTime).getTime() - new Date(left.dateTime).getTime());
  } catch {
    return [];
  }
}

export function saveBillingRecords(records: BillingRecord[]) {
  const nextRecords = records
    .map(sanitizeRecord)
    .sort((left, right) => new Date(right.dateTime).getTime() - new Date(left.dateTime).getTime());
  localStorage.setItem(BILLING_STORAGE_KEY, JSON.stringify(nextRecords));
  return nextRecords;
}

export function findAutoBillingRecordByOrderId(orderId: string) {
  if (!orderId) return undefined;
  return loadBillingRecords().find((record) => record.type === "auto_add" && record.relatedOrderId === orderId);
}

export function removeAutoBillingRecordByOrderId(orderId: string) {
  if (!orderId) return loadBillingRecords();
  const nextRecords = loadBillingRecords().filter(
    (record) => !(record.type === "auto_add" && record.relatedOrderId === orderId)
  );
  return saveBillingRecords(nextRecords);
}

export function upsertBillingRecord(record: Partial<BillingRecord>) {
  const nextRecord = sanitizeRecord(record);
  const currentRecords = loadBillingRecords();
  const nextRecords = currentRecords.some((item) => item.id === nextRecord.id)
    ? currentRecords.map((item) => (item.id === nextRecord.id ? nextRecord : item))
    : [nextRecord, ...currentRecords];
  saveBillingRecords(nextRecords);
  return nextRecord;
}

export function deleteBillingRecord(recordId: string) {
  const nextRecords = loadBillingRecords().filter((record) => record.id !== recordId);
  return saveBillingRecords(nextRecords);
}

export function upsertAutoBillingRecord(options: {
  customerName: string;
  amount: string;
  relatedOrderId: string;
  note?: string;
  orderInfo?: BillingOrderSnapshot;
}) {
  const existingRecord = findAutoBillingRecordByOrderId(options.relatedOrderId);
  return upsertBillingRecord({
    id: existingRecord?.id,
    customerName: options.customerName,
    type: "auto_add",
    dateTime: new Date().toISOString(),
    amount: options.amount,
    note: options.note || "订单累计到账单",
    paymentMethod: "",
    relatedOrderId: options.relatedOrderId,
    orderInfo: options.orderInfo
  });
}

export function getCustomerCurrentBalance(customerName: string, options?: { excludeRelatedOrderId?: string }) {
  const normalizedName = customerName.trim().toUpperCase();
  if (!normalizedName) return "0";

  const balance = loadBillingRecords().reduce((total, record) => {
    if (record.customerName.trim().toUpperCase() !== normalizedName) return total;
    if (options?.excludeRelatedOrderId && record.relatedOrderId === options.excludeRelatedOrderId) return total;
    return total + paymentWeights[record.type] * toSafeNumber(record.amount);
  }, 0);

  return toMoneyText(balance);
}

export function getBillingSummaries() {
  const summaryMap = new Map<string, BillingCustomerSummary>();
  const records = loadBillingRecords();

  records.forEach((record) => {
    const key = record.customerName.trim().toUpperCase();
    if (!key) return;

    const current = summaryMap.get(key) ?? {
      customerName: record.customerName,
      currentBalance: "0",
      lastUpdatedAt: record.dateTime,
      lastRecordSummary: `${getBillingTypeLabel(record.type)} ${record.amount}`
    };

    const nextBalance =
      toSafeNumber(current.currentBalance) + paymentWeights[record.type] * toSafeNumber(record.amount);

    summaryMap.set(key, {
      customerName: current.customerName || record.customerName,
      currentBalance: toMoneyText(nextBalance),
      lastUpdatedAt:
        new Date(record.dateTime).getTime() > new Date(current.lastUpdatedAt).getTime()
          ? record.dateTime
          : current.lastUpdatedAt,
      lastRecordSummary:
        new Date(record.dateTime).getTime() >= new Date(current.lastUpdatedAt).getTime()
          ? `${getBillingTypeLabel(record.type)} ${record.amount}`
          : current.lastRecordSummary
    });
  });

  return Array.from(summaryMap.values()).sort((left, right) => left.customerName.localeCompare(right.customerName, "zh-Hans-CN", { sensitivity: "base" }));
}
