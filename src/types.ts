export type IssueLevel = "missing" | "lowConfidence" | "unmatched";

export type FieldIssue = {
  level: IssueLevel;
  message: string;
};

export type ItemFieldKey = "nameSpec" | "quantity" | "unitPrice" | "amount";

export type PriceSource = "customer" | "default" | "manual" | "none";

export type BillingRecordType = "auto_add" | "manual_add" | "manual_payment";
export type BillingPaymentMethod = "微信" | "支付宝" | "现金" | "银行收款码" | "其他";

export type BillingOrderSnapshot = {
  rawInput: string;
  customer: string;
  totalAmount: string;
  createdAtText: string;
};

export type BillingSummary = {
  includeInLedger: boolean;
  previousBalance: string;
  currentAmount: string;
  totalAmount: string;
  relatedOrderId: string;
};

export type BillingRecord = {
  id: string;
  customerName: string;
  type: BillingRecordType;
  dateTime: string;
  amount: string;
  note: string;
  paymentMethod: BillingPaymentMethod | "";
  relatedOrderId: string;
  orderInfo?: BillingOrderSnapshot;
};

export type BillingCustomerSummary = {
  customerName: string;
  currentBalance: string;
  lastUpdatedAt: string;
  lastRecordSummary: string;
};

export type OrderItem = {
  id: string;
  nameSpec: string;
  modelCode: string;
  quantity: string;
  unitPrice: string;
  amount: string;
  priceSource: PriceSource;
  issues: Partial<Record<ItemFieldKey, FieldIssue>>;
};

export type OrderForm = {
  customer: string;
  phone: string;
  address: string;
  logistics: string;
  remark: string;
  items: OrderItem[];
  totalAmount: string;
  billingSummary?: BillingSummary;
  issues: Partial<Record<"customer" | "phone" | "address" | "logistics", FieldIssue>>;
};

export type CustomerRecord = {
  id: string;
  name: string;
  phone: string;
  address: string;
  defaultLogistics: string;
  note: string;
  updatedAt: string;
};

export type CustomerPriceEntry = {
  id: string;
  modelCode: string;
  unitPrice: string;
  updatedAt: string;
};

export type CustomerPriceGroup = {
  id: string;
  customerName: string;
  prices: CustomerPriceEntry[];
  updatedAt: string;
};

export type DefaultPriceRecord = {
  id: string;
  modelCode: string;
  unitPrice: string;
  updatedAt: string;
};

export type LocalBusinessDatabase = {
  version: number;
  lastUpdatedAt: string;
  customers: CustomerRecord[];
  customerPrices: CustomerPriceGroup[];
  defaultPrices: DefaultPriceRecord[];
};

export type PriceMatchResult = {
  source: PriceSource;
  unitPrice: string;
  modelCode: string;
};

export type DatabaseSyncResult = {
  database: LocalBusinessDatabase;
  changed: boolean;
  summary: string;
};

export type HistoryItemSnapshot = {
  id: string;
  nameSpec: string;
  modelCode: string;
  quantity: string;
  unitPrice: string;
  amount: string;
  priceSource: PriceSource;
};

export type HistoryRecord = {
  id: string;
  createdAt: string;
  createdAtText: string;
  rawInput: string;
  customer: string;
  phone: string;
  address: string;
  logistics: string;
  remark: string;
  items: HistoryItemSnapshot[];
  totalAmount: string;
  previewImageDataUrl: string;
};
