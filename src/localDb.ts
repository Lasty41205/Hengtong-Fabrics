import seedDatabase from "./data/localDbSeed.json";
import { calculateAmount, calculateTotalAmount } from "./orderMath";
import {
  CustomerPriceEntry,
  CustomerPriceGroup,
  CustomerRecord,
  DatabaseSyncResult,
  DefaultPriceRecord,
  LocalBusinessDatabase,
  OrderForm,
  OrderItem,
  PriceMatchResult
} from "./types";

const STORAGE_KEY = "invoice-local-business-db";

const cloneSeedDatabase = () =>
  JSON.parse(JSON.stringify(seedDatabase)) as LocalBusinessDatabase;

const nowText = () => new Date().toISOString();

const normalizeSpaces = (value: string) => value.replace(/\s+/g, " ").trim();

export const normalizeText = (value: string) => normalizeSpaces(value).toUpperCase();

const compareText = (left: string, right: string) =>
  left.localeCompare(right, "zh-Hans-CN", { sensitivity: "base" });

const readLeadingNumber = (value: string) => {
  const match = value.match(/^\d+/);
  return match ? Number(match[0]) : Number.NaN;
};

export const compareModelCode = (left: string, right: string) => {
  const leftCode = normalizeSpaces(left);
  const rightCode = normalizeSpaces(right);
  const leftNumber = readLeadingNumber(leftCode);
  const rightNumber = readLeadingNumber(rightCode);
  const leftIsNumber = Number.isFinite(leftNumber);
  const rightIsNumber = Number.isFinite(rightNumber);

  if (leftIsNumber && rightIsNumber) {
    if (leftNumber !== rightNumber) {
      return leftNumber - rightNumber;
    }
    return compareText(leftCode, rightCode);
  }

  if (leftIsNumber) return -1;
  if (rightIsNumber) return 1;

  return compareText(leftCode, rightCode);
};

export const extractPrimaryModel = (value: string) => {
  const trimmed = normalizeSpaces(value);
  if (!trimmed) return "";
  return trimmed.split(" ")[0];
};

export const extractModelCode = (value: string) => {
  const primaryModel = extractPrimaryModel(value);
  if (!primaryModel) return "";

  const numericSeriesMatch = primaryModel.match(/^(\d+)-.+$/);
  if (numericSeriesMatch) {
    return numericSeriesMatch[1];
  }

  return primaryModel;
};

const normalizeModelCode = (value: string) => normalizeText(extractModelCode(value));

export const sortCustomers = (records: CustomerRecord[]) =>
  [...records].sort((left, right) => compareText(left.name, right.name));

export const sortCustomerPriceGroups = (records: CustomerPriceGroup[]) =>
  [...records]
    .map((group) => ({
      ...group,
      prices: [...group.prices].sort((left, right) => compareModelCode(left.modelCode, right.modelCode))
    }))
    .sort((left, right) => compareText(left.customerName, right.customerName));

export const sortDefaultPrices = (records: DefaultPriceRecord[]) =>
  [...records].sort((left, right) => compareModelCode(left.modelCode, right.modelCode));

export const sortDatabase = (database: LocalBusinessDatabase): LocalBusinessDatabase => ({
  ...database,
  customers: sortCustomers(database.customers),
  customerPrices: sortCustomerPriceGroups(database.customerPrices),
  defaultPrices: sortDefaultPrices(database.defaultPrices)
});

function sanitizeCustomers(records: CustomerRecord[] | undefined): CustomerRecord[] {
  return sortCustomers(
    (records ?? []).map((record) => {
      const updatedAt = record.updatedAt || nowText();

      return {
        id: record.id || crypto.randomUUID(),
        name: normalizeSpaces(record.name || ""),
        phone: normalizeSpaces(record.phone || ""),
        address: normalizeSpaces(record.address || ""),
        defaultLogistics: normalizeSpaces(record.defaultLogistics || ""),
        note: normalizeSpaces(record.note || ""),
        createdAt: record.createdAt || updatedAt,
        updatedAt,
        createdBy: record.createdBy,
        updatedBy: record.updatedBy,
        createdByName: record.createdByName,
        updatedByName: record.updatedByName
      } satisfies CustomerRecord;
    })
  );
}

