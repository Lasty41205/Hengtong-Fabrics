import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { InvoiceSheet, buildInvoiceSheetRows } from "../components/InvoiceSheet";
import { TopBar } from "../components/TopBar";
import { buildDateSearchAliases, HighlightedText, includesKeyword } from "../components/HighlightedText";
import { loadHistoryRecords } from "../historyStore";
import {
  getInvoiceHistoryRecordById,
  listInvoiceHistoryPage,
  listLocalHistoryPage,
  mapHistoryRecordToListRecord
} from "../services/invoices";
import { HistoryListRecord, HistoryRecord, OrderForm } from "../types";

const PAGE_SIZE = 10;

type HistorySource = "local" | "supabase";

const buildHistorySearchText = (record: HistoryListRecord) =>
  [
    buildDateSearchAliases(record.updatedAt || record.createdAt),
    buildDateSearchAliases(record.createdAt),
    record.customer,
    record.logistics,
    record.remark,
    record.rawInput,
    record.totalAmount,
    record.createdByName,
    record.updatedByName
  ]
    .filter(Boolean)
    .join(" ")
    .toUpperCase();

function buildOrderFromHistoryRecord(record: HistoryRecord): OrderForm {
  return {
    customer: record.customer,
    phone: record.phone,
    address: record.address,
    logistics: record.logistics,
    remark: record.remark,
    items: record.items.map((item) => ({
      id: item.id,
      nameSpec: item.nameSpec,
      modelCode: item.modelCode,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      amount: item.amount,
      priceSource: item.priceSource,
      issues: {}
    })),
    totalAmount: record.totalAmount,
    issues: {}
  };
}

