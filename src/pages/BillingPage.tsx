import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { TopBar } from "../components/TopBar";
import { buildDateSearchAliases, HighlightedText, includesKeyword } from "../components/HighlightedText";
import { formatHistoryDate, formatHistoryTime } from "../historyStore";
import {
  calculateBillingSummaries,
  createBillingEntry,
  deleteBillingEntryById,
  getBillingTypeLabel,
  listBillingEntries,
  updateBillingEntry
} from "../services/billingEntries";
import { BillingPaymentMethod, BillingRecord, BillingRecordType } from "../types";

const paymentMethods: BillingPaymentMethod[] = ["微信", "支付宝", "现金", "银行收款码", "其他"];

const toDateTimeLocalValue = (value: string) => {
  const date = value ? new Date(value) : new Date();
  const offset = date.getTimezoneOffset();
  const localDate = new Date(date.getTime() - offset * 60 * 1000);
  return localDate.toISOString().slice(0, 16);
};

const getDefaultDateTimeValue = () => toDateTimeLocalValue(new Date().toISOString());

const createDraftRecord = (type: BillingRecordType = "manual_payment") => ({
  customerName: "",
  type,
  dateTime: getDefaultDateTimeValue(),
  amount: "",
  note: "",
  paymentMethod: "" as BillingPaymentMethod | ""
});

const toIsoDateTime = (value: string) => {
  if (!value) return new Date().toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
};

const getSignedAmountText = (record: Pick<BillingRecord, "type" | "amount">) =>
  `${record.type === "manual_payment" ? "-" : "+"}${record.amount}`;

const buildBillingRecordSearchText = (record: BillingRecord) =>
  [
    record.customerName,
    record.amount,
    record.note,
    record.paymentMethod,
    buildDateSearchAliases(record.dateTime),
    getBillingTypeLabel(record.type),
    record.orderInfo?.rawInput,
    record.orderInfo?.customer,
    record.createdByName,
    record.updatedByName,
    record.orderInfo?.createdAtText ? buildDateSearchAliases(record.orderInfo.createdAtText) : ""
  ]
    .filter(Boolean)
    .join(" ")
    .toUpperCase();

