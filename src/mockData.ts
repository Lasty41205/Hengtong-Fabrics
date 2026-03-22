import { OrderForm, OrderItem } from "./types";

export const logisticsOptions = ["圆通", "四季春", "京东", "其他"] as const;

export const customerDirectory = {
  恒通: {
    phone: "18339931253",
    address: "邯郸"
  }
} as const;

export const productPriceLibrary: Record<string, string> = {
  "860-12": "18",
  "860-13": "14",
  "180-13": "14"
};

export function createEmptyItem(): OrderItem {
  return {
    id: crypto.randomUUID(),
    nameSpec: "",
    quantity: "",
    unitPrice: "",
    amount: "",
    issues: {}
  };
}

export const createEmptyForm = (): OrderForm => ({
  customer: "",
  phone: "",
  address: "",
  logistics: "",
  remark: "",
  items: [createEmptyItem()],
  totalAmount: "0",
  issues: {}
});