export function HistoryPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const routeState = location.state as { activeRecordId?: string } | null;
  const [searchKeyword, setSearchKeyword] = useState("");
  const [activeRecordId, setActiveRecordId] = useState(routeState?.activeRecordId ?? "");
  const [records, setRecords] = useState<HistoryListRecord[]>([]);
  const [recordDetails, setRecordDetails] = useState<Record<string, HistoryRecord>>({});
  const [loadingDetailId, setLoadingDetailId] = useState("");
  const [historySource, setHistorySource] = useState<HistorySource>("local");
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(PAGE_SIZE);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [notice, setNotice] = useState("正在读取历史记录...");

  const displayRecords = useMemo(() => {
    if (!activeRecordId) return records;
    if (records.some((record) => record.id === activeRecordId)) return records;
    const activeDetail = recordDetails[activeRecordId];
    if (!activeDetail) return records;
    return [mapHistoryRecordToListRecord(activeDetail), ...records];
  }, [activeRecordId, recordDetails, records]);

  useEffect(() => {
    let active = true;

    const loadRecords = async () => {
      try {
        setLoading(true);
        const result = await listInvoiceHistoryPage({
          page: currentPage,
          pageSize,
          keyword: searchKeyword
        });
        if (!active) return;
        setRecords(result.records);
        setTotalCount(result.totalCount);
        setTotalPages(result.totalPages);
        setHistorySource("supabase");
        setNotice(`当前历史记录来自 Supabase 共享库。第 ${result.page} / ${result.totalPages} 页，每页 ${result.pageSize} 条。`);
      } catch {
        if (!active) return;
        const result = listLocalHistoryPage({
          page: currentPage,
          pageSize,
          keyword: searchKeyword
        });
        setRecords(result.records);
        setTotalCount(result.totalCount);
        setTotalPages(result.totalPages);
        setHistorySource("local");
        setNotice(`云端历史记录读取失败，当前先回退到本地历史。第 ${result.page} / ${result.totalPages} 页。`);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void loadRecords();

    return () => {
      active = false;
    };
  }, [currentPage, pageSize, searchKeyword]);

  useEffect(() => {
    if (!activeRecordId || recordDetails[activeRecordId] || historySource !== "supabase") return;

    let active = true;

    const loadDetail = async () => {
      try {
        setLoadingDetailId(activeRecordId);
        const detail = await getInvoiceHistoryRecordById(activeRecordId);
        if (!active || !detail) return;
        setRecordDetails((current) => ({
          ...current,
          [detail.id]: detail
        }));
      } finally {
        if (active) {
          setLoadingDetailId("");
        }
      }
    };

    void loadDetail();

    return () => {
      active = false;
    };
  }, [activeRecordId, historySource, recordDetails]);

  const handleSearchChange = (value: string) => {
    setSearchKeyword(value);
    setCurrentPage(1);
    setActiveRecordId("");
  };

  const handleToggleRecord = async (record: HistoryListRecord) => {
    if (activeRecordId === record.id) {
      setActiveRecordId("");
      return;
    }

    setActiveRecordId(record.id);

    if (recordDetails[record.id]) return;

    if (historySource === "local") {
      const fallbackDetail = loadHistoryRecords().find((item) => item.id === record.id);
      if (!fallbackDetail) return;
      setRecordDetails((current) => ({
        ...current,
        [fallbackDetail.id]: fallbackDetail
      }));
      return;
    }

    try {
      setLoadingDetailId(record.id);
      const detail = await getInvoiceHistoryRecordById(record.id);
      if (!detail) return;
      setRecordDetails((current) => ({
        ...current,
        [detail.id]: detail
      }));
    } finally {
      setLoadingDetailId("");
    }
  };

  const handlePreviousPage = () => {
    if (currentPage <= 1) return;
    setActiveRecordId("");
    setCurrentPage((current) => current - 1);
  };

  const handleNextPage = () => {
    if (currentPage >= totalPages) return;
    setActiveRecordId("");
    setCurrentPage((current) => current + 1);
  };

  return (
    <main className="page-shell">
      <div className="page phone-frame phone-frame--database">
        <TopBar title="历史记录" rightText={historySource === "supabase" ? "云端分页" : "本地回退"} />

        <section className="hero-card">
          <div className="hero-card__heading hero-card__heading--stack">
            <div>
              <h2>销货单历史记录</h2>
              <p>{notice}</p>
            </div>
            <div className="action-row action-row--tight">
              <button className="secondary-button btn-nav-back" type="button" onClick={() => navigate("/", { state: { focusTop: true } })}>
                返回编辑页
              </button>
              <button className="ghost-button btn-nav-database" type="button" onClick={() => navigate("/database")}>
                数据库管理
              </button>
              <button className="ghost-button btn-nav-billing" type="button" onClick={() => navigate("/billing")}>
                账单
              </button>
            </div>
          </div>

          <div className="history-toolbar">
            <input
              className="field-input history-search-input"
              placeholder="按客户、销货单号、备注或原始报单搜索"
              value={searchKeyword}
              onChange={(event) => handleSearchChange(event.target.value)}
            />
            <span className="ghost-chip">每页 10 条</span>
          </div>
        </section>

        <section className="editor-card history-card">
          <div className="section-title-row">
            <h2>历史列表</h2>
            <span className="ghost-chip">{loading ? "加载中..." : `共 ${totalCount} 条`}</span>
          </div>

          <div className="history-list">
            {!loading && displayRecords.length === 0 ? (
              <div className="empty-card history-empty-card">
                <h2>暂无历史记录</h2>
                <p>先生成一张销货单，再来这里查看。</p>
              </div>
            ) : null}

            {displayRecords.map((record) => {
              const isActive = activeRecordId === record.id;
              const matched = includesKeyword(buildHistorySearchText(record), searchKeyword);
              const lastOperator = record.updatedByName || record.createdByName || "系统";
              const detailRecord = recordDetails[record.id];
              const previewOrder = detailRecord ? buildOrderFromHistoryRecord(detailRecord) : null;
              const previewRows = previewOrder ? buildInvoiceSheetRows(previewOrder) : [];

              return (
                <article className={`history-record-card ${matched ? "search-hit-card" : ""}`} key={record.id}>
                  <button
                    type="button"
                    className="history-record-card__summary"
                    onClick={() => void handleToggleRecord(record)}
                  >
                    <div>
                      <strong><HighlightedText text={record.updatedAtText || record.createdAtText} keyword={searchKeyword} /></strong>
                      <span><HighlightedText text={record.customer || "未命名客户"} keyword={searchKeyword} /></span>
                      <em className="history-operator-chip">
                        最后修改：<HighlightedText text={lastOperator} keyword={searchKeyword} />
                      </em>
                    </div>
                    <div>
                      <strong>¥ <HighlightedText text={record.totalAmount} keyword={searchKeyword} /></strong>
                      <span><HighlightedText text={record.logistics || "未填写货运方式"} keyword={searchKeyword} /></span>
                    </div>
                  </button>

                  {isActive ? (
                    <div className="history-record-card__detail">
                      {!detailRecord ? (
                        <div className="history-image-card history-image-card--empty">
                          <span className="field-label">销货单详情</span>
                          <p>{loadingDetailId === record.id ? "正在读取这条销货单详情..." : "详情暂未加载完成。"}</p>
                        </div>
                      ) : (
                        <>
                          <div className="history-detail-grid">
                            <div><span>客户</span><strong><HighlightedText text={detailRecord.customer || "无"} keyword={searchKeyword} /></strong></div>
                            <div><span>电话</span><strong><HighlightedText text={detailRecord.phone || "无"} keyword={searchKeyword} /></strong></div>
                            <div><span>地址</span><strong><HighlightedText text={detailRecord.address || "无"} keyword={searchKeyword} /></strong></div>
                            <div><span>货运方式</span><strong><HighlightedText text={detailRecord.logistics || "无"} keyword={searchKeyword} /></strong></div>
                          </div>

                          <div className="history-detail-block">
                            <span className="field-label">原始报单</span>
                            <pre className="history-raw-input"><HighlightedText text={detailRecord.rawInput || "无"} keyword={searchKeyword} /></pre>
                          </div>

                          <div className="db-table-wrap">
                            <table className="db-table db-table--compact">
                              <thead>
                                <tr>
                                  <th>名称及规格</th>
                                  <th>版号</th>
                                  <th>数量</th>
                                  <th>单价</th>
                                  <th>金额</th>
                                </tr>
                              </thead>
                              <tbody>
                                {detailRecord.items.map((item) => (
                                  <tr key={item.id} className={includesKeyword([item.nameSpec, item.modelCode, item.quantity, item.unitPrice, item.amount].join(" "), searchKeyword) ? "search-hit-row" : ""}>
                                    <td><div className="history-cell-text"><HighlightedText text={item.nameSpec || "-"} keyword={searchKeyword} /></div></td>
                                    <td><div className="history-cell-text"><HighlightedText text={item.modelCode || "-"} keyword={searchKeyword} /></div></td>
                                    <td><div className="history-cell-text"><HighlightedText text={item.quantity || "-"} keyword={searchKeyword} /></div></td>
                                    <td><div className="history-cell-text"><HighlightedText text={item.unitPrice || "-"} keyword={searchKeyword} /></div></td>
                                    <td><div className="history-cell-text"><HighlightedText text={item.amount || "-"} keyword={searchKeyword} /></div></td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>

                          <div className="history-detail-footer">
                            <span>备注：<HighlightedText text={detailRecord.remark || "无"} keyword={searchKeyword} /></span>
                            <strong>合计：¥ <HighlightedText text={detailRecord.totalAmount} keyword={searchKeyword} /></strong>
                          </div>

                          <div className="history-detail-actions">
                            <button
                              className="primary-button btn-action-primary"
                              type="button"
                              onClick={() => navigate("/", { state: { historyRecord: detailRecord, focusTop: true } })}
                            >
                              继续编辑并重生成
                            </button>
                            <span className="history-detail-tip">重新生成后会覆盖这条历史记录，并刷新修改时间。</span>
                          </div>

                          <div className="history-image-card">
                            <span className="field-label">销货单预览</span>
                            {previewOrder ? (
                              <InvoiceSheet
                                order={previewOrder}
                                rows={previewRows}
                                dateText={detailRecord.createdAt}
                                className="preview-sheet--viewer-fallback preview-sheet--history-detail"
                              />
                            ) : null}
                          </div>
                        </>
                      )}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        </section>

        <div className="bottom-bar bottom-bar--database">
          <div className="bottom-bar__hint">{loading ? "正在读取当前页历史记录..." : `当前第 ${currentPage} / ${totalPages} 页`}</div>
          <div className="database-bottom-actions">
            <button className="ghost-button btn-nav-back" type="button" onClick={handlePreviousPage} disabled={loading || currentPage <= 1}>
              上一页
            </button>
            <button className="primary-button btn-action-primary database-save-button" type="button" onClick={handleNextPage} disabled={loading || currentPage >= totalPages}>
              下一页
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}




