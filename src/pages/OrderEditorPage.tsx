import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { TopBar } from "../components/TopBar";
import { createEmptyForm, createMockParsedOrder } from "../mockData";
import { OrderForm, OrderItem } from "../types";
import {
  calculateAmount,
  calculateTotalAmount,
  collectValidationIssues,
  getInputIssue
} from "../utils";

const fieldTips = {
  customer: "客户不能为空",
  phone: "电话不能为空",
  address: "地址不能为空",
  logistics: "物流不能为空"
} as const;

function createEmptyItem(): OrderItem {
  return {
    id: crypto.randomUUID(),
    nameSpec: "",
    quantity: "",
    unitPrice: "",
    amount: "",
    issues: {}
  };
}

export function OrderEditorPage() {
  const navigate = useNavigate();
  const [rawInput, setRawInput] = useState("");
  const [form, setForm] = useState<OrderForm>(createEmptyForm);
  const [hasParsed, setHasParsed] = useState(false);
  const [hint, setHint] = useState("当前为本地 mock 版本，未接真实 AI。");

  const invalidCount = useMemo(() => collectValidationIssues(form).length, [form]);

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

  const handleParse = () => {
    const mock = createMockParsedOrder();
    setForm({
      ...mock,
      totalAmount: calculateTotalAmount(mock.items)
    });
    setHasParsed(true);
    setHint("已填入本地 mock 解析结果，其中第 2 行单价故意缺失，用于测试异常定位。");
  };

  const handleClear = () => {
    setRawInput("");
    setForm(createEmptyForm());
    setHasParsed(false);
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

  const scrollToFirstInvalid = () => {
    const target = document.querySelector<HTMLElement>("[data-invalid='true']");
    if (!target) return;

    target.scrollIntoView({ behavior: "smooth", block: "center" });
    target.focus();
  };

  const handleGenerate = () => {
    const issues = collectValidationIssues(form);

    if (issues.length > 0) {
      setHint(issues[0].message);
      window.setTimeout(scrollToFirstInvalid, 80);
      return;
    }

    sessionStorage.setItem("invoice-preview-order", JSON.stringify(form));
    navigate("/preview", { state: { order: form } });
  };

  return (
    <main className="page-shell">
      <div className="page phone-frame">
        <TopBar title="订单编辑" rightText="Phase 1 MVP" />

        <section className="hero-card">
          <div className="hero-card__heading">
            <div>
              <h2>快速录入报单</h2>
              <p>首页直接输入，解析后在同页编辑，不额外跳步骤。</p>
            </div>
            <span className="status-chip">移动端优先</span>
          </div>

          <textarea
            className="prompt-box"
            placeholder="请输入报单内容"
            value={rawInput}
            onChange={(event) => setRawInput(event.target.value)}
          />

          <div className="hero-tools">
            <span className="ghost-chip">语音输入（占位）</span>
            <span className="ghost-chip">支持图片粘贴入口提示</span>
          </div>

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
          <section className="editor-card">
            <div className="section-title-row">
              <div>
                <h2>销货单编辑区</h2>
                <p>异常字段统一浅红底高亮，生成前自动定位第一个异常。</p>
              </div>
              <span className={invalidCount > 0 ? "danger-chip" : "success-chip"}>
                {invalidCount > 0 ? `待处理 ${invalidCount} 项` : "可生成"}
              </span>
            </div>

            <div className="field-grid">
              {(
                [
                  ["customer", "客户"],
                  ["phone", "电话"],
                  ["address", "地址"],
                  ["logistics", "物流"]
                ] as const
              ).map(([key, label]) => {
                const issue = getInputIssue(form.issues[key], form[key], fieldTips[key]);

                return (
                  <label className="field-block" key={key}>
                    <span className="field-label">{label}</span>
                    <input
                      className={`field-input ${issue ? "is-invalid" : ""}`}
                      data-invalid={issue ? "true" : "false"}
                      value={form[key]}
                      onChange={(event) => updateFormField(key, event.target.value)}
                    />
                    {issue ? <span className="field-error">{issue.message}</span> : null}
                  </label>
                );
              })}

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
                <div>
                  <h3>商品明细</h3>
                  <p>局部吸收 POS 风格，信息更紧凑，录单更直接。</p>
                </div>
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
                          className={`table-input ${nameIssue ? "is-invalid" : ""}`}
                          data-invalid={nameIssue ? "true" : "false"}
                          placeholder="名称及规格"
                          value={item.nameSpec}
                          onChange={(event) => updateItem(item.id, { nameSpec: event.target.value })}
                        />
                        {nameIssue ? <span className="table-error">{nameIssue.message}</span> : null}
                      </div>

                      <div className="item-cell">
                        <input
                          className={`table-input ${quantityIssue ? "is-invalid" : ""}`}
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
                          className={`table-input ${priceIssue ? "is-invalid" : ""}`}
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
                          className={`table-input table-input--readonly ${amountIssue ? "is-invalid" : ""}`}
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
            <p>点击“AI解析”后，用本地 mock 数据模拟填充表单。</p>
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