function sanitizeCustomerPriceGroups(records: unknown[] | undefined): CustomerPriceGroup[] {
  const groupMap = new Map<string, CustomerPriceGroup>();

  (records ?? []).forEach((record) => {
    const candidate = record as any;

    if (Array.isArray(candidate?.prices)) {
      const customerName = normalizeSpaces(candidate.customerName || "");
      if (!customerName) return;

      const group = {
        id: candidate.id || crypto.randomUUID(),
        customerName,
        prices: (candidate.prices as any[])
          .map((price) => ({
            id: price?.id || crypto.randomUUID(),
            modelCode: normalizeSpaces(price?.modelCode || ""),
            unitPrice: normalizeSpaces(price?.unitPrice || ""),
            updatedAt: price?.updatedAt || nowText()
          }))
          .filter((price) => price.modelCode),
        updatedAt: candidate.updatedAt || nowText()
      } satisfies CustomerPriceGroup;

      if (group.prices.length > 0) {
        groupMap.set(group.id, group);
      }
      return;
    }

    const customerName = normalizeSpaces(candidate?.customerName || "");
    const modelCode =
      normalizeSpaces(candidate?.modelCode || "") ||
      extractModelCode(candidate?.rawModel || candidate?.priceKey || "");

    if (!customerName || !modelCode) return;

    const groupKey = normalizeText(customerName);
    const currentGroup: CustomerPriceGroup =
      groupMap.get(groupKey) ?? {
        id: crypto.randomUUID(),
        customerName,
        prices: [],
        updatedAt: candidate?.updatedAt || nowText()
      };

    currentGroup.prices.push({
      id: crypto.randomUUID(),
      modelCode,
      unitPrice: normalizeSpaces(candidate?.unitPrice || ""),
      updatedAt: candidate?.updatedAt || nowText()
    });

    groupMap.set(groupKey, currentGroup);
  });

  return sortCustomerPriceGroups(Array.from(groupMap.values()));
}

function sanitizeDefaultPrices(records: unknown[] | undefined): DefaultPriceRecord[] {
  return sortDefaultPrices(
    (records ?? [])
      .map((record) => {
        const candidate = record as any;
        return {
          id: candidate?.id || crypto.randomUUID(),
          modelCode:
            normalizeSpaces(candidate?.modelCode || "") ||
            extractModelCode(candidate?.rawModel || candidate?.priceKey || ""),
          unitPrice: normalizeSpaces(candidate?.unitPrice || ""),
          updatedAt: candidate?.updatedAt || nowText()
        } satisfies DefaultPriceRecord;
      })
      .filter((record) => record.modelCode)
  );
}

export function sanitizeDatabase(candidate: Partial<LocalBusinessDatabase>) {
  const nextDatabase: LocalBusinessDatabase = {
    version: Number(candidate.version) || 2,
    lastUpdatedAt: candidate.lastUpdatedAt || nowText(),
    customers: sanitizeCustomers(candidate.customers),
    customerPrices: sanitizeCustomerPriceGroups(candidate.customerPrices as unknown[]),
    defaultPrices: sanitizeDefaultPrices(candidate.defaultPrices as unknown[])
  };

  return sortDatabase(nextDatabase);
}

export function loadBusinessDatabase() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) {
      return sanitizeDatabase(cloneSeedDatabase());
    }

    return sanitizeDatabase(JSON.parse(saved) as LocalBusinessDatabase);
  } catch {
    return sanitizeDatabase(cloneSeedDatabase());
  }
}

export function saveBusinessDatabase(database: LocalBusinessDatabase) {
  const nextDatabase = sanitizeDatabase({
    ...database,
    lastUpdatedAt: nowText()
  });

  localStorage.setItem(STORAGE_KEY, JSON.stringify(nextDatabase));
  return nextDatabase;
}

export function resetBusinessDatabase() {
  const nextDatabase = sanitizeDatabase(cloneSeedDatabase());
  localStorage.setItem(STORAGE_KEY, JSON.stringify(nextDatabase));
  return nextDatabase;
}

