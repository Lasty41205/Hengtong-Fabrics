import { extractModelCode, findCustomerByText, hydrateFormWithDatabase } from "./localDb";
import { createEmptyForm, createEmptyItem } from "./mockData";
import { calculateAmount, calculateTotalAmount } from "./orderMath";
import { FieldIssue, ItemFieldKey, LocalBusinessDatabase, OrderForm, OrderItem } from "./types";

const requiredFieldTips: Record<keyof OrderForm["issues"], string> = {
  customer: "客户不能为空",
  phone: "电话不能为空",
  address: "地址不能为空",
  logistics: "货运方式不能为空"
};

const requiredItemTips: Record<ItemFieldKey, string> = {
  nameSpec: "名称及规格不能为空",
  quantity: "数量不能为空",
  unitPrice: "单价不能为空",
  amount: "金额不能为空"
};

const likelyModelPattern = /[A-Za-z\u4e00-\u9fa5-]/;
const pureNumberPattern = /^\d+(?:\.\d+)?$/;
const quantityPattern = /^(\d+(?:\.\d+)?)(?:米|m|M)?$/;
const phonePattern = /^1\d{10}$/;
const numericModelPattern = /^\d+(?:-[^\s]+)?$/;

const isLikelyProductModel = (value: string) => likelyModelPattern.test(value) && !pureNumberPattern.test(value);

const parseQuantityToken = (value: string) => {
  const match = value.match(quantityPattern);
  return match ? match[1] : "";
};

const looksLikeModelToken = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (numericModelPattern.test(trimmed)) return true;
  return false;
};

export { calculateAmount, calculateTotalAmount };

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
    modelCode: extractModelCode(nameSpec),
    quantity,
    unitPrice,
    amount: calculateAmount(quantity, unitPrice),
    priceSource: unitPrice ? "manual" : "none",
    issues: {}
  } satisfies OrderItem;
}

function parseItemLine(line: string) {
  const tokens = line.split(/\s+/).filter(Boolean);

  for (let index = 0; index < tokens.length - 1; index += 1) {
    const nameSpec = tokens[index];
    const quantity = parseQuantityToken(tokens[index + 1] || "");

    if (!isLikelyProductModel(nameSpec) || !quantity) {
      continue;
    }

    const unitPrice = pureNumberPattern.test(tokens[index + 2] || "") ? tokens[index + 2] : "";

    return {
      nameSpec,
      quantity,
      unitPrice,
      modelTokenIndex: index
    };
  }

  return null;
}

function inferCustomerName(lines: string[], parsedLines: Array<ReturnType<typeof parseItemLine> | null>) {
  for (let lineIndex = 0; lineIndex < parsedLines.length; lineIndex += 1) {
    const parsedLine = parsedLines[lineIndex];
    if (!parsedLine) continue;

    const tokens = lines[lineIndex].split(/\s+/).filter(Boolean);
    if (parsedLine.modelTokenIndex > 0) {
      const candidate = tokens.slice(0, parsedLine.modelTokenIndex).join(" ").trim();
      if (candidate && !phonePattern.test(candidate) && !parseQuantityToken(candidate)) {
        return candidate;
      }
    }
  }

  const firstLineTokens = lines[0]?.split(/\s+/).filter(Boolean) ?? [];
  if (firstLineTokens.length >= 2 && looksLikeModelToken(firstLineTokens[1])) {
    const candidate = firstLineTokens[0].trim();
    if (candidate && !phonePattern.test(candidate) && !parseQuantityToken(candidate) && !looksLikeModelToken(candidate)) {
      return candidate;
    }
  }

  return "";
}

export function parseLocalOrderInput(
  rawInput: string,
  database: LocalBusinessDatabase
): { form: OrderForm; summary: string } {
  const form = createEmptyForm();
  const text = rawInput.replace(/\r/g, "\n").trim();
  const matchedNotes: string[] = [];

  if (!text) {
    return {
      form,
      summary: "输入为空，未识别到任何内容，请先输入报单文本。"
    };
  }

  const lines = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const parsedLineResults = lines.map((line) => parseItemLine(line));

  const customerRecord = findCustomerByText(database, text);
  if (customerRecord) {
    form.customer = customerRecord.name;
    matchedNotes.push(`识别客户：${customerRecord.name}`);
  } else {
    const inferredCustomer = inferCustomerName(lines, parsedLineResults);
    if (inferredCustomer) {
      form.customer = inferredCustomer;
      matchedNotes.push(`识别新客户：${inferredCustomer}`);
    }
  }

  const phoneMatch = text.match(/1\d{10}/);
  if (phoneMatch) {
    form.phone = phoneMatch[0];
    matchedNotes.push(`识别电话：${phoneMatch[0]}`);
  }

  if (!form.address && text.includes("邯郸")) {
    form.address = "邯郸";
    matchedNotes.push("识别地址：邯郸");
  }

  const parsedItems: OrderItem[] = [];
  parsedLineResults.forEach((parsedLine) => {
    if (!parsedLine) return;

    parsedItems.push(createParsedItem(parsedLine.nameSpec, parsedLine.quantity, parsedLine.unitPrice));
    matchedNotes.push(
      parsedLine.unitPrice
        ? `识别商品：${parsedLine.nameSpec}，数量 ${parsedLine.quantity}，原文带单价`
        : `识别商品：${parsedLine.nameSpec}，数量 ${parsedLine.quantity}`
    );
  });

  form.items = parsedItems.length > 0 ? parsedItems : [createEmptyItem()];
  form.totalAmount = calculateTotalAmount(form.items);

  const hydratedForm = hydrateFormWithDatabase(form, database);
  const customerPriceCount = hydratedForm.items.filter((item) => item.priceSource === "customer").length;
  const defaultPriceCount = hydratedForm.items.filter((item) => item.priceSource === "default").length;
  const missingPriceCount = hydratedForm.items.filter(
    (item) => item.modelCode && !item.unitPrice.trim()
  ).length;

  if (customerRecord) {
    matchedNotes.push("已按客户资料补全电话、地址、默认货运方式（仅填空项）");
  }
  if (customerPriceCount > 0) {
    matchedNotes.push(`${customerPriceCount}行使用客户价`);
  }
  if (defaultPriceCount > 0) {
    matchedNotes.push(`${defaultPriceCount}行使用默认价`);
  }
  if (missingPriceCount > 0) {
    matchedNotes.push(`${missingPriceCount}行未匹配到价格，需手动补全`);
  }

  return {
    form: hydratedForm,
    summary:
      matchedNotes.length > 0
        ? `${matchedNotes.join("；")}。`
        : "未识别到有效字段，请继续手动补充。"
  };
}
