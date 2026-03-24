import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import seedDatabase from "../data/localDbSeed.json";
import { TopBar } from "../components/TopBar";
import {
  compareModelCode,
  downloadBusinessDatabase,
  loadBusinessDatabase,
  sanitizeDatabase,
  saveBusinessDatabase,
  sortDatabase
} from "../localDb";
import {
  CustomerPriceEntry,
  CustomerPriceGroup,
  CustomerRecord,
  DefaultPriceRecord,
  LocalBusinessDatabase
} from "../types";

type ActiveTable = "customers" | "customerPrices" | "defaultPrices";

const tableLabels: Record<ActiveTable, string> = {
  customers: "客户信息表",
  customerPrices: "客户专属价格表",
  defaultPrices: "默认单价表"
};

const countLabels: Record<ActiveTable, string> = {
  customers: "客户",
  customerPrices: "客户价组",
  defaultPrices: "默认价"
};

const searchPlaceholders: Record<ActiveTable, string> = {
  customers: "按客户名搜索",
  customerPrices: "按客户名或版号搜索",
  defaultPrices: "按版号搜索"
};

const createCustomerRow = (): CustomerRecord => ({
  id: crypto.randomUUID(),
  name: "",
  phone: "",
  address: "",
  defaultLogistics: "",
  note: "",
  updatedAt: new Date().toISOString()
});

const createCustomerPriceEntry = (): CustomerPriceEntry => ({
  id: crypto.randomUUID(),
  modelCode: "",
  unitPrice: "",
  updatedAt: new Date().toISOString()
});

const createCustomerPriceGroup = (): CustomerPriceGroup => ({
  id: crypto.randomUUID(),
  customerName: "",
  prices: [createCustomerPriceEntry()],
  updatedAt: new Date().toISOString()
});

const createDefaultPriceRow = (): DefaultPriceRecord => ({
  id: crypto.randomUUID(),
  modelCode: "",
  unitPrice: "",
  updatedAt: new Date().toISOString()
});

const cloneDatabase = (database: LocalBusinessDatabase) =>
  JSON.parse(JSON.stringify(database)) as LocalBusinessDatabase;

