export type IssueLevel = "missing" | "lowConfidence" | "unmatched";

export type FieldIssue = {
  level: IssueLevel;
  message: string;
};

export type ItemFieldKey = "nameSpec" | "quantity" | "unitPrice" | "amount";

export type PriceSource = "customer" | "default" | "manual" | "none";

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
