import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { TopBar } from "../components/TopBar";
import { createEmptyForm, createEmptyItem, logisticsOptions } from "../mockData";
import { OrderForm, OrderItem } from "../types";
import {
  calculateAmount,
  calculateTotalAmount,
  collectValidationIssues,
  getInputIssue,
  parseLocalOrderInput
} from "../utils";

const fieldTips = {
  customer: "客户不能为空",
  phone: "电话不能为空",
  address: "地址不能为空",
  logistics: "物流不能为空"
} as const;

const presetLogisticsOptions = logisticsOptions.filter((item) => item !== "其他");

type FocusableElement = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

type PastedImage = {
  file: File;
  url: string;
};

export function OrderEditorPage() {
  const navigate = useNavigate();
  const editorSectionRef = useRef<HTMLElement | null>(null);
  const fieldRefs = useRef<Record<string, FocusableElement | null>>({});
  const [rawInput, setRawInput] = useState("");
  const [form, setForm] = useState<OrderForm>(createEmptyForm);
  const [hasParsed, setHasParsed] = useState(false);
  const [hint, setHint] = useState("当前为本地规则解析版本，未接真实 AI。物流需手动选择。");
  const [useCustomLogistics, setUseCustomLogistics] = useState(false);
  const [activeFieldKey, setActiveFieldKey] = useState("");
  const [pastedImage, setPastedImage] = useState<PastedImage | null>(null);

  const invalidCount = useMemo(() => collectValidationIssues(form).length, [form]);

  useEffect(() => {
    return () => {
      if (pastedImage?.url) {
        URL.revokeObjectURL(pastedImage.url);
      }
    };
  }, [pastedImage]);

  const registerFieldRef = (key: string) => (node: FocusableElement | null) => {
    fieldRefs.current[key] = node;
  };

  const replacePastedImage = (file: File) => {
    setPastedImage((current) => {
      if (current?.url) {
        URL.revokeObjectURL(current.url);
      }

      return {
        file,
        url: URL.createObjectURL(file)
      };
    });
    setHint("已粘贴图片，本轮先展示预览，后续再接 OCR。物流需手动选择。");
  };

  const updateFormField = (key: keyof OrderForm, value: string) => {
    setForm((current) => ({
      ...current,
      [key]: value,
      issues:
        key in current.issues
          ? {
              ...current.issues,
              [key]: undefined
            }
          : current.issues
    }));
  };

  const updateItem = (itemId: string, patch: Partial<OrderItem>) => {
    setForm((current) => {
      const items = current.items.map((item) => {
        if (item.id !== itemId) return item;

        const nextItem = { ...item, ...patch };
        const nextAmount =
          patch.quantity !== undefined || patch.unitPrice !== undefined
            ? calculateAmount(nextItem.quantity, nextItem.unitPrice)
            : nextItem.amount;

        return {
          ...nextItem,
          amount: nextAmount,
          issues: {
            ...nextItem.issues,
            ...(patch.nameSpec !== undefined ? { nameSpec: undefined } : {}),
            ...(patch.quantity !== undefined ? { quantity: undefined } : {}),
            ...(patch.unitPrice !== undefined ? { unitPrice: undefined } : {}),
            ...(nextAmount ? { amount: undefined } : {})
          }
        };
      });

      return {
        ...current,
        items,
        totalAmount: calculateTotalAmount(items)
      };
    });
  };

  const scrollToEditorSection = () => {
    editorSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const imageItem = Array.from(event.clipboardData.items).find((item) =>
      item.type.startsWith("image/")
    );

    if (!imageItem) return;

    const file = imageItem.getAsFile();
    if (!file) return;

    replacePastedImage(file);
  };

  const handleRemovePastedImage = () => {
    setPastedImage((current) => {
      if (current?.url) {
        URL.revokeObjectURL(current.url);
      }
      return null;
    });
    setHint("已移除粘贴图片。");
  };

  const handleParse = () => {
    const parsed = parseLocalOrderInput(rawInput);
    setForm(parsed.form);
    setHasParsed(true);
    setUseCustomLogistics(false);
    setHint(
      pastedImage
        ? `${parsed.summary} 已检测到粘贴图片，本轮暂不识别图片内容。`
        : parsed.summary
    );
    setActiveFieldKey("");
    window.setTimeout(scrollToEditorSection, 120);
  };

  const handleClear = () => {
    setRawInput("");
    setForm(createEmptyForm());
    setHasParsed(false);
    setUseCustomLogistics(false);
    setActiveFieldKey("");
    setPastedImage((current) => {
      if (current?.url) {
        URL.revokeObjectURL(current.url);
      }
      return null;
    });
    setHint("内容已清空。");
  };

  const handleAddItem = () => {
    setForm((current) => {
      const items = [...current.items, createEmptyItem()];
      return {
        ...current,
        items,
        totalAmount: calculateTotalAmount(items)
      };
    });
  };

  const handleDeleteItem = (itemId: string) => {
    setForm((current) => {
      const filtered = current.items.filter((item) => item.id !== itemId);
      const items = filtered.length ? filtered : [createEmptyItem()];

      return {
        ...current,
        items,
        totalAmount: calculateTotalAmount(items)
      };
    });
  };

  const handleLogisticsSelectChange = (value: string) => {
    if (value === "其他") {
      setUseCustomLogistics(true);
      updateFormField("logistics", "");
      return;
    }

    setUseCustomLogistics(false);
    updateFormField("logistics", value);
  };

  const scrollToIssueField = (fieldKey: string) => {
    const target = fieldRefs.current[fieldKey];
    if (!target) return;

    setActiveFieldKey(fieldKey);
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => {
      target.focus({ preventScroll: true });
    }, 160);
    window.setTimeout(() => {
      setActiveFieldKey((current) => (current === fieldKey ? "" : current));
    }, 1400);
  };

  const handleGenerate = () => {
    const issues = collectValidationIssues(form);

    if (issues.length > 0) {
      setHasParsed(true);
      setHint(issues[0].message);
      window.setTimeout(() => scrollToIssueField(issues[0].key), 120);
      return;
    }

    sessionStorage.setItem("invoice-preview-order", JSON.stringify(form));
    navigate("/preview", { state: { order: form } });
  };

  const customerIssue = getInputIssue(form.issues.customer, form.customer, fieldTips.customer);
  const phoneIssue = getInputIssue(form.issues.phone, form.phone, fieldTips.phone);
  const addressIssue = getInputIssue(form.issues.address, form.address, fieldTips.address);
  const logisticsIssue = getInputIssue(form.issues.logistics, form.logistics, fieldTips.logistics);

  return (
    <main className="page-shell">
      <div className="page phone-frame">
        <TopBar title="订单编辑" rightText="Phase 1 MVP" />

        <section className="hero-card">
          <div className="hero-card__heading">
            <h2>快速录入报单</h2>
            <span className="status-chip">移动端优先</span>
          </div>

          <textarea
            className="prompt-box"
            placeholder="请输入报单内容"
            value={rawInput}
            onChange={(event) => setRawInput(event.target.value)}
            onPaste={handlePaste}
          />

          {pastedImage ? (
            <div className="pasted-image-card">
              <div className="pasted-image-card__head">
                <span>已粘贴图片</span>
                <button className="ghost-button pasted-image-card__remove" type="button" onClick={handleRemovePastedImage}>
                  删除图片
                </button>
              </div>
              <img className="pasted-image-preview" src={pastedImage.url} alt="已粘贴图片预览" />
            </div>
          ) : null}

          <div className="action-row">
            <button className="secondary-button" type="button" onClick={handleParse}>
              AI解析
            </button>
            <button className="ghost-button" type="button" onClick={handleClear}>
              清空
            </button>
          </div>
        </section>

        {hasParsed ? (
          <section className="editor-card" ref={editorSectionRef}>
            <div className="section-title-row">
              <h2>销货单编辑区</h2>
              <span className={invalidCount > 0 ? "danger-chip" : "success-chip"}>
                {invalidCount > 0 ? `待处理 ${invalidCount} 项` : "可生成"}
              </span>
            </div>

            <div className="field-grid">
              <label className="field-block">
                <span className="field-label">客户</span>
                <input
                  ref={registerFieldRef("customer")}
                  className={`field-input ${customerIssue ? "is-invalid" : ""} ${
                    activeFieldKey === "customer" ? "field-attention" : ""
                  }`}
                  data-invalid={customerIssue ? "true" : "false"}
                  value={form.customer}
                  onChange={(event) => updateFormField("customer", event.target.value)}
                />
                {customerIssue ? <span className="field-error">{customerIssue.message}</span> : null}
              </label>

              <label className="field-block">
                <span className="field-label">电话</span>
                <input
                  ref={registerFieldRef("phone")}
                  className={`field-input ${phoneIssue ? "is-invalid" : ""} ${
                    activeFieldKey === "phone" ? "field-attention" : ""
                  }`}
                  data-invalid={phoneIssue ? "true" : "false"}
                  value={form.phone}
                  onChange={(event) => updateFormField("phone", event.target.value)}
                />
                {phoneIssue ? <span className="field-error">{phoneIssue.message}</span> : null}
              </label>

              <label className="field-block">
                <span className="field-label">地址</span>
                <input
                  ref={registerFieldRef("address")}
                  className={`field-input ${addressIssue ? "is-invalid" : ""} ${
                    activeFieldKey === "address" ? "field-attention" : ""
                  }`}
                  data-invalid={addressIssue ? "true" : "false"}
                  value={form.address}
                  onChange={(event) => updateFormField("address", event.target.value)}
                />
                {addressIssue ? <span className="field-error">{addressIssue.message}</span> : null}
              </label>

              <div className="field-block">
                <span className="field-label">物流</span>
                <select
                  ref={useCustomLogistics ? undefined : registerFieldRef("logistics")}
                  className={`field-input field-select ${logisticsIssue ? "is-invalid" : ""} ${
                    activeFieldKey === "logistics" && !useCustomLogistics ? "field-attention" : ""
                  }`}
                  data-invalid={logisticsIssue ? "true" : "false"}
                  value={useCustomLogistics ? "其他" : form.logistics}
                  onChange={(event) => handleLogisticsSelectChange(event.target.value)}
                >
                  <option value="">请选择物流</option>
                  {presetLogisticsOptions.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                  <option value="其他">其他</option>
                </select>

                {useCustomLogistics ? (
                  <input
                    ref={registerFieldRef("logistics")}
                    className={`field-input field-input--sub ${logisticsIssue ? "is-invalid" : ""} ${
                      activeFieldKey === "logistics" ? "field-attention" : ""
                    }`}
                    data-invalid={logisticsIssue ? "true" : "false"}
                    placeholder="请输入物流名称"
                    value={form.logistics}
                    onChange={(event) => updateFormField("logistics", event.target.value)}
                  />
                ) : null}

                {logisticsIssue ? <span className="field-error">{logisticsIssue.message}</span> : null}
              </div>

              <label className="field-block field-block--full">
                <span className="field-label">备注（可选）</span>
                <textarea
                  className="field-textarea"
                  rows={3}
                  value={form.remark}
                  onChange={(event) => updateFormField("remark", event.target.value)}
                />
              </label>
            </div>

            <div className="items-panel">
              <div className="section-title-row">
                <h3>商品明细</h3>
                <button className="inline-button" type="button" onClick={handleAddItem}>
                  添加一行
                </button>
              </div>

              <div className="items-header">
                <span />
                <span>名称及规格</span>
                <span>数量</span>
                <span>单价</span>
                <span>金额</span>
                <span>操作</span>
              </div>

              <div className="items-list">
                {form.items.map((item, index) => {
                  const nameIssue = getInputIssue(item.issues.nameSpec, item.nameSpec, "请填写名称及规格");
                  const quantityIssue = getInputIssue(item.issues.quantity, item.quantity, "请填写数量");
                  const priceIssue = getInputIssue(item.issues.unitPrice, item.unitPrice, "请填写单价");
                  const amountIssue = getInputIssue(item.issues.amount, item.amount, "金额将自动计算");

                  return (
                    <div className="item-row" key={item.id}>
                      <div className="item-index">{index + 1}</div>

                      <div className="item-cell item-cell--name">
                        <input
                          ref={registerFieldRef(`item-${item.id}-nameSpec`)}
                          className={`table-input ${nameIssue ? "is-invalid" : ""} ${
                            activeFieldKey === `item-${item.id}-nameSpec` ? "field-attention" : ""
                          }`}
                          data-invalid={nameIssue ? "true" : "false"}
                          placeholder="名称及规格"
                          value={item.nameSpec}
                          onChange={(event) => updateItem(item.id, { nameSpec: event.target.value })}
                        />
                        {nameIssue ? <span className="table-error">{nameIssue.message}</span> : null}
                      </div>

                      <div className="item-cell">
                        <input
                          ref={registerFieldRef(`item-${item.id}-quantity`)}
                          className={`table-input ${quantityIssue ? "is-invalid" : ""} ${
                            activeFieldKey === `item-${item.id}-quantity` ? "field-attention" : ""
                          }`}
                          data-invalid={quantityIssue ? "true" : "false"}
                          inputMode="decimal"
                          placeholder="数量"
                          value={item.quantity}
                          onChange={(event) => updateItem(item.id, { quantity: event.target.value })}
                        />
                        {quantityIssue ? <span className="table-error">{quantityIssue.message}</span> : null}
                      </div>

                      <div className="item-cell">
                        <input
                          ref={registerFieldRef(`item-${item.id}-unitPrice`)}
                          className={`table-input ${priceIssue ? "is-invalid" : ""} ${
                            activeFieldKey === `item-${item.id}-unitPrice` ? "field-attention" : ""
                          }`}
                          data-invalid={priceIssue ? "true" : "false"}
                          inputMode="decimal"
                          placeholder="单价"
                          value={item.unitPrice}
                          onChange={(event) => updateItem(item.id, { unitPrice: event.target.value })}
                        />
                        {priceIssue ? <span className="table-error">{priceIssue.message}</span> : null}
                      </div>

                      <div className="item-cell">
                        <input
                          ref={registerFieldRef(`item-${item.id}-amount`)}
                          className={`table-input table-input--readonly ${amountIssue ? "is-invalid" : ""} ${
                            activeFieldKey === `item-${item.id}-amount` ? "field-attention" : ""
                          }`}
                          data-invalid={amountIssue ? "true" : "false"}
                          placeholder="金额"
                          value={item.amount}
                          readOnly
                        />
                        {amountIssue ? <span className="table-error">{amountIssue.message}</span> : null}
                      </div>

                      <div className="item-cell item-cell--action">
                        <button
                          className="delete-button"
                          type="button"
                          onClick={() => handleDeleteItem(item.id)}
                        >
                          删除
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="total-box">
                <span>合计金额</span>
                <strong>¥ {form.totalAmount || "0"}</strong>
              </div>
            </div>
          </section>
        ) : (
          <section className="empty-card">
            <h2>等待解析</h2>
          </section>
        )}

        <div className="bottom-bar">
          <div className="bottom-bar__hint">{hint}</div>
          <button className="primary-button" type="button" onClick={handleGenerate}>
            生成销货单
          </button>
        </div>
      </div>
    </main>
  );
}
