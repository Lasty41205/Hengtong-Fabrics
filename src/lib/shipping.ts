import { resolveFreightSelection } from "../mockData";

export type ShippingParts = {
  type: string;
  name: string;
};

export function splitLogisticsValue(value: string): ShippingParts {
  const trimmed = value.trim();
  if (!trimmed) {
    return {
      type: "",
      name: ""
    };
  }

  if (trimmed === "/") {
    return {
      type: "/",
      name: ""
    };
  }

  const selection = resolveFreightSelection(trimmed);

  if (selection.customMode === "primary") {
    return {
      type: "其他",
      name: selection.customText.trim()
    };
  }

  if (selection.customMode === "secondary") {
    return {
      type: selection.primary.trim(),
      name: selection.customText.trim()
    };
  }

  if (selection.primary === "物流" || selection.primary === "快递") {
    return {
      type: selection.primary,
      name: selection.secondary.trim()
    };
  }

  return {
    type: trimmed,
    name: ""
  };
}

export function buildLogisticsValue(type: string | null | undefined, name: string | null | undefined) {
  const safeType = (type ?? "").trim();
  const safeName = (name ?? "").trim();

  if (!safeType && !safeName) return "";
  if (safeType === "/") return "/";
  if (!safeType) return safeName;
  if (!safeName) return safeType;
  if (safeType === "其他") return safeName;
  if (safeName === safeType) return safeType;

  return `${safeType}-${safeName}`;
}
