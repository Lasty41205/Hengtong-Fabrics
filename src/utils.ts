import { createEmptyForm, createEmptyItem, customerDirectory, productPriceLibrary } from "./mockData";
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

function createParsedItem(nameSpec: string, quantity: string, unitPrice: string) {
  return {
    id: crypto.randomUUID(),
    nameSpec,
    quantity,
    unitPrice,
    amount: calculateAmount(quantity, unitPrice),
    issues: {}
  } satisfies OrderItem;
}

export function parseLocalOrderInput(rawInput: string): { form: OrderForm; summary: string } {
  const form = createEmptyForm();
  const text = rawInput.replace(/\r/g, "\n").trim();
  const matchedNotes: string[] = [];

  if (!text) {
    return {
      form,
      summary: "输入为空，未识别到任何内容，请先输入报单文本。"
    };
  }

  const customerName = Object.keys(customerDirectory).find((name) => text.includes(name));
  if (customerName) {
    form.customer = customerName;
    matchedNotes.push(`识别客户：${customerName}`);

    const profile = customerDirectory[customerName as keyof typeof customerDirectory];
    form.phone = profile.phone;
    form.address = profile.address;
    matchedNotes.push("已从本地客户资料补全电话和地址");
  }

  const phoneMatch = text.match(/1\d{10}/);
  if (phoneMatch) {
    form.phone = phoneMatch[0];
    matchedNotes.push(`识别电话：${phoneMatch[0]}`);
  }

  if (text.includes("邯郸")) {
    form.address = "邯郸";
    matchedNotes.push("识别地址：邯郸");
  }

  const parsedItems: OrderItem[] = [];
  const fullItemPattern = /([A-Za-z0-9]+-\d+)\s+(\d+(?:\.\d+)?)\s*米?\s+(\d+(?:\.\d+)?)/g;
  let fullMatch: RegExpExecArray | null;

  while ((fullMatch = fullItemPattern.exec(text)) !== null) {
    const [, nameSpec, quantity, unitPrice] = fullMatch;
    parsedItems.push(createParsedItem(nameSpec, quantity, unitPrice));
    matchedNotes.push(`识别商品：${nameSpec}`);
  }

  if (parsedItems.length === 0) {
    const lines = text
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean);

    lines.forEach((line) => {
      const partialMatch = line.match(/([A-Za-z0-9]+-\d+)\s+(\d+(?:\.\d+)?)\s*米?/);
      if (!partialMatch) return;

      const [, nameSpec, quantity] = partialMatch;
      const unitPrice = productPriceLibrary[nameSpec] ?? "";
      parsedItems.push(createParsedItem(nameSpec, quantity, unitPrice));
      matchedNotes.push(
        unitPrice ? `识别商品：${nameSpec}，并按本地价格库补全单价` : `识别商品：${nameSpec}`
      );
    });
  }

  form.items = parsedItems.length > 0 ? parsedItems : [createEmptyItem()];
  form.totalAmount = calculateTotalAmount(form.items);

  return {
    form,
    summary:
      matchedNotes.length > 0
        ? `${matchedNotes.join("；")}。物流需手动选择。`
        : "未识别到有效字段，请继续手动补充。"
  };
}
