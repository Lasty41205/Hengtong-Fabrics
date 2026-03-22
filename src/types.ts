export type IssueLevel = "missing" | "lowConfidence" | "unmatched";

export type FieldIssue = {
  level: IssueLevel;
  message: string;
};

export type ItemFieldKey = "nameSpec" | "quantity" | "unitPrice" | "amount";

export type OrderItem = {
  id: string;
  nameSpec: string;
  quantity: string;
  unitPrice: string;
  amount: string;
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
