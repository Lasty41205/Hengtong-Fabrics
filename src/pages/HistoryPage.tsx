import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { TopBar } from "../components/TopBar";
import { loadHistoryRecords } from "../historyStore";

type SortMode = "recent" | "customer";

export function HistoryPage() {
  const navigate = useNavigate();
  const [sortMode, setSortMode] = useState<SortMode>("recent");
  const [searchKeyword, setSearchKeyword] = useState("");
  const [activeRecordId, setActiveRecordId] = useState("");
  const records = useMemo(() => loadHistoryRecords(), []);

  const filteredRecords = useMemo(() => {
    const keyword = searchKeyword.trim().toUpperCase();
    const baseRecords = keyword
      ? records.filter((record) => record.customer.toUpperCase().includes(keyword))
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
            </div>
          </div>

          <div className="history-toolbar">
            <input
              className="field-input history-search-input"
              placeholder="按客户搜索历史记录"
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

              return (
                <article className="history-record-card" key={record.id}>
                  <button
                    type="button"
                    className="history-record-card__summary"
                    onClick={() => setActiveRecordId(isActive ? "" : record.id)}
                  >
                    <div>
                      <strong>{record.createdAtText}</strong>
                      <span>{record.customer || "未命名客户"}</span>
                    </div>
                    <div>
                      <strong>¥ {record.totalAmount}</strong>
                      <span>{record.logistics || "未填写货运方式"}</span>
                    </div>
                  </button>

                  {isActive ? (
                    <div className="history-record-card__detail">
                      <div className="history-detail-grid">
                        <div><span>客户</span><strong>{record.customer || "无"}</strong></div>
                        <div><span>电话</span><strong>{record.phone || "无"}</strong></div>
                        <div><span>地址</span><strong>{record.address || "无"}</strong></div>
                        <div><span>货运方式</span><strong>{record.logistics || "无"}</strong></div>
                      </div>

                      <div className="history-detail-block">
                        <span className="field-label">原始报单</span>
                        <pre className="history-raw-input">{record.rawInput || "无"}</pre>
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
                              <tr key={item.id}>
                                <td><div className="history-cell-text">{item.nameSpec || "-"}</div></td>
                                <td><div className="history-cell-text">{item.modelCode || "-"}</div></td>
                                <td><div className="history-cell-text">{item.quantity || "-"}</div></td>
                                <td><div className="history-cell-text">{item.unitPrice || "-"}</div></td>
                                <td><div className="history-cell-text">{item.amount || "-"}</div></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      <div className="history-detail-footer">
                        <span>备注：{record.remark || "无"}</span>
                        <strong>合计：¥ {record.totalAmount}</strong>
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
