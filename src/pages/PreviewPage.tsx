import { useEffect, useMemo, useRef, useState } from "react";
import { toPng } from "html-to-image";
import { useLocation, useNavigate } from "react-router-dom";
import { TopBar } from "../components/TopBar";
import { OrderForm, OrderItem } from "../types";

const FIXED_ROWS = 8;
const qrImageUrl = new URL("../../二维码.jpg", import.meta.url).href;
const PREVIEW_ORDER_KEY = "invoice-preview-order";
const PREVIEW_IMAGE_KEY = "invoice-preview-image";

const today = new Date();
const yearText = String(today.getFullYear());
const monthText = String(today.getMonth() + 1).padStart(2, "0");
const dayText = String(today.getDate()).padStart(2, "0");
const exportDateText = `${yearText}${monthText}${dayText}`;

const companyInfo = {
  title: "恒通布艺销货单",
  address: "郑州市中牟县航海东路与蒋冲东街交叉口华丰家具材料城C馆东1-06号",
  phone: "17193883393",
  mobiles: ["13607668819", "13938225515"],
  qrCaption: "扫码关注快捷查询样板",
  business: "经营：各种高、中、低档沙发布、软硬包布、工程布、汽车座套布，批发各种高、中、低档汽车座套",
  notice: "货物请当面点清，如有差错，请在收到货物的当天与我处核对。谢谢！"
};

type SheetRow = OrderItem | Pick<OrderItem, "id" | "nameSpec" | "quantity" | "unitPrice" | "amount">;

type InvoiceSheetProps = {
  order: OrderForm;
  rows: SheetRow[];
  className?: string;
};

function InvoiceSheet({ order, rows, className = "" }: InvoiceSheetProps) {
  return (
    <div className={`preview-sheet preview-sheet--invoice-simple ${className}`.trim()}>
      <header className="invoice-simple-header">
        <h1>{companyInfo.title}</h1>
      </header>

      <div className="invoice-simple-top">
        <div className="invoice-simple-title-block">
          <div className="invoice-simple-contact">
            <p>
              <strong>地址：</strong>
              <span>{companyInfo.address}</span>
            </p>
            <p>
              <strong>电话：</strong>
              <span>{companyInfo.phone}</span>
            </p>
            <p>
              <strong>手机：</strong>
              <span>{companyInfo.mobiles[0]} {companyInfo.mobiles[1]}</span>
            </p>
          </div>
        </div>

        <div className="invoice-simple-qr-block">
          <img className="invoice-simple-qr-photo" src={qrImageUrl} alt="恒通布艺二维码" />
          <p>{companyInfo.qrCaption}</p>
        </div>
      </div>

      <div className="sheet-meta sheet-meta--simple sheet-meta--focus">
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
          <span>日期</span>
          <strong>{yearText}-{monthText}-{dayText}</strong>
        </div>
      </div>

      <div className="sheet-table sheet-table--simple">
        <div className="sheet-row sheet-row--head">
          <span>名称及规格</span>
          <span>数量</span>
          <span>单价</span>
          <span>金额</span>
        </div>

        {rows.map((item) => (
          <div className="sheet-row sheet-row--value" key={item.id}>
            <span>{item.nameSpec}</span>
            <span>{item.quantity}</span>
            <span>{item.unitPrice}</span>
            <span>{item.amount}</span>
          </div>
        ))}
      </div>

      <div className="sheet-footer sheet-footer--simple sheet-footer--focus">
        <div className="sheet-footer__block sheet-footer__block--logistics">
          <span>物流信息</span>
          <strong>{order.logistics || "待填写"}</strong>
        </div>
        <div className="sheet-footer__block sheet-footer__block--total">
          <span>合计金额</span>
          <strong>¥ {order.totalAmount}</strong>
        </div>
        <div className="sheet-footer__block sheet-footer__block--remark">
          <span>备注</span>
          <strong>{order.remark || "无"}</strong>
        </div>
      </div>

      <div className="invoice-simple-bottom">
        <p>{companyInfo.business}</p>
        <p>{companyInfo.notice}</p>
      </div>
    </div>
  );
}

function loadPreviewOrder(locationState: unknown): OrderForm | null {
  const routeState = locationState as { order?: OrderForm } | null;
  if (routeState?.order) return routeState.order;

  const cache = sessionStorage.getItem(PREVIEW_ORDER_KEY);
  return cache ? (JSON.parse(cache) as OrderForm) : null;
}

