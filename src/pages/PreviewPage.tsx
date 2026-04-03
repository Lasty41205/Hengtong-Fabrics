import { useEffect, useMemo, useRef, useState } from "react";
import { toPng } from "html-to-image";
import { useLocation, useNavigate } from "react-router-dom";
import { InvoiceSheet, buildInvoiceSheetRows } from "../components/InvoiceSheet";
import { TopBar } from "../components/TopBar";
import { OrderForm } from "../types";

const PREVIEW_ORDER_KEY = "invoice-preview-order";
const PREVIEW_IMAGE_KEY = "invoice-preview-image";

const today = new Date();
const yearText = String(today.getFullYear());
const monthText = String(today.getMonth() + 1).padStart(2, "0");
const dayText = String(today.getDate()).padStart(2, "0");
const exportDateText = `${yearText}${monthText}${dayText}`;

function loadPreviewOrder(locationState: unknown): OrderForm | null {
  const routeState = locationState as { order?: OrderForm } | null;
  if (routeState?.order) return routeState.order;

  const cache = sessionStorage.getItem(PREVIEW_ORDER_KEY);
  return cache ? (JSON.parse(cache) as OrderForm) : null;
}

function waitForImageReady(image: HTMLImageElement) {
  if (image.complete) {
    if (image.naturalWidth > 0) {
      return Promise.resolve();
    }

    return Promise.reject(new Error(`图片资源加载失败: ${image.currentSrc || image.src || "unknown"}`));
  }

  return new Promise<void>((resolve, reject) => {
    const handleLoad = () => {
      cleanup();
      resolve();
    };

    const handleError = () => {
      cleanup();
      reject(new Error(`图片资源加载失败: ${image.currentSrc || image.src || "unknown"}`));
    };

    const cleanup = () => {
      image.removeEventListener("load", handleLoad);
      image.removeEventListener("error", handleError);
    };

    image.addEventListener("load", handleLoad, { once: true });
    image.addEventListener("error", handleError, { once: true });
  });
}

async function waitForExportReady(target: HTMLElement) {
  if ("fonts" in document) {
    await (document as Document & { fonts: { ready: Promise<unknown> } }).fonts.ready;
  }

  const images = Array.from(target.querySelectorAll<HTMLImageElement>("img"));
  await Promise.all(images.map((image) => waitForImageReady(image)));
  await new Promise<void>((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve())));
}

function buildExportFileName(order: OrderForm) {
  return `${order.customer || "未命名客户"}-${exportDateText}.png`;
}

export function PreviewPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const exportFrameRef = useRef<HTMLDivElement | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const [imageUrl, setImageUrl] = useState<string>(() => sessionStorage.getItem(PREVIEW_IMAGE_KEY) ?? "");
  const [menuOpen, setMenuOpen] = useState(false);
  const [hint, setHint] = useState("长按图片可复制或下载。当前不会把图片长期保存到数据库。");
  const [isPreparing, setIsPreparing] = useState(true);
  const [exportFailed, setExportFailed] = useState(false);
  const [isSharing, setIsSharing] = useState(false);

  const order = useMemo(() => loadPreviewOrder(location.state), [location.state]);
  const rows = useMemo(() => (order ? buildInvoiceSheetRows(order) : []), [order]);

  const buildImage = async () => {
    if (!exportFrameRef.current || !order) return "";

    const target = exportFrameRef.current;
    const renderImage = (simpleMode = false) =>
      toPng(target, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: "#ffffff",
        ...(simpleMode
          ? {}
          : {
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
            })
      });

    await waitForExportReady(target);

    try {
      return await renderImage(false);
    } catch {
      await waitForExportReady(target);
      return renderImage(true);
    }
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
        setExportFailed(false);
        const nextImageUrl = await buildImage();
        try {
          sessionStorage.setItem(PREVIEW_IMAGE_KEY, nextImageUrl);
        } catch (error) {
          console.warn("预览图片未写入 sessionStorage，当前直接使用页面内存态显示。", error);
        }

        if (!cancelled) {
          setImageUrl(nextImageUrl);
          setHint("可下载、复制或分享。当前不会把图片长期保存到数据库。");
        }
      } catch (error) {
        console.error(error);
        sessionStorage.removeItem(PREVIEW_IMAGE_KEY);
        if (!cancelled) {
          setImageUrl("");
          setExportFailed(true);
          setHint("当前设备图片导出失败，已切换为页面预览。返回编辑页不受影响。");
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
    if (!imageUrl || exportFailed) return;
    setMenuOpen(true);
  };

  const handlePressStart = () => {
    if (!imageUrl || exportFailed) return;

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
    if (!imageUrl || !order || exportFailed) return;

    const link = document.createElement("a");
    link.href = imageUrl;
    link.download = buildExportFileName(order);
    link.click();
    setMenuOpen(false);
    setHint("PNG 图片已开始下载。数据库里不会保存这张图片。");
  };

  const handleCopyImage = async () => {
    if (!imageUrl || exportFailed) return;

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

      setHint("图片已复制到剪贴板。数据库里不会保存这张图片。");
    } catch (error) {
      console.error(error);
      setHint("复制图片失败，请使用下载。");
    } finally {
      setMenuOpen(false);
    }
  };

  const handleShareImage = async () => {
    if (!order || !imageUrl || exportFailed) {
      setHint("当前还没有可分享的图片，请先等待图片生成完成。若系统分享不可用，可先下载后再用微信发送。");
      return;
    }

    if (!("share" in navigator) || typeof navigator.share !== "function") {
      setHint("当前浏览器不支持系统分享，请先下载图片后再用微信发送。");
      setMenuOpen(true);
      return;
    }

    try {
      setIsSharing(true);
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const file = new File([blob], buildExportFileName(order), { type: blob.type || "image/png" });

      if (typeof navigator.canShare === "function" && !navigator.canShare({ files: [file] })) {
        setHint("当前浏览器不能直接分享图片文件，请先下载后再用微信发送。");
        setMenuOpen(true);
        return;
      }

      await navigator.share({
        title: `${order.customer || "客户"} 销货单`,
        text: `${order.customer || "客户"} 销货单`,
        files: [file]
      });
      setHint("系统分享面板已打开，可继续选择微信或其他应用。");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }

      console.error(error);
      setHint("当前浏览器无法直接分享图片，请先下载后再用微信发送。");
      setMenuOpen(true);
    } finally {
      setIsSharing(false);
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
            <button className="secondary-button btn-nav-back" type="button" onClick={() => navigate("/", { state: { focusTop: true } })}>
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
        <TopBar title="销货单预览" rightText={exportFailed ? "页面预览" : "图片预览"} />

        <section className="preview-card preview-card--paper preview-card--viewer">
          <div className="preview-card__head preview-card__head--viewer">
            <p>{hint}</p>
            <div className="preview-primary-actions">
              <button
                className="secondary-button"
                type="button"
                onClick={() => void handleShareImage()}
                disabled={!imageUrl || exportFailed || isPreparing || isSharing}
              >
                {isSharing ? "正在分享..." : "分享"}
              </button>
              <button className="ghost-button btn-nav-back" type="button" onClick={() => navigate("/", { state: { focusTop: true } })}>
                返回编辑
              </button>
            </div>
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
                <div className="preview-fallback-panel">
                  <div className="preview-fallback-tip">当前设备未成功导出图片，下面显示可直接查看的销货单版式。</div>
                  <InvoiceSheet order={order} rows={rows} className="preview-sheet--viewer-fallback" />
                </div>
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