export function downloadBusinessDatabase(database: LocalBusinessDatabase) {
  const blob = new Blob([JSON.stringify(sortDatabase(database), null, 2)], {
    type: "application/json;charset=utf-8"
  });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `本地业务数据库-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(link.href), 0);
}

export function getPriceSourceLabel(source: PriceMatchResult["source"]) {
  if (source === "customer") return "客户价";
  if (source === "default") return "默认价";
  if (source === "manual") return "手动价";
  return "";
}

export function findCustomerRecord(database: LocalBusinessDatabase, customerName: string) {
  const normalizedName = normalizeText(customerName);
  return database.customers.find((item) => normalizeText(item.name) === normalizedName);
}

export function findCustomerByText(database: LocalBusinessDatabase, text: string) {
  const normalizedText = normalizeText(text);
  const sortedCustomers = [...database.customers].sort((left, right) => right.name.length - left.name.length);
  return sortedCustomers.find((item) => normalizedText.includes(normalizeText(item.name)));
}

function findCustomerPriceEntry(
  database: LocalBusinessDatabase,
  customerName: string,
  modelCode: string
) {
  const normalizedCustomer = normalizeText(customerName);
  const normalizedModelCode = normalizeModelCode(modelCode);

  const group = database.customerPrices.find(
    (item) => normalizeText(item.customerName) === normalizedCustomer
  );

  return group?.prices.find((item) => normalizeModelCode(item.modelCode) === normalizedModelCode);
}

function findDefaultPriceRecord(database: LocalBusinessDatabase, modelCode: string) {
  const normalizedModelCode = normalizeModelCode(modelCode);
  return database.defaultPrices.find((item) => normalizeModelCode(item.modelCode) === normalizedModelCode);
}

export function resolvePrice(
  database: LocalBusinessDatabase,
  customerName: string,
  modelCode: string
): PriceMatchResult {
  const safeModelCode = extractModelCode(modelCode);

  if (!safeModelCode) {
    return {
      source: "none",
      unitPrice: "",
      modelCode: ""
    };
  }

  if (customerName) {
    const customerPrice = findCustomerPriceEntry(database, customerName, safeModelCode);
    if (customerPrice?.unitPrice) {
      return {
        source: "customer",
        unitPrice: customerPrice.unitPrice,
        modelCode: safeModelCode
      };
    }
  }

  const defaultPrice = findDefaultPriceRecord(database, safeModelCode);
  if (defaultPrice?.unitPrice) {
    return {
      source: "default",
      unitPrice: defaultPrice.unitPrice,
      modelCode: safeModelCode
    };
  }

  return {
    source: "none",
    unitPrice: "",
    modelCode: safeModelCode
  };
}

export function enrichItemWithDatabase(
  item: OrderItem,
  customerName: string,
  database: LocalBusinessDatabase
) {
  const modelCode = extractModelCode(item.nameSpec || item.modelCode);
  const matchedPrice = resolvePrice(database, customerName, modelCode);
  const manualPrice = normalizeSpaces(item.unitPrice);
  const hasManualPrice = Boolean(manualPrice);

  const unitPrice =
    matchedPrice.source !== "none"
      ? matchedPrice.unitPrice
      : hasManualPrice
        ? manualPrice
        : "";
  const priceSource =
    matchedPrice.source !== "none"
      ? matchedPrice.source
      : hasManualPrice
        ? "manual"
        : "none";
  const amount = calculateAmount(item.quantity, unitPrice);

  return {
    ...item,
    modelCode,
    unitPrice,
    priceSource,
    amount,
    issues: {
      ...item.issues,
      unitPrice:
        modelCode && !unitPrice
          ? {
              level: "unmatched" as const,
              message: "未匹配到价格，请手动输入"
            }
          : undefined,
      amount: item.quantity.trim() && unitPrice ? undefined : item.issues.amount
    }
  } satisfies OrderItem;
}

export function applyCustomerProfile(form: OrderForm, database: LocalBusinessDatabase) {
  const customer = findCustomerRecord(database, form.customer);
  if (!customer) return form;

  return {
    ...form,
    phone: form.phone.trim() || customer.phone,
    address: form.address.trim() || customer.address,
    logistics: form.logistics.trim() || customer.defaultLogistics
  };
}

export function hydrateFormWithDatabase(form: OrderForm, database: LocalBusinessDatabase) {
  const customerFilledForm = applyCustomerProfile(form, database);
  const items = customerFilledForm.items.map((item) =>
    enrichItemWithDatabase(item, customerFilledForm.customer, database)
  );

  return {
    ...customerFilledForm,
    items,
    totalAmount: calculateTotalAmount(items)
  };
}

export function syncOrderToDatabase(
  form: OrderForm,
  database: LocalBusinessDatabase
): DatabaseSyncResult {
  const customerName = normalizeSpaces(form.customer);
  if (!customerName) {
    return {
      database,
      changed: false,
      summary: "未写回数据库：客户名为空。"
    };
  }

  const nextDatabase = sanitizeDatabase({
    ...database,
    customers: JSON.parse(JSON.stringify(database.customers)),
    customerPrices: JSON.parse(JSON.stringify(database.customerPrices)),
    defaultPrices: JSON.parse(JSON.stringify(database.defaultPrices))
  });
  const changes: string[] = [];
  const now = nowText();

  const customer = findCustomerRecord(nextDatabase, customerName);
  if (!customer) {
    nextDatabase.customers.push({
      id: crypto.randomUUID(),
      name: customerName,
      phone: normalizeSpaces(form.phone),
      address: normalizeSpaces(form.address),
      defaultLogistics: normalizeSpaces(form.logistics),
      note: "",
      createdAt: now,
      updatedAt: now,
      createdByName: "本地流程",
      updatedByName: "本地流程"
    });
    changes.push(`新增客户「${customerName}」`);
  } else {
    const updatedCustomer = {
      ...customer,
      phone: customer.phone || normalizeSpaces(form.phone),
      address: customer.address || normalizeSpaces(form.address),
      defaultLogistics: customer.defaultLogistics || normalizeSpaces(form.logistics),
      updatedAt: now,
      updatedByName: "本地流程"
    };

    if (
      updatedCustomer.phone !== customer.phone ||
      updatedCustomer.address !== customer.address ||
      updatedCustomer.defaultLogistics !== customer.defaultLogistics
    ) {
      nextDatabase.customers = nextDatabase.customers.map((item) =>
        item.id === customer.id ? updatedCustomer : item
      );
      changes.push(`补全客户资料「${customerName}」`);
    }
  }

  form.items.forEach((item) => {
    const modelCode = item.modelCode || extractModelCode(item.nameSpec);
    const manualPrice = normalizeSpaces(item.unitPrice);

    if (!modelCode || !manualPrice || item.priceSource !== "manual") {
      return;
    }

    let group = nextDatabase.customerPrices.find(
      (entry) => normalizeText(entry.customerName) === normalizeText(customerName)
    );

    if (!group) {
      group = {
        id: crypto.randomUUID(),
        customerName,
        prices: [],
        updatedAt: now
      };
      nextDatabase.customerPrices.push(group);
      changes.push(`新增客户价格组「${customerName}」`);
    }

    const existingEntry = group.prices.find(
      (entry) => normalizeModelCode(entry.modelCode) === normalizeModelCode(modelCode)
    );

    if (existingEntry) {
      return;
    }

    group.prices.push({
      id: crypto.randomUUID(),
      modelCode,
      unitPrice: manualPrice,
      updatedAt: now
    });
    group.updatedAt = now;
    changes.push(`新增客户专属价「${customerName} / ${modelCode}」`);
  });

  if (changes.length === 0) {
    return {
      database,
      changed: false,
      summary: "本次没有新的数据库变更。"
    };
  }

  const savedDatabase = sortDatabase({
    ...nextDatabase,
    lastUpdatedAt: now
  });

  return {
    database: savedDatabase,
    changed: true,
    summary: `已写回数据库：${changes.join("；")}。`
  };
}



