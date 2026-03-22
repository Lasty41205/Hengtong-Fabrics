import { FieldIssue, ItemFieldKey, OrderForm, OrderItem } from "./types";

const requiredFieldTips: Record<keyof OrderForm["issues"], string> = {
  customer: "客户不能为空",
  phone: "电话不能为空",
  address: "地址不能为空",
  logistics: "物流不能为空"
};

const requiredItemTips: Record<ItemFieldKey, string> = {
  nameSpec: "名称及规格不能为空",
  quantity: "数量不能为空",
  unitPrice: "单价不能为空",
  amount: "金额不能为空"
};

export const calculateAmount = (quantity: string, unitPrice: string) => {
  const qty = Number(quantity);
  const price = Number(unitPrice);

  if (quantity && unitPrice && Number.isFinite(qty) && Number.isFinite(price)) {
    return String(qty * price);
  }

  return "";
};

export const calculateTotalAmount = (items: OrderItem[]) =>
  String(
    items.reduce((sum, item) => {
      const amount = Number(item.amount || 0);
      return sum + (Number.isFinite(amount) ? amount : 0);
    }, 0)
  );

export const getInputIssue = (
  presetIssue: FieldIssue | undefined,
  value: string,
  fallback: string
) => {
  if (presetIssue) return presetIssue;
  if (!value.trim()) {
    return {
      level: "missing" as const,
      message: fallback
    };
  }
  return undefined;
};

export const collectValidationIssues = (form: OrderForm) => {
  const issues: Array<{ key: string; message: string }> = [];

  (Object.keys(requiredFieldTips) as Array<keyof OrderForm["issues"]>).forEach((key) => {
    const issue = form.issues[key];

    if (issue) {
      issues.push({ key, message: issue.message });
      return;
    }

    if (!form[key].trim()) {
      issues.push({ key, message: requiredFieldTips[key] });
    }
  });

  form.items.forEach((item, index) => {
    (Object.keys(requiredItemTips) as ItemFieldKey[]).forEach((field) => {
      const issue = item.issues[field];

      if (issue) {
        issues.push({
          key: `item-${item.id}-${field}`,
          message: `第${index + 1}行${issue.message}`
        });
        return;
      }

      if (!String(item[field] ?? "").trim()) {
        issues.push({
          key: `item-${item.id}-${field}`,
          message: `第${index + 1}行${requiredItemTips[field]}`
        });
      }
    });
  });

  return issues;
};
