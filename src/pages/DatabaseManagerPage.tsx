import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { includesKeyword } from "../components/HighlightedText";
import { TopBar } from "../components/TopBar";
import { loadBusinessDatabase } from "../localDb";
import { formatHistoryTime } from "../historyStore";
import { importLocalCustomersToCloud } from "../services/businessDatabase";
import {
  createCustomer,
  deleteCustomerById,
  listCustomerPage,
  updateCustomer
} from "../services/customers";
import {
  createDefaultPrice,
  deleteDefaultPriceById,
  findCustomerPriceGroupByCustomerName,
  listDefaultPricePage,
  saveCustomerPriceGroup,
  updateDefaultPrice
} from "../services/priceTables";
import {
  CustomerDataSource,
  CustomerPriceEntry,
  CustomerPriceGroup,
  CustomerRecord,
  DefaultPriceRecord,
  LocalBusinessDatabase
} from "../types";

type ActiveTable = "customers" | "customerPrices" | "defaultPrices";

type LocalPageResult<T> = {
  records: T[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

const PAGE_SIZE = 10;

const tableLabels: Record<ActiveTable, string> = {
  customers: "客户信息表",
  customerPrices: "客户专属价格表",
  defaultPrices: "默认单价表"
};

const searchPlaceholders: Record<ActiveTable, string> = {
  customers: "按客户名、电话或地址搜索",
  customerPrices: "先输入客户名，再查询该客户专属价格",
  defaultPrices: "按版号搜索"
};

const createCustomerRow = (): CustomerRecord => ({
  id: crypto.randomUUID(),
  name: "",
  phone: "",
  address: "",
  defaultLogistics: "",
  note: "",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
});

const createCustomerPriceEntry = (): CustomerPriceEntry => ({
  id: crypto.randomUUID(),
  modelCode: "",
  unitPrice: "",
  updatedAt: new Date().toISOString()
});

const createDefaultPriceRow = (): DefaultPriceRecord => ({
  id: crypto.randomUUID(),
  modelCode: "",
  unitPrice: "",
  updatedAt: new Date().toISOString()
});

const normalizeText = (value: string | undefined) => (value ?? "").trim();

function cloneRows<T>(rows: T[]) {
  return JSON.parse(JSON.stringify(rows)) as T[];
}

function cloneItem<T>(item: T) {
  return JSON.parse(JSON.stringify(item)) as T;
}

function paginateRows<T>(rows: T[], page: number, pageSize: number): LocalPageResult<T> {
  const safePageSize = Math.max(1, pageSize);
  const totalCount = rows.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / safePageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * safePageSize;

  return {
    records: rows.slice(start, start + safePageSize),
    totalCount,
    page: safePage,
    pageSize: safePageSize,
    totalPages
  };
}

function buildLocalCustomerPage(
  database: LocalBusinessDatabase,
  page: number,
  keyword: string
): LocalPageResult<CustomerRecord> {
  const filteredRows = normalizeText(keyword)
    ? database.customers.filter((row) =>
        includesKeyword([row.name, row.phone, row.address, row.note, row.defaultLogistics].join(" "), keyword)
      )
    : database.customers;

  const sortedRows = [...filteredRows].sort(
    (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
  );

  return paginateRows(sortedRows, page, PAGE_SIZE);
}

function buildLocalDefaultPricePage(
  database: LocalBusinessDatabase,
  page: number,
  keyword: string
): LocalPageResult<DefaultPriceRecord> {
  const filteredRows = normalizeText(keyword)
    ? database.defaultPrices.filter((row) => includesKeyword(row.modelCode, keyword))
    : database.defaultPrices;

  const sortedRows = [...filteredRows].sort(
    (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
  );

  return paginateRows(sortedRows, page, PAGE_SIZE);
}

function ensureEditableCustomerPriceGroup(group: CustomerPriceGroup) {
  return {
    ...group,
    prices: group.prices.length > 0 ? cloneRows(group.prices) : [createCustomerPriceEntry()]
  };
}

function validateCustomers(records: CustomerRecord[]) {
  const nameSet = new Set<string>();

  for (let index = 0; index < records.length; index += 1) {
    const customer = records[index];
    const name = normalizeText(customer.name);

    if (!name) {
      return `客户表第 ${index + 1} 行客户名不能为空。`;
    }

    const key = name.toUpperCase();
    if (nameSet.has(key)) {
      return `当前页里出现重名客户：${name}。请先合并后再保存。`;
    }

    nameSet.add(key);
  }

  return "";
}

function validateCustomerPriceGroup(group: CustomerPriceGroup | null) {
  if (!group) {
    return "请先搜索客户，再编辑专属价格。";
  }

  const modelSet = new Set<string>();

  for (let index = 0; index < group.prices.length; index += 1) {
    const modelCode = normalizeText(group.prices[index].modelCode);
    if (!modelCode) continue;

    const modelKey = modelCode.toUpperCase();
    if (modelSet.has(modelKey)) {
      return `客户「${group.customerName}」的专属价格里有重复版号：${modelCode}。`;
    }

    modelSet.add(modelKey);
  }

  return "";
}

function validateDefaultPrices(records: DefaultPriceRecord[]) {
  const modelSet = new Set<string>();

  for (let index = 0; index < records.length; index += 1) {
    const modelCode = normalizeText(records[index].modelCode);
    if (!modelCode) continue;

    const modelKey = modelCode.toUpperCase();
    if (modelSet.has(modelKey)) {
      return `默认单价表当前页有重复版号：${modelCode}。`;
    }

    modelSet.add(modelKey);
  }

  return "";
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

function hasDefaultPriceChanged(left: DefaultPriceRecord, right: DefaultPriceRecord) {
  return (
    normalizeText(left.modelCode) !== normalizeText(right.modelCode) ||
    normalizeText(left.unitPrice) !== normalizeText(right.unitPrice)
  );
}

function hasCustomerPriceGroupChanged(left: CustomerPriceGroup | null, right: CustomerPriceGroup | null) {
  return JSON.stringify(left) !== JSON.stringify(right);
}

function buildPageSummary(totalCount: number, page: number, totalPages: number) {
  return `共 ${totalCount} 条，第 ${page} / ${totalPages} 页`;
}

export function DatabaseManagerPage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const initialDatabase = useMemo<LocalBusinessDatabase>(() => loadBusinessDatabase(), []);
  const [activeTable, setActiveTable] = useState<ActiveTable>("customers");
  const [notice, setNotice] = useState("customers / 客户价 / 默认价现在都会同步到 Supabase。");
  const [customerSource, setCustomerSource] = useState<CustomerDataSource>("local");
  const [isSaving, setIsSaving] = useState(false);
  const [isImportingCustomers, setIsImportingCustomers] = useState(false);
  const [isLoadingCustomers, setIsLoadingCustomers] = useState(true);
  const [isLoadingDefaultPrices, setIsLoadingDefaultPrices] = useState(true);
  const [isLoadingCustomerPriceGroup, setIsLoadingCustomerPriceGroup] = useState(false);

  const [customerSearchKeyword, setCustomerSearchKeyword] = useState("");
  const [customerPage, setCustomerPage] = useState(1);
  const [customerTotalPages, setCustomerTotalPages] = useState(1);
  const [customerTotalCount, setCustomerTotalCount] = useState(0);
  const [savedCustomerRows, setSavedCustomerRows] = useState<CustomerRecord[]>([]);
  const [draftCustomerRows, setDraftCustomerRows] = useState<CustomerRecord[]>([]);

  const [customerPriceSearchName, setCustomerPriceSearchName] = useState("");
  const [savedCustomerPriceGroup, setSavedCustomerPriceGroup] = useState<CustomerPriceGroup | null>(null);
  const [draftCustomerPriceGroup, setDraftCustomerPriceGroup] = useState<CustomerPriceGroup | null>(null);

  const [defaultPriceSearchKeyword, setDefaultPriceSearchKeyword] = useState("");
  const [defaultPricePage, setDefaultPricePage] = useState(1);
  const [defaultPriceTotalPages, setDefaultPriceTotalPages] = useState(1);
  const [defaultPriceTotalCount, setDefaultPriceTotalCount] = useState(0);
  const [savedDefaultPriceRows, setSavedDefaultPriceRows] = useState<DefaultPriceRecord[]>([]);
  const [draftDefaultPriceRows, setDraftDefaultPriceRows] = useState<DefaultPriceRecord[]>([]);

  const hasCustomerChanges = useMemo(
    () => JSON.stringify(savedCustomerRows) !== JSON.stringify(draftCustomerRows),
    [draftCustomerRows, savedCustomerRows]
  );
  const hasCustomerPriceChanges = useMemo(
    () => hasCustomerPriceGroupChanged(savedCustomerPriceGroup, draftCustomerPriceGroup),
    [draftCustomerPriceGroup, savedCustomerPriceGroup]
  );
  const hasDefaultPriceChanges = useMemo(
    () => JSON.stringify(savedDefaultPriceRows) !== JSON.stringify(draftDefaultPriceRows),
    [draftDefaultPriceRows, savedDefaultPriceRows]
  );
  const hasUnsavedChanges = hasCustomerChanges || hasCustomerPriceChanges || hasDefaultPriceChanges;

  const activeSearchKeyword =
    activeTable === "customers"
      ? customerSearchKeyword
      : activeTable === "customerPrices"
        ? customerPriceSearchName
        : defaultPriceSearchKeyword;
  const activeTableLoading =
    activeTable === "customers"
      ? isLoadingCustomers
      : activeTable === "customerPrices"
        ? isLoadingCustomerPriceGroup
        : isLoadingDefaultPrices;

  useEffect(() => {
    let active = true;

    const loadCustomersPageData = async () => {
      setIsLoadingCustomers(true);

      try {
        const result = await listCustomerPage({
          page: customerPage,
          pageSize: PAGE_SIZE,
          keyword: customerSearchKeyword
        });
        if (!active) return;

        if (customerPage > result.totalPages && result.totalCount > 0) {
          setCustomerPage(result.totalPages);
          return;
        }

        setSavedCustomerRows(result.records);
        setDraftCustomerRows(cloneRows(result.records));
        setCustomerTotalPages(result.totalPages);
        setCustomerTotalCount(result.totalCount);
        setCustomerSource("supabase");
      } catch {
        if (!active) return;
        const fallbackPage = buildLocalCustomerPage(initialDatabase, customerPage, customerSearchKeyword);
        setSavedCustomerRows(fallbackPage.records);
        setDraftCustomerRows(cloneRows(fallbackPage.records));
        setCustomerTotalPages(fallbackPage.totalPages);
        setCustomerTotalCount(fallbackPage.totalCount);
        setCustomerSource("local");
        setNotice("当前 customers 暂时回退到本地数据，保存仍会优先尝试写 Supabase。请稍后再试云端连接。");
      } finally {
        if (active) {
          setIsLoadingCustomers(false);
        }
      }
    };

    void loadCustomersPageData();

    return () => {
      active = false;
    };
  }, [customerPage, customerSearchKeyword, initialDatabase]);

  useEffect(() => {
    let active = true;

    const loadDefaultPricePageData = async () => {
      setIsLoadingDefaultPrices(true);

      try {
        const result = await listDefaultPricePage({
          page: defaultPricePage,
          pageSize: PAGE_SIZE,
          keyword: defaultPriceSearchKeyword
        });
        if (!active) return;

        if (defaultPricePage > result.totalPages && result.totalCount > 0) {
          setDefaultPricePage(result.totalPages);
          return;
        }

        setSavedDefaultPriceRows(result.records);
        setDraftDefaultPriceRows(cloneRows(result.records));
        setDefaultPriceTotalPages(result.totalPages);
        setDefaultPriceTotalCount(result.totalCount);
      } catch {
        if (!active) return;
        const fallbackPage = buildLocalDefaultPricePage(initialDatabase, defaultPricePage, defaultPriceSearchKeyword);
        setSavedDefaultPriceRows(fallbackPage.records);
        setDraftDefaultPriceRows(cloneRows(fallbackPage.records));
        setDefaultPriceTotalPages(fallbackPage.totalPages);
        setDefaultPriceTotalCount(fallbackPage.totalCount);
        setNotice("当前默认单价表暂时回退到本地数据，保存仍会优先尝试写 Supabase。请稍后再试云端连接。");
      } finally {
        if (active) {
          setIsLoadingDefaultPrices(false);
        }
      }
    };

    void loadDefaultPricePageData();

    return () => {
      active = false;
    };
  }, [defaultPricePage, defaultPriceSearchKeyword, initialDatabase]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasUnsavedChanges) return;
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges]);

  const refreshCustomers = async (targetPage = customerPage, targetKeyword = customerSearchKeyword) => {
    const result = await listCustomerPage({ page: targetPage, pageSize: PAGE_SIZE, keyword: targetKeyword });
    setSavedCustomerRows(result.records);
    setDraftCustomerRows(cloneRows(result.records));
    setCustomerTotalPages(result.totalPages);
    setCustomerTotalCount(result.totalCount);
    setCustomerPage(result.page);
    setCustomerSource("supabase");
    return result;
  };

  const refreshDefaultPrices = async (
    targetPage = defaultPricePage,
    targetKeyword = defaultPriceSearchKeyword
  ) => {
    const result = await listDefaultPricePage({
      page: targetPage,
      pageSize: PAGE_SIZE,
      keyword: targetKeyword
    });
    setSavedDefaultPriceRows(result.records);
    setDraftDefaultPriceRows(cloneRows(result.records));
    setDefaultPriceTotalPages(result.totalPages);
    setDefaultPriceTotalCount(result.totalCount);
    setDefaultPricePage(result.page);
    return result;
  };

  const handleSaveCustomers = async () => {
    const customerError = validateCustomers(draftCustomerRows);
    if (customerError) {
      setNotice(customerError);
      return;
    }

    const confirmed = window.confirm("确认保存当前页客户信息吗？本页改动会同步到 Supabase。");
    if (!confirmed) return;

    const savedMap = new Map(savedCustomerRows.map((row) => [row.id, row]));
    const draftMap = new Map(draftCustomerRows.map((row) => [row.id, row]));

    setIsSaving(true);
    try {
      for (const [rowId] of savedMap) {
        if (!draftMap.has(rowId)) {
          await deleteCustomerById(rowId);
        }
      }

      for (const [rowId, draftRow] of draftMap) {
        const savedRow = savedMap.get(rowId);
        if (!savedRow) {
          await createCustomer(draftRow);
          continue;
        }

        if (hasCustomerChanged(savedRow, draftRow)) {
          await updateCustomer(draftRow);
        }
      }

      const refreshed = await refreshCustomers();
      setNotice(`客户信息表已同步到 Supabase。${buildPageSummary(refreshed.totalCount, refreshed.page, refreshed.totalPages)}`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "客户信息表保存失败，请稍后再试。");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveCustomerPriceGroup = async () => {
    const customerPriceError = validateCustomerPriceGroup(draftCustomerPriceGroup);
    if (customerPriceError) {
      setNotice(customerPriceError);
      return;
    }

    if (!draftCustomerPriceGroup) {
      setNotice("请先搜索客户，再编辑专属价格。");
      return;
    }

    const confirmed = window.confirm(`确认保存「${draftCustomerPriceGroup.customerName}」的专属价格吗？`);
    if (!confirmed) return;

    setIsSaving(true);
    try {
      const savedGroup = await saveCustomerPriceGroup(draftCustomerPriceGroup);
      const editableGroup = ensureEditableCustomerPriceGroup(savedGroup);
      setSavedCustomerPriceGroup(editableGroup);
      setDraftCustomerPriceGroup(cloneItem(editableGroup));
      setNotice(`客户「${editableGroup.customerName}」的专属价格已同步到 Supabase。`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "客户专属价格保存失败，请稍后再试。");
    } finally {
      setIsSaving(false);
    }
  };
  const handleSaveDefaultPrices = async () => {
    const defaultPriceError = validateDefaultPrices(draftDefaultPriceRows);
    if (defaultPriceError) {
      setNotice(defaultPriceError);
      return;
    }

    const confirmed = window.confirm("确认保存当前页默认单价吗？本页改动会同步到 Supabase。");
    if (!confirmed) return;

    const savedMap = new Map(savedDefaultPriceRows.map((row) => [row.id, row]));
    const nextRows = draftDefaultPriceRows.filter((row) => normalizeText(row.modelCode));
    const nextIds = new Set(nextRows.map((row) => row.id));

    setIsSaving(true);
    try {
      for (const savedRow of savedDefaultPriceRows) {
        if (!nextIds.has(savedRow.id)) {
          await deleteDefaultPriceById(savedRow.id);
        }
      }

      for (const draftRow of nextRows) {
        const savedRow = savedMap.get(draftRow.id);
        if (!savedRow) {
          await createDefaultPrice(draftRow);
          continue;
        }

        if (hasDefaultPriceChanged(savedRow, draftRow)) {
          await updateDefaultPrice(draftRow);
        }
      }

      const refreshed = await refreshDefaultPrices();
      setNotice(`默认单价表已同步到 Supabase。${buildPageSummary(refreshed.totalCount, refreshed.page, refreshed.totalPages)}`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "默认单价表保存失败，请稍后再试。");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSave = async () => {
    if (activeTable === "customers") {
      await handleSaveCustomers();
      return;
    }

    if (activeTable === "customerPrices") {
      await handleSaveCustomerPriceGroup();
      return;
    }

    await handleSaveDefaultPrices();
  };

  const handleImportCustomers = async () => {
    const confirmed = window.confirm(
      "确认把当前本地 customers 导入 Supabase 吗？如果云端已经有同名客户，会按 id 或唯一名规则合并。"
    );
    if (!confirmed) return;

    try {
      setIsImportingCustomers(true);
      await importLocalCustomersToCloud(initialDatabase);
      await refreshCustomers(1, "");
      setCustomerSearchKeyword("");
      setCustomerPage(1);
      setNotice("本地 customers 已导入 Supabase，后续多店员会看到同一套客户数据。");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "导入云端失败，请稍后再试。");
    } finally {
      setIsImportingCustomers(false);
    }
  };

  const handleBackToEditor = () => {
    if (hasUnsavedChanges) {
      const confirmed = window.confirm("当前还有未保存修改，确认离开数据库页吗？未保存内容会丢失。");
      if (!confirmed) return;
    }

    navigate("/", { state: { focusTop: true } });
  };

  const handleCustomerChange = (
    rowId: string,
    field: keyof Omit<
      CustomerRecord,
      "id" | "createdAt" | "updatedAt" | "createdBy" | "updatedBy" | "createdByName" | "updatedByName"
    >,
    value: string
  ) => {
    setDraftCustomerRows((current) =>
      current.map((row) =>
        row.id === rowId
          ? {
              ...row,
              [field]: value,
              updatedAt: new Date().toISOString()
            }
          : row
      )
    );
    setNotice("客户信息草稿已更新，记得保存当前页。");
  };

  const handleCustomerPriceEntryChange = (
    entryId: string,
    field: keyof Omit<CustomerPriceEntry, "id" | "updatedAt">,
    value: string
  ) => {
    setDraftCustomerPriceGroup((current) => {
      if (!current) return current;
      return {
        ...current,
        updatedAt: new Date().toISOString(),
        prices: current.prices.map((entry) =>
          entry.id === entryId
            ? {
                ...entry,
                [field]: value,
                updatedAt: new Date().toISOString()
              }
            : entry
        )
      };
    });
    setNotice("客户专属价格草稿已更新，记得保存这位客户的价格组。");
  };

  const handleDefaultPriceChange = (
    rowId: string,
    field: keyof Omit<DefaultPriceRecord, "id" | "updatedAt">,
    value: string
  ) => {
    setDraftDefaultPriceRows((current) =>
      current.map((row) =>
        row.id === rowId
          ? {
              ...row,
              [field]: value,
              updatedAt: new Date().toISOString()
            }
          : row
      )
    );
    setNotice("默认单价草稿已更新，记得保存当前页。");
  };

  const handleDeleteCustomer = (rowId: string) => {
    setDraftCustomerRows((current) => current.filter((row) => row.id !== rowId));
    setNotice("客户记录已从当前页草稿删除，记得保存。");
  };

  const handleDeleteCustomerPriceEntry = (entryId: string) => {
    setDraftCustomerPriceGroup((current) => {
      if (!current) return current;
      const remainingPrices = current.prices.filter((entry) => entry.id !== entryId);
      return {
        ...current,
        updatedAt: new Date().toISOString(),
        prices: remainingPrices.length > 0 ? remainingPrices : [createCustomerPriceEntry()]
      };
    });
    setNotice("客户专属价格行已删除，记得保存这位客户的价格组。");
  };

  const handleDeleteDefaultPrice = (rowId: string) => {
    setDraftDefaultPriceRows((current) => current.filter((row) => row.id !== rowId));
    setNotice("默认单价已从当前页草稿删除，记得保存。");
  };

  const handleAddCustomer = () => {
    setDraftCustomerRows((current) => [createCustomerRow(), ...current].slice(0, PAGE_SIZE));
    setNotice("已在当前页新增一行客户草稿。");
  };

  const handleAddCustomerPriceEntry = () => {
    setDraftCustomerPriceGroup((current) => {
      if (!current) return current;
      return {
        ...current,
        updatedAt: new Date().toISOString(),
        prices: [...current.prices, createCustomerPriceEntry()]
      };
    });
    setNotice("已为这位客户新增一行专属价格草稿。");
  };

  const handleClearCustomerPriceGroup = () => {
    setDraftCustomerPriceGroup((current) => {
      if (!current) return current;
      return {
        ...current,
        updatedAt: new Date().toISOString(),
        prices: [createCustomerPriceEntry()]
      };
    });
    setNotice("当前客户的专属价格草稿已清空，保存后会删除这位客户已有的专属价格。");
  };

  const handleAddDefaultPrice = () => {
    setDraftDefaultPriceRows((current) => [createDefaultPriceRow(), ...current].slice(0, PAGE_SIZE));
    setNotice("已在当前页新增一行默认单价草稿。");
  };

  const handleSearchCustomerPriceGroup = async () => {
    const customerName = normalizeText(customerPriceSearchName);
    if (!customerName) {
      setSavedCustomerPriceGroup(null);
      setDraftCustomerPriceGroup(null);
      setNotice("请先输入客户名，再查询专属价格。");
      return;
    }

    try {
      setIsLoadingCustomerPriceGroup(true);
      const matchedGroup = await findCustomerPriceGroupByCustomerName(customerName);

      if (matchedGroup) {
        const editableGroup = ensureEditableCustomerPriceGroup(matchedGroup);
        setSavedCustomerPriceGroup(editableGroup);
        setDraftCustomerPriceGroup(cloneItem(editableGroup));
        setNotice(
          matchedGroup.prices.length > 0
            ? `已读取客户「${editableGroup.customerName}」的全部专属价格。`
            : `已找到客户「${editableGroup.customerName}」，当前还没有专属价格，可直接新增。`
        );
        return;
      }

      const shouldCreate = window.confirm(`客户信息表里还没有「${customerName}」。是否先新增这个客户，再进入他的专属价格组？`);
      if (!shouldCreate) {
        setSavedCustomerPriceGroup(null);
        setDraftCustomerPriceGroup(null);
        setNotice(`未找到客户「${customerName}」，所以暂时没有加载专属价格。`);
        return;
      }

      const createdCustomer = await createCustomer({
        id: crypto.randomUUID(),
        name: customerName,
        phone: "",
        address: "",
        defaultLogistics: "",
        note: "",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      const newGroup = ensureEditableCustomerPriceGroup({
        id: createdCustomer.id,
        customerName: createdCustomer.name,
        prices: [],
        updatedAt: createdCustomer.updatedAt
      });
      setSavedCustomerPriceGroup(newGroup);
      setDraftCustomerPriceGroup(cloneItem(newGroup));
      setNotice(`已先新增客户「${createdCustomer.name}」，现在可以填写他的专属价格。`);
      void refreshCustomers(customerPage, customerSearchKeyword);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "客户专属价格读取失败，请稍后再试。");
    } finally {
      setIsLoadingCustomerPriceGroup(false);
    }
  };

  const handleClearCustomerPriceSearch = () => {
    setCustomerPriceSearchName("");
    setSavedCustomerPriceGroup(null);
    setDraftCustomerPriceGroup(null);
    setNotice("已清空客户专属价格查询结果。输入客户名后再查询。");
  };

  return (
    <main className="page-shell">
      <div className="page phone-frame phone-frame--database">
        <TopBar title="数据库管理" rightText="Phase 3 云端数据库" />

        <section className="hero-card">
          <div className="hero-card__heading hero-card__heading--stack">
            <div>
              <h2>共享业务数据库</h2>
              <p>当前 customers、客户专属价、默认单价都改为 Supabase 云端共享。数据库页现在按“当前页”或“当前客户价格组”保存。</p>
            </div>
            <div className="action-row action-row--tight">
              <button className="secondary-button btn-nav-back" type="button" onClick={handleBackToEditor}>
                返回编辑页
              </button>
              <button className="ghost-button btn-nav-history" type="button" onClick={() => navigate("/history")}>
                历史记录
              </button>
              <button className="ghost-button btn-nav-billing" type="button" onClick={() => navigate("/billing")}>
                账单
              </button>

            </div>
          </div>

          <div className="db-summary-grid">
            {(Object.keys(tableLabels) as ActiveTable[]).map((tableKey) => (
              <button
                key={tableKey}
                type="button"
                className={`db-summary-card ${activeTable === tableKey ? "db-summary-card--active" : ""}`}
                onClick={() => setActiveTable(tableKey)}
              >
                <span>{tableLabels[tableKey].replace("表", "")}</span>
                <em>{tableLabels[tableKey]}</em>
              </button>
            ))}
          </div>

          <div className="database-toolbar database-toolbar--search">
            <div className="database-toolbar__meta">
              <span className={hasUnsavedChanges ? "danger-chip" : "success-chip"}>
                {hasUnsavedChanges ? "有未保存修改" : "已保存"}
              </span>
              <span className={`database-source-pill ${customerSource === "local" ? "database-source-pill--local" : ""}`}>
                当前数据库：{customerSource === "supabase" ? "Supabase 云端" : "本地回退"}
              </span>
              {activeTableLoading ? <span className="ghost-chip">正在加载当前表...</span> : null}
            </div>

            <div className="database-toolbar__search-box">
              <input
                className="field-input database-search-input"
                placeholder={searchPlaceholders[activeTable]}
                value={activeSearchKeyword}
                onChange={(event) => {
                  const value = event.target.value;
                  if (activeTable === "customers") {
                    setCustomerSearchKeyword(value);
                    setCustomerPage(1);
                    return;
                  }

                  if (activeTable === "customerPrices") {
                    setCustomerPriceSearchName(value);
                    return;
                  }

                  setDefaultPriceSearchKeyword(value);
                  setDefaultPricePage(1);
                }}
                onKeyDown={(event) => {
                  if (activeTable === "customerPrices" && event.key === "Enter") {
                    event.preventDefault();
                    void handleSearchCustomerPriceGroup();
                  }
                }}
              />

              {activeTable === "customerPrices" ? (
                <div className="database-toolbar__search-actions">
                  <button
                    className="inline-button btn-action-soft"
                    type="button"
                    onClick={() => void handleSearchCustomerPriceGroup()}
                    disabled={isLoadingCustomerPriceGroup}
                  >
                    {isLoadingCustomerPriceGroup ? "查询中..." : "查询客户"}
                  </button>
                  <button className="ghost-button btn-utility" type="button" onClick={handleClearCustomerPriceSearch}>
                    清空
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </section>

        <section className="editor-card database-card">
          {activeTable === "customers" ? (
            <>
              <div className="section-title-row">
                <div>
                  <h2>客户信息表</h2>
                  <p className="table-meta">当前每页 10 条，按最近修改时间优先显示。</p>
                </div>
                <div className="action-row action-row--tight">
                  {profile?.role === "admin" && customerSource === "local" ? (
                    <button
                      className="ghost-button btn-action-soft"
                      type="button"
                      onClick={handleImportCustomers}
                      disabled={isImportingCustomers}
                    >
                      {isImportingCustomers ? "导入中..." : "导入云端"}
                    </button>
                  ) : null}
                  <button className="inline-button btn-action-soft" type="button" onClick={handleAddCustomer}>
                    新增客户
                  </button>
                </div>
              </div>

              <div className="db-table-wrap">
                <table className="db-table">
                  <thead>
                    <tr>
                      <th>客户名</th>
                      <th>电话</th>
                      <th>地址</th>
                      <th>默认货运方式</th>
                      <th>备注</th>
                      <th>最后修改</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {draftCustomerRows.length === 0 ? (
                      <tr>
                        <td colSpan={7}>
                          <div className="database-empty-cell">当前页没有客户数据。</div>
                        </td>
                      </tr>
                    ) : null}

                    {draftCustomerRows.map((row) => (
                      <tr
                        key={row.id}
                        className={includesKeyword([row.name, row.phone, row.address, row.defaultLogistics, row.note].join(" "), customerSearchKeyword) ? "search-hit-row" : ""}
                      >
                        <td><input className={`db-table-input ${includesKeyword(row.name, customerSearchKeyword) ? "search-hit-input" : ""}`} value={row.name} onChange={(event) => handleCustomerChange(row.id, "name", event.target.value)} /></td>
                        <td><input className={`db-table-input ${includesKeyword(row.phone, customerSearchKeyword) ? "search-hit-input" : ""}`} value={row.phone} onChange={(event) => handleCustomerChange(row.id, "phone", event.target.value)} /></td>
                        <td><input className={`db-table-input ${includesKeyword(row.address, customerSearchKeyword) ? "search-hit-input" : ""}`} value={row.address} onChange={(event) => handleCustomerChange(row.id, "address", event.target.value)} /></td>
                        <td><input className={`db-table-input ${includesKeyword(row.defaultLogistics, customerSearchKeyword) ? "search-hit-input" : ""}`} value={row.defaultLogistics} onChange={(event) => handleCustomerChange(row.id, "defaultLogistics", event.target.value)} /></td>
                        <td><input className={`db-table-input ${includesKeyword(row.note, customerSearchKeyword) ? "search-hit-input" : ""}`} value={row.note} onChange={(event) => handleCustomerChange(row.id, "note", event.target.value)} /></td>
                        <td className="customer-meta">
                          <span className="customer-meta__time">{row.updatedAt ? formatHistoryTime(row.updatedAt) : "-"}</span>
                          <span className="customer-meta__user">{row.updatedByName || "-"}</span>
                        </td>
                        <td><button className="delete-button delete-button--table" type="button" onClick={() => handleDeleteCustomer(row.id)}>删除</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="database-pagination">
                <button className="ghost-button btn-utility" type="button" onClick={() => setCustomerPage((current) => Math.max(1, current - 1))} disabled={customerPage <= 1 || isLoadingCustomers}>
                  上一页
                </button>
                <span className="ghost-chip">{buildPageSummary(customerTotalCount, customerPage, customerTotalPages)}</span>
                <button className="ghost-button btn-utility" type="button" onClick={() => setCustomerPage((current) => Math.min(customerTotalPages, current + 1))} disabled={customerPage >= customerTotalPages || isLoadingCustomers}>
                  下一页
                </button>
              </div>
            </>
          ) : null}

          {activeTable === "customerPrices" ? (
            <>
              <div className="section-title-row">
                <div>
                  <h2>客户专属价格表</h2>
                  <p className="table-meta">默认不预加载。先搜索客户名，再读取这位客户的全部专属价格。</p>
                </div>
                {draftCustomerPriceGroup ? (
                  <div className="action-row action-row--tight">
                    <button className="inline-button btn-action-soft" type="button" onClick={handleAddCustomerPriceEntry}>
                      新增版号
                    </button>
                    <button className="ghost-button btn-danger-soft" type="button" onClick={handleClearCustomerPriceGroup}>
                      清空价格组
                    </button>
                  </div>
                ) : null}
              </div>

              {!draftCustomerPriceGroup ? (
                <div className="empty-card history-empty-card database-empty-card">
                  <h2>先搜索客户</h2>
                  <p>输入客户名后点击“查询客户”，再编辑这位客户的全部专属价格。</p>
                </div>
              ) : (
                <div className="price-group-list">
                  <div className="price-group-card" key={draftCustomerPriceGroup.id}>
                    <div className="price-group-card__head">
                      <input className="field-input price-group-card__customer" value={draftCustomerPriceGroup.customerName} readOnly />
                      <div className="price-group-card__actions">
                        <span className="table-badge">已加载该客户全部专属价格</span>
                      </div>
                    </div>

                    <div className="db-table-wrap">
                      <table className="db-table db-table--compact">
                        <thead>
                          <tr>
                            <th>版号</th>
                            <th>单价</th>
                            <th>操作</th>
                          </tr>
                        </thead>
                        <tbody>
                          {draftCustomerPriceGroup.prices.map((entry) => (
                            <tr key={entry.id}>
                              <td><input className="db-table-input" value={entry.modelCode} onChange={(event) => handleCustomerPriceEntryChange(entry.id, "modelCode", event.target.value)} /></td>
                              <td><input className="db-table-input" inputMode="decimal" value={entry.unitPrice} onChange={(event) => handleCustomerPriceEntryChange(entry.id, "unitPrice", event.target.value)} /></td>
                              <td><button className="delete-button delete-button--table" type="button" onClick={() => handleDeleteCustomerPriceEntry(entry.id)}>删除</button></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : null}

          {activeTable === "defaultPrices" ? (
            <>
              <div className="section-title-row">
                <div>
                  <h2>默认单价表</h2>
                  <p className="table-meta">当前每页 10 条，按最近更新时间优先显示，不再按版号数字顺序自动排序。</p>
                </div>
                <button className="inline-button btn-action-soft" type="button" onClick={handleAddDefaultPrice}>
                  新增默认价
                </button>
              </div>

              <div className="db-table-wrap">
                <table className="db-table">
                  <thead>
                    <tr>
                      <th>版号</th>
                      <th>默认单价</th>
                      <th>最后修改</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {draftDefaultPriceRows.length === 0 ? (
                      <tr>
                        <td colSpan={4}>
                          <div className="database-empty-cell">当前页没有默认单价数据。</div>
                        </td>
                      </tr>
                    ) : null}

                    {draftDefaultPriceRows.map((row) => (
                      <tr key={row.id} className={includesKeyword([row.modelCode, row.unitPrice].join(" "), defaultPriceSearchKeyword) ? "search-hit-row" : ""}>
                        <td><input className={`db-table-input ${includesKeyword(row.modelCode, defaultPriceSearchKeyword) ? "search-hit-input" : ""}`} value={row.modelCode} onChange={(event) => handleDefaultPriceChange(row.id, "modelCode", event.target.value)} /></td>
                        <td><input className={`db-table-input ${includesKeyword(row.unitPrice, defaultPriceSearchKeyword) ? "search-hit-input" : ""}`} inputMode="decimal" value={row.unitPrice} onChange={(event) => handleDefaultPriceChange(row.id, "unitPrice", event.target.value)} /></td>
                        <td className="customer-meta">
                          <span className="customer-meta__time">{row.updatedAt ? formatHistoryTime(row.updatedAt) : "-"}</span>
                        </td>
                        <td><button className="delete-button delete-button--table" type="button" onClick={() => handleDeleteDefaultPrice(row.id)}>删除</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="database-pagination">
                <button className="ghost-button btn-utility" type="button" onClick={() => setDefaultPricePage((current) => Math.max(1, current - 1))} disabled={defaultPricePage <= 1 || isLoadingDefaultPrices}>
                  上一页
                </button>
                <span className="ghost-chip">{buildPageSummary(defaultPriceTotalCount, defaultPricePage, defaultPriceTotalPages)}</span>
                <button className="ghost-button btn-utility" type="button" onClick={() => setDefaultPricePage((current) => Math.min(defaultPriceTotalPages, current + 1))} disabled={defaultPricePage >= defaultPriceTotalPages || isLoadingDefaultPrices}>
                  下一页
                </button>
              </div>
            </>
          ) : null}
        </section>

        <div className="bottom-bar bottom-bar--database">
          <div className="bottom-bar__hint">{notice}</div>
          <div className="database-bottom-actions">
            <button className="ghost-button btn-nav-back" type="button" onClick={handleBackToEditor}>
              返回编辑页
            </button>
            <button className="primary-button btn-action-primary database-save-button" type="button" onClick={() => void handleSave()} disabled={isSaving || activeTableLoading}>
              {isSaving ? "保存中..." : activeTable === "customerPrices" ? "保存这位客户的价格组" : "保存当前页改动"}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}



