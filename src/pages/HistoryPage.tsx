import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { TopBar } from "../components/TopBar";
import { buildDateSearchAliases, HighlightedText, includesKeyword } from "../components/HighlightedText";
import { formatHistoryDate, loadHistoryRecords } from "../historyStore";

type SortMode = "recent" | "customer";

const buildHistorySearchText = (record: ReturnType<typeof loadHistoryRecords>[number]) =>
  [
    buildDateSearchAliases(record.createdAt),
    record.customer,
    record.phone,
    record.address,
    record.logistics,
    record.remark,
    record.rawInput,
    record.totalAmount,
    ...record.items.flatMap((item) => [item.nameSpec, item.modelCode, item.quantity, item.unitPrice, item.amount])
  ]
    .filter(Boolean)
    .join(" ")
    .toUpperCase();

export function HistoryPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const routeState = location.state as { activeRecordId?: string } | null;
  const [sortMode, setSortMode] = useState<SortMode>("recent");
  const [searchKeyword, setSearchKeyword] = useState("");
  const [activeRecordId, setActiveRecordId] = useState(routeState?.activeRecordId ?? "");
  const records = useMemo(() => loadHistoryRecords(), []);

  const filteredRecords = useMemo(() => {
    const baseRecords = searchKeyword.trim()
      ? records.filter((record) => includesKeyword(buildHistorySearchText(record), searchKeyword))
      : records;

    return [...baseRecords].sort((left, right) => {
      if (sortMode === "customer") {
        const customerCompare = left.customer.localeCompare(right.customer, "zh-Hans-CN", {
          sensitivity: "base"
        });
        if (customerCompare !== 0) return customerCompare;
      }

      return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
    });
  }, [records, searchKeyword, sortMode]);

  return (
    <main className="page-shell">
      <div className="page phone-frame phone-frame--database">
        <TopBar title="历史记录" rightText="本地留存" />

        <section className="hero-card">
          <div className="hero-card__heading hero-card__heading--stack">
            <div>
              <h2>销货单历史记录</h2>
              <p>每次成功生成销货单后，都会把当次报单和编辑结果留存在当前设备里，也可以继续回编再生成。</p>
            </div>
            <div className="action-row action-row--tight">
              <button className="secondary-button btn-nav-back" type="button" onClick={() => navigate("/")}>
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
              placeholder="按客户、日期、备注或原始报单搜索"
              value={searchKeyword}
              onChange={(event) => setSearchKeyword(event.target.value)}
            />
            <div className="history-sort-switch">
              <button
                type="button"
                className={sortMode === "recent" ? "inline-button btn-action-soft" : "ghost-button btn-utility"}
                onClick={() => setSortMode("recent")}
              >
                最近优先
              </button>
              <button
                type="button"
                className={sortMode === "customer" ? "inline-button btn-action-soft" : "ghost-button btn-utility"}
                onClick={() => setSortMode("customer")}
              >
                按客户看
              </button>
            </div>
          </div>
        </section>

        <section className="editor-card history-card">
          <div className="section-title-row">
            <h2>历史列表</h2>
            <span className="ghost-chip">共 {filteredRecords.length} 条</span>
          </div>

          <div className="history-list">
            {filteredRecords.length === 0 ? (
              <div className="empty-card history-empty-card">
                <h2>暂无历史记录</h2>
                <p>先生成一张销货单，再来这里查看。</p>
              </div>
            ) : null}

            {filteredRecords.map((record) => {
              const isActive = activeRecordId === record.id;
              const matched = includesKeyword(buildHistorySearchText(record), searchKeyword);

              return (
                <article className={`history-record-card ${matched ? "search-hit-card" : ""}`} key={record.id}>
                  <button
                    type="button"
                    className="history-record-card__summary"
                    onClick={() => setActiveRecordId(isActive ? "" : record.id)}
                  >
                    <div>
                      <strong><HighlightedText text={formatHistoryDate(record.createdAt)} keyword={searchKeyword} /> <span className="history-time-tail">{record.createdAtText.split(" ")[1] || ""}</span></strong>
                      <span><HighlightedText text={record.customer || "未命名客户"} keyword={searchKeyword} /></span>
                    </div>
                    <div>
                      <strong>¥ <HighlightedText text={record.totalAmount} keyword={searchKeyword} /></strong>
                      <span><HighlightedText text={record.logistics || "未填写货运方式"} keyword={searchKeyword} /></span>
                    </div>
                  </button>

                  {isActive ? (
                    <div className="history-record-card__detail">
                      <div className="history-detail-grid">
                        <div><span>客户</span><strong><HighlightedText text={record.customer || "无"} keyword={searchKeyword} /></strong></div>
                        <div><span>电话</span><strong><HighlightedText text={record.phone || "无"} keyword={searchKeyword} /></strong></div>
                        <div><span>地址</span><strong><HighlightedText text={record.address || "无"} keyword={searchKeyword} /></strong></div>
                        <div><span>货运方式</span><strong><HighlightedText text={record.logistics || "无"} keyword={searchKeyword} /></strong></div>
                      </div>

                      <div className="history-detail-block">
                        <span className="field-label">原始报单</span>
                        <pre className="history-raw-input"><HighlightedText text={record.rawInput || "无"} keyword={searchKeyword} /></pre>
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
                            {record.items.map((item) => (
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
                        <span>备注：<HighlightedText text={record.remark || "无"} keyword={searchKeyword} /></span>
                        <strong>合计：¥ <HighlightedText text={record.totalAmount} keyword={searchKeyword} /></strong>
                      </div>

                      <div className="history-detail-actions">
                        <button
                          className="primary-button btn-action-primary"
                          type="button"
                          onClick={() => navigate("/", { state: { historyRecord: record } })}
                        >
                          继续编辑并重生成
                        </button>
                        <span className="history-detail-tip">重新生成后会覆盖这条历史记录，并刷新时间与图片。</span>
                      </div>

                      {record.previewImageDataUrl ? (
                        <div className="history-image-card">
                          <span className="field-label">销货单图片</span>
                          <img className="history-image" src={record.previewImageDataUrl} alt="历史销货单图片" />
                        </div>
                      ) : (
                        <div className="history-image-card history-image-card--empty">
                          <span className="field-label">销货单图片</span>
                          <p>当前记录暂未保存图片。</p>
                        </div>
                      )}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}