export function PreviewPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const exportFrameRef = useRef<HTMLDivElement | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const [imageUrl, setImageUrl] = useState<string>(() => sessionStorage.getItem(PREVIEW_IMAGE_KEY) ?? "");
  const [menuOpen, setMenuOpen] = useState(false);
  const [hint, setHint] = useState("长按图片可复制或下载。");
  const [isPreparing, setIsPreparing] = useState(true);

  const order = useMemo(() => loadPreviewOrder(location.state), [location.state]);

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

  const buildImage = async () => {
    if (!exportFrameRef.current || !order) return "";

    const target = exportFrameRef.current;
    const dataUrl = await toPng(target, {
      cacheBust: true,
      pixelRatio: 2,
      backgroundColor: "#ffffff",
      width: target.offsetWidth,
      height: target.offsetHeight,
      canvasWidth: target.offsetWidth,
      canvasHeight: target.offsetHeight,
      style: {
        margin: "0",
        transform: "none",
        maxWidth: "none",
        overflow: "visible"
      }
    });

    sessionStorage.setItem(PREVIEW_IMAGE_KEY, dataUrl);
    return dataUrl;
  };

  useEffect(() => {
    let cancelled = false;

    if (!order) {
      setIsPreparing(false);
      return undefined;
    }

    const timer = window.setTimeout(async () => {
      try {
        setIsPreparing(true);
        const nextImageUrl = await buildImage();
        if (!cancelled) {
          setImageUrl(nextImageUrl);
          setHint("长按图片可复制或下载。");
        }
      } catch (error) {
        console.error(error);
        if (!cancelled) {
          setHint("图片生成失败，请返回编辑页重试。");
        }
      } finally {
        if (!cancelled) {
          setIsPreparing(false);
        }
      }
    }, 80);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [order]);

  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) {
        window.clearTimeout(longPressTimerRef.current);
      }
    };
  }, []);

  const openMenu = () => {
    if (!imageUrl) return;
    setMenuOpen(true);
  };

  const handlePressStart = () => {
    if (!imageUrl) return;

    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
    }

    longPressTimerRef.current = window.setTimeout(() => {
      setMenuOpen(true);
    }, 450);
  };

  const handlePressEnd = () => {
    if (!longPressTimerRef.current) return;
    window.clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = null;
  };

  const handleDownloadImage = () => {
    if (!imageUrl || !order) return;

    const link = document.createElement("a");
    link.href = imageUrl;
    link.download = `${order.customer || "未命名客户"}-${exportDateText}.png`;
    link.click();
    setMenuOpen(false);
    setHint("PNG 图片已开始下载。");
  };

  const handleCopyImage = async () => {
    if (!imageUrl) return;

    try {
      if (!("ClipboardItem" in window) || !navigator.clipboard?.write) {
        setHint("当前浏览器暂不支持直接复制图片，请使用下载。");
        setMenuOpen(false);
        return;
      }

      const response = await fetch(imageUrl);
      const blob = await response.blob();
      await navigator.clipboard.write([
        new ClipboardItem({
          [blob.type || "image/png"]: blob
        })
      ]);

      setHint("图片已复制到剪贴板。");
    } catch (error) {
      console.error(error);
      setHint("复制图片失败，请使用下载。");
    } finally {
      setMenuOpen(false);
    }
  };

  if (!order) {
    return (
      <main className="page-shell page-shell--preview">
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
    <main className="page-shell page-shell--preview">
      <div className="page phone-frame phone-frame--preview">
        <TopBar title="销货单预览" rightText="图片预览" />

        <section className="preview-card preview-card--paper preview-card--viewer">
          <div className="preview-card__head preview-card__head--viewer">
            <p>{hint}</p>
            <button className="ghost-button" type="button" onClick={() => navigate("/")}>
              返回编辑
            </button>
          </div>

          <div className="preview-wrapper preview-wrapper--viewer">
            <div
              className="preview-image-stage"
              onTouchStart={handlePressStart}
              onTouchEnd={handlePressEnd}
              onTouchCancel={handlePressEnd}
              onMouseDown={handlePressStart}
              onMouseUp={handlePressEnd}
              onMouseLeave={handlePressEnd}
              onContextMenu={(event) => {
                event.preventDefault();
                openMenu();
              }}
              onClick={openMenu}
            >
              {isPreparing ? (
                <div className="preview-image-placeholder">正在生成销货单图片...</div>
              ) : imageUrl ? (
                <img className="preview-image" src={imageUrl} alt="销货单图片预览" />
              ) : (
                <div className="preview-image-placeholder">图片生成失败，请返回编辑页重试。</div>
              )}
            </div>
          </div>
        </section>
      </div>

      {menuOpen ? (
        <div className="preview-action-layer" onClick={() => setMenuOpen(false)}>
          <div className="preview-action-sheet" onClick={(event) => event.stopPropagation()}>
            <button type="button" onClick={handleCopyImage}>
              复制
            </button>
            <button type="button" onClick={handleDownloadImage}>
              下载
            </button>
          </div>
        </div>
      ) : null}

      <div className="preview-export-host" aria-hidden="true">
        <div className="preview-export-frame" ref={exportFrameRef}>
          <InvoiceSheet order={order} rows={rows} className="preview-sheet--export" />
        </div>
      </div>
    </main>
  );
}