export function DatabaseManagerPage() {
  const navigate = useNavigate();
  const initialDatabase = useMemo<LocalBusinessDatabase>(() => loadBusinessDatabase(), []);
  const [savedDatabase, setSavedDatabase] = useState(initialDatabase);
  const [draftDatabase, setDraftDatabase] = useState(initialDatabase);
  const [activeTable, setActiveTable] = useState<ActiveTable>("customers");
  const [searchKeyword, setSearchKeyword] = useState("");
  const [notice, setNotice] = useState(
    "这里展示的是本地业务数据库，页面内修改先保留为草稿，点击保存后才会写入当前设备。"
  );

  const viewDatabase = useMemo(() => sortDatabase(draftDatabase), [draftDatabase]);
  const hasUnsavedChanges = useMemo(
    () => JSON.stringify(sortDatabase(savedDatabase)) !== JSON.stringify(sortDatabase(draftDatabase)),
    [draftDatabase, savedDatabase]
  );

  const counts = useMemo(
    () => ({
      customers: viewDatabase.customers.length,
      customerPrices: viewDatabase.customerPrices.length,
      defaultPrices: viewDatabase.defaultPrices.length
    }),
    [viewDatabase]
  );

  const normalizedKeyword = searchKeyword.trim().toUpperCase();

  const filteredCustomers = useMemo(() => {
    if (!normalizedKeyword) return viewDatabase.customers;
    return viewDatabase.customers.filter((row) => row.name.toUpperCase().includes(normalizedKeyword));
  }, [normalizedKeyword, viewDatabase.customers]);

  const filteredCustomerPriceGroups = useMemo(() => {
    if (!normalizedKeyword) return viewDatabase.customerPrices;

    return viewDatabase.customerPrices.filter((group) => {
      if (group.customerName.toUpperCase().includes(normalizedKeyword)) return true;
      return group.prices.some((entry) => entry.modelCode.toUpperCase().includes(normalizedKeyword));
    });
  }, [normalizedKeyword, viewDatabase.customerPrices]);

  const filteredDefaultPrices = useMemo(() => {
    if (!normalizedKeyword) return viewDatabase.defaultPrices;
    return viewDatabase.defaultPrices.filter((row) => row.modelCode.toUpperCase().includes(normalizedKeyword));
  }, [normalizedKeyword, viewDatabase.defaultPrices]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasUnsavedChanges) return;
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges]);

  const updateDraftDatabase = (updater: (current: LocalBusinessDatabase) => LocalBusinessDatabase, message: string) => {
    setDraftDatabase((current) => updater(cloneDatabase(current)));
    setNotice(message);
  };

  const handleExport = () => {
    downloadBusinessDatabase(viewDatabase);
    setNotice("已导出当前草稿数据库 JSON。未保存的改动也会一起导出。");
  };

  const handleResetDraft = () => {
    const confirmed = window.confirm("确定恢复为内置示例数据吗？这只会重置当前页面草稿，仍需你点击保存后才会真正写入本地。");
    if (!confirmed) return;

    const nextDatabase = sanitizeDatabase(seedDatabase as LocalBusinessDatabase);
    setDraftDatabase(nextDatabase);
    setNotice("已恢复为内置示例库草稿，记得点击保存。");
  };

  const handleSave = () => {
    if (!hasUnsavedChanges) {
      setNotice("当前没有未保存变更。");
      return;
    }

    const confirmed = window.confirm("确认保存当前数据库修改吗？保存后会覆盖当前设备里的本地数据库。");
    if (!confirmed) return;

    const nextDatabase = saveBusinessDatabase(viewDatabase);
    setSavedDatabase(nextDatabase);
    setDraftDatabase(nextDatabase);
    setNotice("数据库已保存到当前设备。");
  };

  const handleBackToEditor = () => {
    if (hasUnsavedChanges) {
      const confirmed = window.confirm("当前还有未保存修改，确认离开数据库页吗？未保存内容会丢失。");
      if (!confirmed) return;
    }

    navigate("/");
  };

  const handleCustomerChange = (
    rowId: string,
    field: keyof Omit<CustomerRecord, "id" | "updatedAt">,
    value: string
  ) => {
    updateDraftDatabase(
      (current) => ({
        ...current,
        customers: current.customers.map((row) =>
          row.id === rowId
            ? {
                ...row,
                [field]: value,
                updatedAt: new Date().toISOString()
              }
            : row
        )
      }),
      "客户信息草稿已更新，记得保存。"
    );
  };

  const handleCustomerGroupChange = (groupId: string, customerName: string) => {
    updateDraftDatabase(
      (current) => ({
        ...current,
        customerPrices: current.customerPrices.map((group) =>
          group.id === groupId
            ? {
                ...group,
                customerName,
                updatedAt: new Date().toISOString()
              }
            : group
        )
      }),
      "客户专属价格草稿已更新，记得保存。"
    );
  };

  const handleCustomerPriceEntryChange = (
    groupId: string,
    entryId: string,
    field: keyof Omit<CustomerPriceEntry, "id" | "updatedAt">,
    value: string
  ) => {
    updateDraftDatabase(
      (current) => ({
        ...current,
        customerPrices: current.customerPrices.map((group) =>
          group.id === groupId
            ? {
                ...group,
                updatedAt: new Date().toISOString(),
                prices: group.prices.map((entry) =>
                  entry.id === entryId
                    ? {
                        ...entry,
                        [field]: value,
                        updatedAt: new Date().toISOString()
                      }
                    : entry
                )
              }
            : group
        )
      }),
      "客户专属价格草稿已更新，记得保存。"
    );
  };

  const handleDefaultPriceChange = (
    rowId: string,
    field: keyof Omit<DefaultPriceRecord, "id" | "updatedAt">,
    value: string
  ) => {
    updateDraftDatabase(
      (current) => ({
        ...current,
        defaultPrices: current.defaultPrices.map((row) =>
          row.id === rowId
            ? {
                ...row,
                [field]: value,
                updatedAt: new Date().toISOString()
              }
            : row
        )
      }),
      "默认单价草稿已更新，记得保存。"
    );
  };

  const handleDeleteCustomer = (rowId: string) => {
    updateDraftDatabase(
      (current) => ({
        ...current,
        customers: current.customers.filter((row) => row.id !== rowId)
      }),
      "客户记录已从草稿删除，记得保存。"
    );
  };

  const handleDeleteCustomerGroup = (groupId: string) => {
    updateDraftDatabase(
      (current) => ({
        ...current,
        customerPrices: current.customerPrices.filter((group) => group.id !== groupId)
      }),
      "客户价格组已从草稿删除，记得保存。"
    );
  };

  const handleDeleteCustomerPriceEntry = (groupId: string, entryId: string) => {
    updateDraftDatabase(
      (current) => ({
        ...current,
        customerPrices: current.customerPrices.map((group) => {
          if (group.id !== groupId) return group;

          const remainingPrices = group.prices.filter((entry) => entry.id !== entryId);
          return {
            ...group,
            updatedAt: new Date().toISOString(),
            prices: remainingPrices.length > 0 ? remainingPrices : [createCustomerPriceEntry()]
          };
        })
      }),
      "客户专属价格行已从草稿删除，记得保存。"
    );
  };

  const handleDeleteDefaultPrice = (rowId: string) => {
    updateDraftDatabase(
      (current) => ({
        ...current,
        defaultPrices: current.defaultPrices.filter((row) => row.id !== rowId)
      }),
      "默认单价已从草稿删除，记得保存。"
    );
  };

  const handleAddCustomer = () => {
    updateDraftDatabase(
      (current) => ({
        ...current,
        customers: [createCustomerRow(), ...current.customers]
      }),
      "已新增一行客户草稿。"
    );
  };

  const handleAddCustomerGroup = () => {
    updateDraftDatabase(
      (current) => ({
        ...current,
        customerPrices: [createCustomerPriceGroup(), ...current.customerPrices]
      }),
      "已新增一个客户价格组草稿。"
    );
  };

  const handleAddCustomerPriceEntry = (groupId: string) => {
    updateDraftDatabase(
      (current) => ({
        ...current,
        customerPrices: current.customerPrices.map((group) =>
          group.id === groupId
            ? {
                ...group,
                updatedAt: new Date().toISOString(),
                prices: [...group.prices, createCustomerPriceEntry()]
              }
            : group
        )
      }),
      "已新增一行客户专属价格草稿。"
    );
  };

  const handleAddDefaultPrice = () => {
    updateDraftDatabase(
      (current) => ({
        ...current,
        defaultPrices: [createDefaultPriceRow(), ...current.defaultPrices]
      }),
      "已新增一行默认单价草稿。"
    );
  };

  return (
    <main className="page-shell">
      <div className="page phone-frame phone-frame--database">
        <TopBar title="数据库管理" rightText="Phase 2 本地库" />

        <section className="hero-card">
          <div className="hero-card__heading hero-card__heading--stack">
            <div>
              <h2>本地业务数据库</h2>
              <p>规则：客户专属单价 &gt; 默认单价表 &gt; 手动输入。型号统一按版号维护，例如 860-12 和 860-20 都归到 860。</p>
            </div>
            <div className="action-row action-row--tight">
              <button className="secondary-button btn-nav-back" type="button" onClick={handleBackToEditor}>
                返回编辑页
              </button>
              <button className="ghost-button btn-nav-history" type="button" onClick={() => navigate("/history")}>
                历史记录
              </button>
              <button className="ghost-button btn-utility" type="button" onClick={handleExport}>
                导出 JSON
              </button>
              <button className="ghost-button btn-danger-soft" type="button" onClick={handleResetDraft}>
                恢复示例库
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
                <strong>{counts[tableKey]}</strong>
                <span>{countLabels[tableKey]}</span>
                <em>{tableLabels[tableKey]}</em>
              </button>
            ))}
          </div>

          <div className="database-toolbar database-toolbar--search">
            <span className={hasUnsavedChanges ? "danger-chip" : "success-chip"}>
              {hasUnsavedChanges ? "有未保存修改" : "已保存"}
            </span>
            <input
              className="field-input database-search-input"
              placeholder={searchPlaceholders[activeTable]}
              value={searchKeyword}
              onChange={(event) => setSearchKeyword(event.target.value)}
            />
          </div>
        </section>

        <section className="editor-card database-card">
          {activeTable === "customers" ? (
            <>
              <div className="section-title-row">
                <h2>客户信息表</h2>
                <button className="inline-button btn-action-soft" type="button" onClick={handleAddCustomer}>
                  新增客户
                </button>
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
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCustomers.map((row) => (
                      <tr key={row.id}>
                        <td><input className="db-table-input" value={row.name} onChange={(event) => handleCustomerChange(row.id, "name", event.target.value)} /></td>
                        <td><input className="db-table-input" value={row.phone} onChange={(event) => handleCustomerChange(row.id, "phone", event.target.value)} /></td>
                        <td><input className="db-table-input" value={row.address} onChange={(event) => handleCustomerChange(row.id, "address", event.target.value)} /></td>
                        <td><input className="db-table-input" value={row.defaultLogistics} onChange={(event) => handleCustomerChange(row.id, "defaultLogistics", event.target.value)} /></td>
                        <td><input className="db-table-input" value={row.note} onChange={(event) => handleCustomerChange(row.id, "note", event.target.value)} /></td>
                        <td><button className="delete-button delete-button--table" type="button" onClick={() => handleDeleteCustomer(row.id)}>删除</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}

          {activeTable === "customerPrices" ? (
            <>
              <div className="section-title-row">
                <h2>客户专属价格表</h2>
                <button className="inline-button btn-action-soft" type="button" onClick={handleAddCustomerGroup}>
                  新增客户价格组
                </button>
              </div>

              <div className="price-group-list">
                {filteredCustomerPriceGroups.map((group) => {
                  const sortedPrices = [...group.prices].sort((left, right) => compareModelCode(left.modelCode, right.modelCode));

                  return (
                    <div className="price-group-card" key={group.id}>
                      <div className="price-group-card__head">
                        <input
                          className="field-input price-group-card__customer"
                          placeholder="客户名"
                          value={group.customerName}
                          onChange={(event) => handleCustomerGroupChange(group.id, event.target.value)}
                        />
                        <div className="price-group-card__actions">
                          <button className="inline-button btn-action-soft" type="button" onClick={() => handleAddCustomerPriceEntry(group.id)}>
                            新增版号
                          </button>
                          <button className="delete-button btn-danger-soft" type="button" onClick={() => handleDeleteCustomerGroup(group.id)}>
                            删除客户组
                          </button>
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
                            {sortedPrices.map((entry) => (
                              <tr key={entry.id}>
                                <td><input className="db-table-input" value={entry.modelCode} onChange={(event) => handleCustomerPriceEntryChange(group.id, entry.id, "modelCode", event.target.value)} /></td>
                                <td><input className="db-table-input" inputMode="decimal" value={entry.unitPrice} onChange={(event) => handleCustomerPriceEntryChange(group.id, entry.id, "unitPrice", event.target.value)} /></td>
                                <td><button className="delete-button delete-button--table" type="button" onClick={() => handleDeleteCustomerPriceEntry(group.id, entry.id)}>删除</button></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : null}

          {activeTable === "defaultPrices" ? (
            <>
              <div className="section-title-row">
                <h2>默认单价表</h2>
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
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDefaultPrices.map((row) => (
                      <tr key={row.id}>
                        <td><input className="db-table-input" value={row.modelCode} onChange={(event) => handleDefaultPriceChange(row.id, "modelCode", event.target.value)} /></td>
                        <td><input className="db-table-input" inputMode="decimal" value={row.unitPrice} onChange={(event) => handleDefaultPriceChange(row.id, "unitPrice", event.target.value)} /></td>
                        <td><button className="delete-button delete-button--table" type="button" onClick={() => handleDeleteDefaultPrice(row.id)}>删除</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
            <button className="primary-button btn-action-primary database-save-button" type="button" onClick={handleSave}>
              保存数据库
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}