export function BillingPage() {
  const navigate = useNavigate();
  const [records, setRecords] = useState<BillingRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [detailSearchKeyword, setDetailSearchKeyword] = useState("");
  const [activeCustomerName, setActiveCustomerName] = useState("");
  const [draftRecord, setDraftRecord] = useState(createDraftRecord("manual_payment"));
  const [isCreatingCustomer, setIsCreatingCustomer] = useState(false);
  const [notice, setNotice] = useState("这里显示的是 Supabase 云端账单，余额会根据共享流水自动重算。");

  const refreshRecords = async (message: string) => {
    const nextRecords = await listBillingEntries();
    setRecords(nextRecords);
    setNotice(message);
  };

  useEffect(() => {
    let active = true;

    const loadRecords = async () => {
      try {
        setIsLoading(true);
        const nextRecords = await listBillingEntries();
        if (!active) return;
        setRecords(nextRecords);
        setNotice("云端账单已加载完成，不同店员会看到同一套欠账流水。");
      } catch (error) {
        if (!active) return;
        setNotice(error instanceof Error ? error.message : "云端账单读取失败，请稍后再试。");
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    };

    void loadRecords();

    return () => {
      active = false;
    };
  }, []);

  const summaries = useMemo(() => calculateBillingSummaries(records), [records]);

  const filteredSummaries = useMemo(() => {
    if (!searchKeyword.trim()) return summaries;

    return summaries.filter((summary) => {
      const relatedRecords = records.filter((item) => item.customerName === summary.customerName);
      const summaryText = [summary.customerName, summary.currentBalance, summary.lastUpdatedAt, summary.lastRecordSummary]
        .filter(Boolean)
        .join(" ")
        .toUpperCase();

      if (includesKeyword(summaryText, searchKeyword)) return true;
      return relatedRecords.some((record) => includesKeyword(buildBillingRecordSearchText(record), searchKeyword));
    });
  }, [records, searchKeyword, summaries]);

  const activeSummary = useMemo(
    () => summaries.find((item) => item.customerName === activeCustomerName),
    [activeCustomerName, summaries]
  );

  const activeCustomerRecords = useMemo(() => {
    if (!activeCustomerName) return [];
    const customerRecords = records.filter((item) => item.customerName === activeCustomerName);
    if (!detailSearchKeyword.trim()) return customerRecords;
    return customerRecords.filter((record) => includesKeyword(buildBillingRecordSearchText(record), detailSearchKeyword));
  }, [activeCustomerName, detailSearchKeyword, records]);

  const showDetailPage = Boolean(activeSummary) || isCreatingCustomer;

  const handleSelectCustomer = (customerName: string) => {
    setActiveCustomerName(customerName);
    setIsCreatingCustomer(false);
    setDetailSearchKeyword("");
    setDraftRecord((current) => ({
      ...current,
      customerName,
      dateTime: getDefaultDateTimeValue()
    }));
    setNotice(`已进入 ${customerName} 的账单详情。`);
  };

  const handleDraftTypeSwitch = (type: BillingRecordType) => {
    if (isCreatingCustomer) return;
    setDraftRecord((current) => ({
      ...current,
      type,
      dateTime: getDefaultDateTimeValue(),
      paymentMethod: type === "manual_payment" ? current.paymentMethod : "",
      customerName: activeCustomerName || current.customerName
    }));
  };

  const handleCreateFirstBilling = () => {
    setIsCreatingCustomer(true);
    setActiveCustomerName("");
    setDetailSearchKeyword("");
    setDraftRecord(createDraftRecord("manual_add"));
    setNotice("请输入新客户名称并录入第一笔欠账。新增客户模式默认按 +记账 处理。");
  };

  const handleBackToOverview = () => {
    setActiveCustomerName("");
    setIsCreatingCustomer(false);
    setDetailSearchKeyword("");
    setDraftRecord(createDraftRecord("manual_payment"));
    setNotice("已返回欠账总览。可以继续搜索客户、日期或备注信息。");
  };

  const persistRecord = async (recordId: string) => {
    const record = records.find((item) => item.id === recordId);
    if (!record) return;

    if (!record.customerName.trim() || !record.amount.trim()) return;
    if (record.type === "manual_payment" && !record.paymentMethod) return;

    try {
      await updateBillingEntry(record.id, {
        id: record.id,
        customerName: record.customerName,
        customerId: record.customerId,
        type: record.type,
        dateTime: toIsoDateTime(record.dateTime),
        amount: record.amount,
        note: record.note,
        paymentMethod: record.paymentMethod,
        relatedOrderId: record.relatedOrderId
      });
      await refreshRecords(`已更新账单流水：${record.customerName}`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "账单更新失败，请稍后再试。");
    }
  };

  const handleDraftSubmit = async () => {
    const customerName = (activeCustomerName || draftRecord.customerName).trim();

    if (!customerName || !draftRecord.amount.trim()) {
      setNotice("请先填写客户名和金额。新增客户模式需要先输入客户名。");
      return;
    }

    if (draftRecord.type === "manual_payment" && !draftRecord.paymentMethod) {
      setNotice("已支付请先选择支付方式。");
      return;
    }

    try {
      await createBillingEntry({
        customerName,
        type: draftRecord.type,
        dateTime: toIsoDateTime(draftRecord.dateTime),
        amount: draftRecord.amount,
        note: draftRecord.note,
        paymentMethod: draftRecord.type === "manual_payment" ? draftRecord.paymentMethod : ""
      });

      setDraftRecord(createDraftRecord(isCreatingCustomer ? "manual_add" : draftRecord.type));
      setActiveCustomerName(customerName);
      setIsCreatingCustomer(false);
      setDetailSearchKeyword("");
      await refreshRecords(`已保存${draftRecord.type === "manual_payment" ? "已支付" : "记账"}流水。`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "账单保存失败，请稍后再试。");
    }
  };

  const handleRecordFieldChange = (recordId: string, field: keyof BillingRecord, value: string) => {
    setRecords((current) =>
      current.map((record) =>
        record.id === recordId
          ? {
              ...record,
              [field]: value
            }
          : record
      )
    );
  };

  const handleDeleteRecord = async (recordId: string) => {
    const confirmed = window.confirm("确认删除这条账单流水吗？删除后欠账会自动重算。");
    if (!confirmed) return;

    try {
      await deleteBillingEntryById(recordId);
      await refreshRecords("账单流水已删除，欠账已自动重算。");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "账单删除失败，请稍后再试。");
    }
  };

  const handleOpenRelatedHistory = (record: BillingRecord) => {
    if (!record.relatedOrderId) return;
    navigate("/history", { state: { activeRecordId: record.relatedOrderId } });
  };

  return (
    <main className="page-shell">
      <div className="page phone-frame phone-frame--database">
        <TopBar title="账单" rightText="云端账单" />

        <section className="hero-card">
          <div className="hero-card__heading hero-card__heading--stack">
            <div>
              <h2>{showDetailPage ? (isCreatingCustomer ? "新增客户第一笔欠账" : `${activeCustomerName} 账单详情`) : "客户欠账总览"}</h2>
              <p>
                {showDetailPage
                  ? isCreatingCustomer
                    ? "这里只保留 +记账，录完后会自动进入这位客户的账单详情。"
                    : "当前已进入客户详情页，可以继续录入、编辑或跳转对应历史记录。"
                  : "先看每个客户当前欠多少，再点进详情处理具体流水。"}
              </p>
            </div>
            <div className="action-row action-row--tight">
              {showDetailPage ? (
                <button className="secondary-button btn-nav-back" type="button" onClick={handleBackToOverview}>
                  返回总览
                </button>
              ) : (
                <button className="secondary-button btn-nav-back" type="button" onClick={() => navigate("/")}>
                  返回编辑页
                </button>
              )}
              <button className="ghost-button btn-nav-history" type="button" onClick={() => navigate("/history")}>
                历史记录
              </button>
              <button className="ghost-button btn-nav-database" type="button" onClick={() => navigate("/database")}>
                数据库管理
              </button>
            </div>
          </div>

          {!showDetailPage ? (
            <div className="database-toolbar database-toolbar--search">
              <span className="ghost-chip">客户 {filteredSummaries.length} 个</span>
              <input
                className="field-input database-search-input"
                placeholder="按客户、日期、备注搜索账单"
                value={searchKeyword}
                onChange={(event) => setSearchKeyword(event.target.value)}
              />
            </div>
          ) : null}
        </section>

        {!showDetailPage ? (
          <section className="editor-card database-card">
            <div className="section-title-row">
              <h2>欠账总览</h2>
              <div className="billing-overview-head-actions">
                <span className="ghost-chip">点击客户看详情</span>
                <button className="inline-button btn-action-primary billing-add-button" type="button" onClick={handleCreateFirstBilling}>
                  +
                </button>
              </div>
            </div>

            {isLoading ? (
              <div className="empty-card history-empty-card">
                <h2>正在读取云端账单</h2>
                <p>请稍等，系统正在加载全部店员共享的账单流水。</p>
              </div>
            ) : filteredSummaries.length === 0 ? (
              <div className="empty-card history-empty-card">
                <h2>暂无账单记录</h2>
                <p>云端账单现在还是空的，先点右上角 + 录入第一笔欠账。</p>
              </div>
            ) : (
              <div className="billing-overview-grid">
                {filteredSummaries.map((row) => (
                  <button
                    key={row.customerName}
                    type="button"
                    className={`billing-overview-card ${includesKeyword([row.customerName, row.currentBalance, row.lastUpdatedAt, row.lastRecordSummary].join(" "), searchKeyword) ? "search-hit-card" : ""}`}
                    onClick={() => handleSelectCustomer(row.customerName)}
                  >
                    <span><HighlightedText text={row.customerName} keyword={searchKeyword} /></span>
                    <strong>¥ <HighlightedText text={row.currentBalance} keyword={searchKeyword} /></strong>
                    <em><HighlightedText text={formatHistoryTime(row.lastUpdatedAt)} keyword={searchKeyword} /></em>
                  </button>
                ))}
              </div>
            )}
          </section>
        ) : (
          <section className="editor-card database-card">
            {activeSummary ? (
              <div className="billing-sticky-summary">
                <div>
                  <span>当前客户</span>
                  <strong>{activeSummary.customerName}</strong>
                </div>
                <div>
                  <span>当前欠账总额</span>
                  <em>¥ {activeSummary.currentBalance}</em>
                </div>
              </div>
            ) : null}

            {activeSummary ? (
              <div className="billing-detail-toolbar">
                <span className="ghost-chip">当前流水 {activeCustomerRecords.length} 条</span>
                <input
                  className="field-input database-search-input"
                  placeholder="按日期、备注、金额或支付方式搜索当前客户账单"
                  value={detailSearchKeyword}
                  onChange={(event) => setDetailSearchKeyword(event.target.value)}
                />
              </div>
            ) : null}

            <div className="section-title-row section-title-row--billing-form">
              <h3>{isCreatingCustomer ? "新增第一笔欠账" : "手动录入"}</h3>
              {isCreatingCustomer ? (
                <span className="table-badge billing-first-add-badge">+ 记账</span>
              ) : (
                <div className="billing-type-toggle">
                  <button
                    className={
                      draftRecord.type === "manual_payment"
                        ? "inline-button btn-nav-back billing-type-button"
                        : "ghost-button btn-utility billing-type-button"
                    }
                    type="button"
                    onClick={() => handleDraftTypeSwitch("manual_payment")}
                  >
                    <span aria-hidden="true">✓</span>
                    <span>已支付</span>
                  </button>
                  <button
                    className={
                      draftRecord.type === "manual_add"
                        ? "inline-button btn-action-primary billing-type-button"
                        : "ghost-button btn-utility billing-type-button"
                    }
                    type="button"
                    onClick={() => handleDraftTypeSwitch("manual_add")}
                  >
                    <span aria-hidden="true">＋</span>
                    <span>记账</span>
                  </button>
                </div>
              )}
            </div>

            <div className="field-grid billing-form-grid">
              {isCreatingCustomer ? (
                <label className="field-block field-block--full">
                  <span className="field-label">客户名</span>
                  <input
                    className="field-input"
                    placeholder="输入新客户名称"
                    value={draftRecord.customerName}
                    onChange={(event) => setDraftRecord((current) => ({ ...current, customerName: event.target.value }))}
                  />
                </label>
              ) : null}

              <label className="field-block">
                <span className="field-label">日期</span>
                <input
                  className="field-input"
                  type="datetime-local"
                  value={draftRecord.dateTime}
                  onChange={(event) => setDraftRecord((current) => ({ ...current, dateTime: event.target.value }))}
                />
              </label>

              <label className="field-block">
                <span className="field-label">金额</span>
                <div className="billing-amount-input-wrap">
                  <span
                    className={`billing-amount-prefix ${draftRecord.type === "manual_payment" ? "billing-amount-prefix--minus" : "billing-amount-prefix--plus"}`}
                  >
                    {draftRecord.type === "manual_payment" ? "-" : "+"}
                  </span>
                  <input
                    className="field-input billing-amount-input"
                    inputMode="decimal"
                    placeholder={draftRecord.type === "manual_payment" ? "输入已支付金额" : "输入记账金额"}
                    value={draftRecord.amount}
                    onChange={(event) => setDraftRecord((current) => ({ ...current, amount: event.target.value }))}
                  />
                </div>
              </label>

              {draftRecord.type === "manual_payment" ? (
                <label className="field-block">
                  <span className="field-label">支付方式</span>
                  <select
                    className="field-input field-select"
                    value={draftRecord.paymentMethod}
                    onChange={(event) =>
                      setDraftRecord((current) => ({
                        ...current,
                        paymentMethod: event.target.value as BillingPaymentMethod
                      }))
                    }
                  >
                    <option value="">请选择支付方式</option>
                    {paymentMethods.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              <label className="field-block field-block--full">
                <span className="field-label">备注（可选）</span>
                <input
                  className="field-input"
                  value={draftRecord.note}
                  onChange={(event) => setDraftRecord((current) => ({ ...current, note: event.target.value }))}
                />
              </label>
            </div>

            <div className="action-row action-row--tight">
              <button className="primary-button btn-action-primary" type="button" onClick={handleDraftSubmit}>
                {isCreatingCustomer ? "保存第一笔欠账" : "保存当前流水"}
              </button>
            </div>

            {activeSummary ? (
              <div className="billing-record-list">
                {activeCustomerRecords.length === 0 ? (
                  <div className="empty-card history-empty-card">
                    <h2>没有匹配到流水</h2>
                    <p>换一个日期、备注或金额关键词试试。</p>
                  </div>
                ) : null}

                {activeCustomerRecords.map((record) => {
                  const isPayment = record.type === "manual_payment";
                  const canJump = Boolean(record.relatedOrderId);

                  return (
                    <article
                      key={record.id}
                      className={`billing-record-card ${canJump ? "billing-record-card--linked" : ""} ${includesKeyword(buildBillingRecordSearchText(record), detailSearchKeyword) ? "search-hit-card" : ""}`}
                    >
                      <div className="billing-record-card__head">
                        <div className="billing-record-card__headline">
                          <span className={`table-badge ${isPayment ? "billing-record-badge--minus" : "billing-record-badge--plus"}`}>
                            <HighlightedText text={getBillingTypeLabel(record.type)} keyword={detailSearchKeyword} />
                          </span>
                          <span
                            className={`billing-record-card__signed ${isPayment ? "billing-record-card__signed--minus" : "billing-record-card__signed--plus"}`}
                          >
                            <HighlightedText text={getSignedAmountText(record)} keyword={detailSearchKeyword} />
                          </span>
                        </div>
                        <span className="billing-record-card__time"><HighlightedText text={formatHistoryDate(record.dateTime)} keyword={detailSearchKeyword} /> <span className="billing-time-tail">{formatHistoryTime(record.dateTime).split(" ")[1] || ""}</span></span>
                      </div>

                      <div className="billing-record-card__fields">
                        {record.type === "manual_payment" ? (
                          <label className="field-block">
                            <span className="field-label">支付方式</span>
                            <select
                              className={`field-input field-select ${includesKeyword(record.paymentMethod, detailSearchKeyword) ? "search-hit-input" : ""}`}
                              value={record.paymentMethod}
                              onChange={(event) => handleRecordFieldChange(record.id, "paymentMethod", event.target.value)}
                              onBlur={() => void persistRecord(record.id)}
                            >
                              <option value="">请选择支付方式</option>
                              {paymentMethods.map((item) => (
                                <option key={item} value={item}>
                                  {item}
                                </option>
                              ))}
                            </select>
                          </label>
                        ) : null}

                        {!canJump ? (
                          <label className="field-block field-block--full">
                            <span className="field-label">备注</span>
                            <input
                              className={`field-input ${includesKeyword(record.note, detailSearchKeyword) ? "search-hit-input" : ""}`}
                              value={record.note}
                              onChange={(event) => handleRecordFieldChange(record.id, "note", event.target.value)}
                              onBlur={() => void persistRecord(record.id)}
                            />
                          </label>
                        ) : null}
                      </div>

                      {canJump ? (
                        <div className="billing-record-card__link-row">
                          <button
                            className={`ghost-button btn-utility billing-record-card__jump ${includesKeyword("跳转对应历史记录", detailSearchKeyword) ? "search-hit-button" : ""}`}
                            type="button"
                            onClick={() => handleOpenRelatedHistory(record)}
                          >
                            <HighlightedText text="跳转对应历史记录" keyword={detailSearchKeyword} />
                          </button>
                        </div>
                      ) : null}

                      <div className="billing-card-actions">
                        <button className="delete-button delete-button--table" type="button" onClick={() => void handleDeleteRecord(record.id)}>
                          删除
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : null}
          </section>
        )}

        <div className="bottom-bar bottom-bar--database">
          <div className="bottom-bar__hint">{notice}</div>
        </div>
      </div>
    </main>
  );
}

