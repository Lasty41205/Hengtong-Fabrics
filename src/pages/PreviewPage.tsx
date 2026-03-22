import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { TopBar } from "../components/TopBar";
import { OrderForm } from "../types";

const FIXED_ROWS = 8;

const today = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
}).format(new Date());

export function PreviewPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  const order = useMemo<OrderForm | null>(() => {
    const routeState = location.state as { order?: OrderForm } | null;
    if (routeState?.order) return routeState.order;

    const cache = sessionStorage.getItem("invoice-preview-order");
    return cache ? (JSON.parse(cache) as OrderForm) : null;
  }, [location.state]);

  const rows = useMemo(() => {
    const items = order?.items ?? [];
    const blanks = Array.from({ length: Math.max(0, FIXED_ROWS - items.length) }).map((_, index) => ({
      id: `blank-${index}`,
      nameSpec: "",
      quantity: "",
      unitPrice: "",
      amount: ""
    }));

    return [...items, ...blanks].slice(0, FIXED_ROWS);
  }, [order]);

  const handleCopy = async () => {
    if (!order) return;

    const text = [
      "AI销货单助手",
      `日期：${today}`,
      `客户：${order.customer}`,
      `电话：${order.phone}`,
      `地址：${order.address}`,
      `物流：${order.logistics}`,
      ...order.items.map(
        (item, index) =>
          `商品${index + 1}：${item.nameSpec} / ${item.quantity} / ${item.unitPrice} / ${item.amount}`
      ),
      `合计金额：${order.totalAmount}`
    ].join("\n");

    await navigator.clipboard.writeText(text);
    setMenuOpen(false);
  };

  const handleDownload = () => {
    if (!order) return;

    const blob = new Blob(
      [JSON.stringify({ title: "销货单", date: today, order }, null, 2)],
      { type: "application/json;charset=utf-8" }
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `销货单-${today}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setMenuOpen(false);
  };

  if (!order) {
    return (
      <main className="page-shell">
        <div className="page phone-frame">
          <TopBar title="销货单预览" />
          <section className="empty-card empty-card--preview">
            <h2>暂无预览数据</h2>
            <p>请先返回订单编辑页生成一份有效销货单。</p>
            <button className="secondary-button" type="button" onClick={() => navigate("/")}>
              返回编辑页
            </button>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="page-shell">
      <div className="page phone-frame">
        <TopBar title="销货单预览" rightText="固定模板" />

        <section className="preview-card">
          <div className="preview-card__head">
            <div>
              <h2>正式销货单预览</h2>
              <p>点击预览区域弹出菜单，这是本轮替代长按图片菜单的降级方案。</p>
            </div>
            <button className="ghost-button" type="button" onClick={() => navigate("/")}>
              返回编辑
            </button>
          </div>

          <div className="preview-wrapper">
            <button className="preview-sheet" type="button" onClick={() => setMenuOpen((v) => !v)}>
              <div className="sheet-header">
                <div>
                  <p className="sheet-caption">AI销货单助手</p>
                  <h3>销货单</h3>
                </div>
                <span>{today}</span>
              </div>

              <div className="sheet-meta">
                <div>
                  <span>客户</span>
                  <strong>{order.customer}</strong>
                </div>
                <div>
                  <span>电话</span>
                  <strong>{order.phone}</strong>
                </div>
                <div>
                  <span>地址</span>
                  <strong>{order.address}</strong>
                </div>
                <div>
                  <span>物流</span>
                  <strong>{order.logistics}</strong>
                </div>
              </div>

              <div className="sheet-table">
                <div className="sheet-row sheet-row--head">
                  <span>名称及规格</span>
                  <span>数量</span>
                  <span>单价</span>
                  <span>金额</span>
                </div>

                {rows.map((item) => (
                  <div className="sheet-row" key={item.id}>
                    <span>{item.nameSpec}</span>
                    <span>{item.quantity}</span>
                    <span>{item.unitPrice}</span>
                    <span>{item.amount}</span>
                  </div>
                ))}
              </div>

              <div className="sheet-footer">
                <div>
                  <span>备注</span>
                  <strong>{order.remark || "无"}</strong>
                </div>
                <div>
                  <span>合计金额</span>
                  <strong>¥ {order.totalAmount}</strong>
                </div>
              </div>
            </button>

            {menuOpen ? (
              <div className="preview-menu">
                <button type="button" onClick={handleCopy}>
                  复制
                </button>
                <button type="button" onClick={handleDownload}>
                  下载
                </button>
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}
