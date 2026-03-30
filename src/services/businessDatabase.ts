import { findCustomerRecord, loadBusinessDatabase, saveBusinessDatabase } from "../localDb";
import { CustomerRecord, LocalBusinessDatabase, OrderForm } from "../types";
import {
  createCustomer,
  deleteCustomerById,
  importCustomers,
  listCustomers,
  updateCustomer
} from "./customers";
import { listCustomerPriceGroups, listDefaultPrices } from "./priceTables";

export type CustomerHydrationResult = {
  database: LocalBusinessDatabase;
  source: "local" | "supabase";
  usedLocalFallback: boolean;
};

function cloneDatabase(database: LocalBusinessDatabase) {
  return JSON.parse(JSON.stringify(database)) as LocalBusinessDatabase;
}

function normalizeText(value: string | undefined) {
  return (value ?? "").trim();
}

function normalizeCustomerKey(value: string | undefined) {
  return normalizeText(value).toUpperCase();
}

function mergeCloudTables(
  database: LocalBusinessDatabase,
  tables: Pick<LocalBusinessDatabase, "customers" | "customerPrices" | "defaultPrices">
) {
  return {
    ...database,
    customers: tables.customers,
    customerPrices: tables.customerPrices,
    defaultPrices: tables.defaultPrices
  };
}

function hasCustomerChanged(left: CustomerRecord, right: CustomerRecord) {
  return (
    normalizeText(left.name) !== normalizeText(right.name) ||
    normalizeText(left.phone) !== normalizeText(right.phone) ||
    normalizeText(left.address) !== normalizeText(right.address) ||
    normalizeText(left.defaultLogistics) !== normalizeText(right.defaultLogistics) ||
    normalizeText(left.note) !== normalizeText(right.note)
  );
}

export async function loadDatabaseWithCloudCustomers(baseDatabase?: LocalBusinessDatabase): Promise<CustomerHydrationResult> {
  const localDatabase = cloneDatabase(baseDatabase ?? loadBusinessDatabase());

  try {
    const [cloudCustomers, cloudCustomerPrices, cloudDefaultPrices] = await Promise.all([
      listCustomers(),
      listCustomerPriceGroups(),
      listDefaultPrices()
    ]);

    if (cloudCustomers.length === 0 && localDatabase.customers.length > 0) {
      return {
        database: localDatabase,
        source: "local",
        usedLocalFallback: true
      };
    }

    return {
      database: mergeCloudTables(localDatabase, {
        customers: cloudCustomers,
        customerPrices: cloudCustomerPrices,
        defaultPrices: cloudDefaultPrices
      }),
      source: "supabase",
      usedLocalFallback: false
    };
  } catch {
    return {
      database: localDatabase,
      source: "local",
      usedLocalFallback: false
    };
  }
}

export async function importLocalCustomersToCloud(localDatabase: LocalBusinessDatabase) {
  const cloudCustomers = await importCustomers(localDatabase.customers);
  const nextDatabase = saveBusinessDatabase({
    ...localDatabase,
    customers: cloudCustomers
  });

  return {
    database: nextDatabase,
    customers: cloudCustomers
  };
}

export async function syncCustomerDraftChanges(
  savedDatabase: LocalBusinessDatabase,
  draftDatabase: LocalBusinessDatabase
) {
  const savedMap = new Map(savedDatabase.customers.map((customer) => [customer.id, customer]));
  const draftMap = new Map(draftDatabase.customers.map((customer) => [customer.id, customer]));

  for (const [customerId] of savedMap) {
    if (!draftMap.has(customerId)) {
      await deleteCustomerById(customerId);
    }
  }

  for (const [customerId, draftCustomer] of draftMap) {
    const savedCustomer = savedMap.get(customerId);

    if (!savedCustomer) {
      await createCustomer(draftCustomer);
      continue;
    }

    if (hasCustomerChanged(savedCustomer, draftCustomer)) {
      await updateCustomer(draftCustomer);
    }
  }

  const nextCustomers = await listCustomers();
  const nextDatabase = saveBusinessDatabase({
    ...draftDatabase,
    customers: nextCustomers
  });

  return {
    database: nextDatabase,
    customers: nextCustomers
  };
}

export async function syncOrderCustomerToCloud(
  database: LocalBusinessDatabase,
  form: OrderForm,
  options?: { overwriteExisting?: boolean }
) {
  const customerName = normalizeText(form.customer);
  if (!customerName) {
    return {
      database,
      source: "local" as const,
      changed: false
    };
  }

  const localCustomer = findCustomerRecord(database, customerName);
  const cloudCustomers = await listCustomers();
  const existingCloudCustomer =
    cloudCustomers.find((customer) => localCustomer?.id && customer.id === localCustomer.id) ||
    cloudCustomers.find((customer) => normalizeCustomerKey(customer.name) === normalizeCustomerKey(customerName));

  const shouldOverwriteExisting = options?.overwriteExisting ?? false;
  const nextCustomer: CustomerRecord = existingCloudCustomer
    ? {
        ...existingCloudCustomer,
        phone: shouldOverwriteExisting
          ? normalizeText(form.phone) || normalizeText(existingCloudCustomer.phone)
          : normalizeText(existingCloudCustomer.phone) || normalizeText(form.phone),
        address: shouldOverwriteExisting
          ? normalizeText(form.address) || normalizeText(existingCloudCustomer.address)
          : normalizeText(existingCloudCustomer.address) || normalizeText(form.address),
        defaultLogistics: shouldOverwriteExisting
          ? normalizeText(form.logistics) || normalizeText(existingCloudCustomer.defaultLogistics)
          : normalizeText(existingCloudCustomer.defaultLogistics) || normalizeText(form.logistics),
        note: normalizeText(existingCloudCustomer.note)
      }
    : {
        id: crypto.randomUUID(),
        name: customerName,
        phone: normalizeText(form.phone),
        address: normalizeText(form.address),
        defaultLogistics: normalizeText(form.logistics),
        note: "",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

  if (existingCloudCustomer) {
    await updateCustomer(nextCustomer);
  } else {
    await createCustomer(nextCustomer);
  }

  const [nextCustomers, nextCustomerPrices, nextDefaultPrices] = await Promise.all([
    listCustomers(),
    listCustomerPriceGroups(),
    listDefaultPrices()
  ]);
  const nextDatabase = saveBusinessDatabase(
    mergeCloudTables(database, {
      customers: nextCustomers,
      customerPrices: nextCustomerPrices,
      defaultPrices: nextDefaultPrices
    })
  );

  return {
    database: nextDatabase,
    source: "supabase" as const,
    changed: true
  };
}
