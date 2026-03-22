import { OrderForm } from "./types";

export const createEmptyForm = (): OrderForm => ({
  customer: "",
  phone: "",
  address: "",
  logistics: "",
  remark: "",
  items: [
    {
      id: crypto.randomUUID(),
      nameSpec: "",
      quantity: "",
      unitPrice: "",
      amount: "",
      issues: {}
    }
  ],
  totalAmount: "0",
  issues: {}
});

export const createMockParsedOrder = (): OrderForm => ({
  customer: "恒通",
  phone: "18339931253",
  address: "邯郸",
  logistics: "四季春",
  remark: "",
  items: [
    {
      id: crypto.randomUUID(),
      nameSpec: "860-12",
      quantity: "20",
      unitPrice: "18",
      amount: "360",
      issues: {}
    },
    {
      id: crypto.randomUUID(),
      nameSpec: "180-13",
      quantity: "10",
      unitPrice: "",
      amount: "140",
      issues: {
        unitPrice: {
          level: "missing",
          message: "单价缺失，请手动补齐"
        }
      }
    }
  ],
  totalAmount: "500",
  issues: {}
});
