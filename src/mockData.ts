import { OrderForm, OrderItem } from "./types";

export const freightPrimaryOptions = ["物流", "快递", "/", "其他"] as const;
export const logisticsCarrierOptions = [
  "返回",
  "凯瑞",
  "方圆",
  "四季安",
  "诚信",
  "鸿泰",
  "远航",
  "金象",
  "海澳",
  "长通",
  "宇鑫",
  "正和",
  "其他"
] as const;
export const expressCarrierOptions = ["返回", "京东", "京东同城", "顺丰", "顺丰同城", "小飞侠", "其他"] as const;

export type FreightPrimaryOption = (typeof freightPrimaryOptions)[number] | "";
export type FreightCustomMode = "none" | "primary" | "secondary";

export type FreightSelectionState = {
  primary: FreightPrimaryOption;
  secondary: string;
  customMode: FreightCustomMode;
  customText: string;
};

const logisticsCarriers = logisticsCarrierOptions.filter((item) => item !== "返回" && item !== "其他");
const expressCarriers = expressCarrierOptions.filter((item) => item !== "返回" && item !== "其他");

const createEmptyFreightSelection = (): FreightSelectionState => ({
  primary: "",
  secondary: "",
  customMode: "none",
  customText: ""
});

export const emptyFreightSelection = createEmptyFreightSelection;

export function resolveFreightSelection(value: string): FreightSelectionState {
  const trimmed = value.trim();
  if (!trimmed) return createEmptyFreightSelection();

  if (trimmed === "/") {
    return {
      primary: "/",
      secondary: "",
      customMode: "none",
      customText: ""
    };
  }

  if (trimmed.startsWith("物流-")) {
    const detail = trimmed.slice(3).trim();
    return {
      primary: "物流",
      secondary: logisticsCarriers.includes(detail as (typeof logisticsCarriers)[number]) ? detail : "其他",
      customMode: logisticsCarriers.includes(detail as (typeof logisticsCarriers)[number]) ? "none" : "secondary",
      customText: logisticsCarriers.includes(detail as (typeof logisticsCarriers)[number]) ? "" : detail
    };
  }

  if (trimmed.startsWith("快递-")) {
    const detail = trimmed.slice(3).trim();
    return {
      primary: "快递",
      secondary: expressCarriers.includes(detail as (typeof expressCarriers)[number]) ? detail : "其他",
      customMode: expressCarriers.includes(detail as (typeof expressCarriers)[number]) ? "none" : "secondary",
      customText: expressCarriers.includes(detail as (typeof expressCarriers)[number]) ? "" : detail
    };
  }

  if (logisticsCarriers.includes(trimmed as (typeof logisticsCarriers)[number])) {
    return {
      primary: "物流",
      secondary: trimmed,
      customMode: "none",
      customText: ""
    };
  }

  if (expressCarriers.includes(trimmed as (typeof expressCarriers)[number])) {
    return {
      primary: "快递",
      secondary: trimmed,
      customMode: "none",
      customText: ""
    };
  }

  return {
    primary: "其他",
    secondary: "",
    customMode: "primary",
    customText: trimmed
  };
}

export function createEmptyItem(): OrderItem {
  return {
    id: crypto.randomUUID(),
    nameSpec: "",
    modelCode: "",
    quantity: "",
    unitPrice: "",
    amount: "",
    priceSource: "none",
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
