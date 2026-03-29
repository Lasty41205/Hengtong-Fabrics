import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { TopBar } from "../components/TopBar";
import {
  enrichItemWithDatabase,
  extractModelCode,
  getPriceSourceLabel,
  hydrateFormWithDatabase,
  loadBusinessDatabase,
  saveBusinessDatabase,
  syncOrderToDatabase
} from "../localDb";
import { PENDING_HISTORY_ID_KEY, saveHistoryRecord } from "../historyStore";
import {
  findAutoBillingRecordByOrderId,
  getCustomerCurrentBalance,
  removeAutoBillingRecordByOrderId,
  upsertAutoBillingRecord
} from "../billingStore";
import {
  createEmptyForm,
  createEmptyItem,
  emptyFreightSelection,
  expressCarrierOptions,
  FreightSelectionState,
  freightPrimaryOptions,
  logisticsCarrierOptions,
  resolveFreightSelection
} from "../mockData";
import { calculateAmount, calculateTotalAmount } from "../orderMath";
import { BillingRecord, HistoryRecord, LocalBusinessDatabase, OrderForm, OrderItem } from "../types";
import { collectValidationIssues, getInputIssue, parseLocalOrderInput } from "../utils";

const fieldTips = {
  customer: "客户不能为空",
  phone: "电话不能为空",
  address: "地址不能为空",
  logistics: "货运方式不能为空"
} as const;

const EDITOR_STATE_KEY = "invoice-editor-state";

const sumMoneyText = (left: string, right: string) => {
  const next = Number(left || 0) + Number(right || 0);
  return Number.isFinite(next) ? String(Number(next.toFixed(2))) : "0";
};

type FocusableElement = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

type PastedImage = {
  file: File;
  url: string;
};

type EditorSnapshot = {
  rawInput: string;
  form: OrderForm;
  hasParsed: boolean;
  freightSelection: FreightSelectionState;
  hint: string;
  editingHistoryRecordId: string;
  includeInLedger: boolean;
};

type EditorRouteState = {
  historyRecord?: HistoryRecord;
} | null;

function normalizeSnapshotForm(value: Partial<OrderForm> | undefined): OrderForm {
  const fallback = createEmptyForm();
  if (!value) return fallback;

  const items = (value.items ?? []).map((item) => {
    const legacyItem = item as Partial<OrderItem> & { rawModel?: string; priceKey?: string };

    return {
      ...createEmptyItem(),
      ...item,
      modelCode:
        legacyItem.modelCode ||
        extractModelCode(legacyItem.nameSpec || legacyItem.rawModel || legacyItem.priceKey || ""),
      issues: item.issues ?? {}
    };
  });

  return {
    customer: value.customer ?? fallback.customer,
    phone: value.phone ?? fallback.phone,
    address: value.address ?? fallback.address,
    logistics: value.logistics ?? fallback.logistics,
    remark: value.remark ?? fallback.remark,
    items: items.length > 0 ? items : fallback.items,
    totalAmount: value.totalAmount ?? fallback.totalAmount,
    billingSummary: value.billingSummary,
    issues: value.issues ?? {}
  };
}

function normalizeFreightSelection(
  value: Partial<FreightSelectionState> | undefined,
  logisticsValue: string
): FreightSelectionState {
  const resolved = resolveFreightSelection(logisticsValue);
  return {
    primary: value?.primary ?? resolved.primary,
    secondary: value?.secondary ?? resolved.secondary,
    customMode: value?.customMode ?? resolved.customMode,
    customText: value?.customText ?? resolved.customText
  };
}

function loadEditorSnapshot(): EditorSnapshot {
  const defaultState: EditorSnapshot = {
    rawInput: "",
    form: createEmptyForm(),
    hasParsed: false,
    freightSelection: emptyFreightSelection(),
    hint: "当前为 Phase 2 本地数据库版本，优先按客户价和默认价补全。",
    editingHistoryRecordId: "",
    includeInLedger: false
  };

  try {
    const saved = sessionStorage.getItem(EDITOR_STATE_KEY);
    if (!saved) return defaultState;

    const parsed = JSON.parse(saved) as Partial<EditorSnapshot>;
    const form = normalizeSnapshotForm(parsed.form);
    return {
      rawInput: parsed.rawInput ?? defaultState.rawInput,
      form,
      hasParsed: parsed.hasParsed ?? defaultState.hasParsed,
      freightSelection: normalizeFreightSelection(parsed.freightSelection, form.logistics),
      hint: parsed.hint ?? defaultState.hint,
      editingHistoryRecordId: parsed.editingHistoryRecordId ?? "",
      includeInLedger: parsed.includeInLedger ?? false
    };
  } catch {
    return defaultState;
  }
}

function buildFreightValue(selection: FreightSelectionState) {
  if (selection.primary === "/") return "/";

  if (selection.customMode === "primary") {
    return selection.customText.trim();
  }

  if (selection.customMode === "secondary") {
    return selection.primary && selection.customText.trim()
      ? `${selection.primary}-${selection.customText.trim()}`
      : "";
  }

  if (selection.primary === "物流" || selection.primary === "快递") {
    return selection.secondary ? `${selection.primary}-${selection.secondary}` : "";
  }

  return "";
}

function buildFormFromHistoryRecord(record: HistoryRecord): OrderForm {
  const items = record.items.map((item) => ({
    ...createEmptyItem(),
    ...item,
    priceSource: item.priceSource || "manual",
    issues: {}
  }));

  return {
    customer: record.customer,
    phone: record.phone,
    address: record.address,
    logistics: record.logistics,
    remark: record.remark,
    items: items.length > 0 ? items : [createEmptyItem()],
    totalAmount: record.totalAmount || calculateTotalAmount(items),
    issues: {}
  };
}

function buildStateFromHistoryRecord(record: HistoryRecord): EditorSnapshot {
  const form = buildFormFromHistoryRecord(record);
  return {
    rawInput: record.rawInput,
    form,
    hasParsed: true,
    freightSelection: resolveFreightSelection(record.logistics),
    hint: "已载入历史记录，可直接修改后重新生成。",
    editingHistoryRecordId: record.id,
    includeInLedger: false
  };
}

export function OrderEditorPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const editorSectionRef = useRef<HTMLElement | null>(null);
  const itemsPanelRef = useRef<HTMLDivElement | null>(null);
  const fieldRefs = useRef<Record<string, FocusableElement | null>>({});
  const routeState = location.state as EditorRouteState;
  const routeHistoryRecord = routeState?.historyRecord;
  const initialDatabase = useMemo<LocalBusinessDatabase>(() => loadBusinessDatabase(), []);
  const initialState = useMemo(
    () => (routeHistoryRecord ? buildStateFromHistoryRecord(routeHistoryRecord) : loadEditorSnapshot()),
    [routeHistoryRecord]
  );
  const [database, setDatabase] = useState(initialDatabase);
  const [rawInput, setRawInput] = useState(initialState.rawInput);
  const [form, setForm] = useState<OrderForm>(() =>
    routeHistoryRecord ? initialState.form : hydrateFormWithDatabase(initialState.form, initialDatabase)
  );
  const [hasParsed, setHasParsed] = useState(initialState.hasParsed);
  const [hint, setHint] = useState(initialState.hint);
  const [freightSelection, setFreightSelection] = useState<FreightSelectionState>(initialState.freightSelection);
  const [editingHistoryRecordId, setEditingHistoryRecordId] = useState(initialState.editingHistoryRecordId);
  const [includeInLedger, setIncludeInLedger] = useState(initialState.includeInLedger);
  const [activeFieldKey, setActiveFieldKey] = useState("");
  const [pastedImage, setPastedImage] = useState<PastedImage | null>(null);

  const invalidCount = useMemo(() => collectValidationIssues(form).length, [form]);
  const secondaryFreightOptions = useMemo(() => {
    if (freightSelection.primary === "物流") return logisticsCarrierOptions;
    if (freightSelection.primary === "快递") return expressCarrierOptions;
    return [];
  }, [freightSelection.primary]);
  const showFreightSecondary = freightSelection.primary === "物流" || freightSelection.primary === "快递";
  const showFreightCustomInput = freightSelection.customMode !== "none";
  const existingAutoBillingRecord = useMemo<BillingRecord | undefined>(
    () => (editingHistoryRecordId ? findAutoBillingRecordByOrderId(editingHistoryRecordId) : undefined),
    [editingHistoryRecordId]
  );
  const customerHistoricalBalance = useMemo(
    () => getCustomerCurrentBalance(form.customer, { excludeRelatedOrderId: editingHistoryRecordId || undefined }),
    [editingHistoryRecordId, form.customer]
  );
  const shouldShowBillingPrompt = Boolean(existingAutoBillingRecord) || Number(customerHistoricalBalance || 0) !== 0;

  useEffect(() => {
    const snapshot: EditorSnapshot = {
      rawInput,
      form,
      hasParsed,
      freightSelection,
      hint,
      editingHistoryRecordId,
      includeInLedger
    };

    sessionStorage.setItem(EDITOR_STATE_KEY, JSON.stringify(snapshot));
  }, [editingHistoryRecordId, form, freightSelection, hasParsed, hint, includeInLedger, rawInput]);

  useEffect(() => {
    const shouldIncludeCurrentOrder = Boolean(
      existingAutoBillingRecord &&
        existingAutoBillingRecord.customerName.trim().toUpperCase() === form.customer.trim().toUpperCase()
    );
    setIncludeInLedger(shouldIncludeCurrentOrder);
  }, [existingAutoBillingRecord, form.customer]);

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

  const focusFieldByKey = (fieldKey: string) => {
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

  const moveToFirstItemName = () => {
    const existingFirstId = form.items[0]?.id;

    if (existingFirstId) {
      itemsPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      window.setTimeout(() => {
        focusFieldByKey(`item-${existingFirstId}-nameSpec`);
      }, 180);
      return;
    }

    const newItem = createEmptyItem();
    setForm((current) => ({
      ...current,
      items: [newItem],
      totalAmount: calculateTotalAmount([newItem])
    }));

    itemsPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.setTimeout(() => {
      focusFieldByKey(`item-${newItem.id}-nameSpec`);
    }, 220);
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
    setHint("已粘贴图片，本阶段仍不做 OCR，只保留图片预览。");
  };

  const updateFormField = (key: keyof OrderForm, value: string) => {
    const previewForm = key === "customer" ? hydrateFormWithDatabase({ ...form, customer: value }, database) : null;

    setForm((current) => {
      const nextForm = {
        ...current,
        [key]: value,
        issues:
          key in current.issues
            ? {
                ...current.issues,
                [key]: undefined
              }
            : current.issues
      };

      return key === "customer" ? hydrateFormWithDatabase(nextForm, database) : nextForm;
    });

    if (previewForm) {
      setFreightSelection(resolveFreightSelection(previewForm.logistics));
    }
  };

  const updateItem = (itemId: string, patch: Partial<OrderItem>) => {
    setForm((current) => {
      const items = current.items.map((item) => {
        if (item.id !== itemId) return item;

        const nextItemBase: OrderItem = {
          ...item,
          ...patch,
          modelCode:
            patch.nameSpec !== undefined
              ? extractModelCode(patch.nameSpec)
              : patch.modelCode !== undefined
                ? patch.modelCode
                : item.modelCode,
          unitPrice: patch.unitPrice !== undefined ? patch.unitPrice : item.unitPrice,
          priceSource:
            patch.unitPrice !== undefined
              ? patch.unitPrice.trim()
                ? "manual"
                : "none"
              : item.priceSource
        };

        if (patch.unitPrice !== undefined) {
          const amount = calculateAmount(nextItemBase.quantity, patch.unitPrice);
          const priceIssue =
            nextItemBase.modelCode && !patch.unitPrice.trim()
              ? {
                  level: "unmatched" as const,
                  message: "未匹配到价格，请手动输入"
                }
              : undefined;

          return {
            ...nextItemBase,
            amount,
            issues: {
              ...nextItemBase.issues,
              ...(patch.nameSpec !== undefined ? { nameSpec: undefined } : {}),
              ...(patch.quantity !== undefined ? { quantity: undefined } : {}),
              unitPrice: priceIssue,
              ...(amount ? { amount: undefined } : {})
            }
          };
        }

        const hydratedItem =
          patch.nameSpec !== undefined
            ? enrichItemWithDatabase(nextItemBase, current.customer, database)
            : {
                ...nextItemBase,
                amount: calculateAmount(nextItemBase.quantity, nextItemBase.unitPrice)
              };

        return {
          ...hydratedItem,
          issues: {
            ...hydratedItem.issues,
            ...(patch.nameSpec !== undefined ? { nameSpec: undefined } : {}),
            ...(patch.quantity !== undefined ? { quantity: undefined } : {}),
            ...(hydratedItem.amount ? { amount: undefined } : {})
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
    const parsed = parseLocalOrderInput(rawInput, database);
    setForm(parsed.form);
    setHasParsed(true);
    setFreightSelection(resolveFreightSelection(parsed.form.logistics));
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
    setFreightSelection(emptyFreightSelection());
    setEditingHistoryRecordId("");
    setActiveFieldKey("");
    setPastedImage((current) => {
      if (current?.url) {
        URL.revokeObjectURL(current.url);
      }
      return null;
    });
    setHint("内容已清空。");
    sessionStorage.removeItem(EDITOR_STATE_KEY);
    sessionStorage.removeItem(PENDING_HISTORY_ID_KEY);
  };

  const handleAddItem = () => {
    setForm((current) => {
      const newItem = enrichItemWithDatabase(createEmptyItem(), current.customer, database);
      const items = [...current.items, newItem];
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

  const handleCustomFreightCommit = () => {
    if (!form.logistics.trim()) return;
    window.setTimeout(() => {
      moveToFirstItemName();
    }, 100);
  };

  const handleFreightPrimaryChange = (value: string) => {
    if (!value) {
      setFreightSelection(emptyFreightSelection());
      updateFormField("logistics", "");
      return;
    }

    if (value === "/") {
      const nextSelection: FreightSelectionState = {
        primary: "/",
        secondary: "",
        customMode: "none",
        customText: ""
      };
      setFreightSelection(nextSelection);
      updateFormField("logistics", "/");
      window.setTimeout(() => {
        moveToFirstItemName();
      }, 120);
      return;
    }

    if (value === "其他") {
      setFreightSelection({
        primary: "其他",
        secondary: "",
        customMode: "primary",
        customText: ""
      });
      updateFormField("logistics", "");
      window.setTimeout(() => {
        fieldRefs.current.logistics?.focus({ preventScroll: true });
      }, 120);
      return;
    }

    setFreightSelection({
      primary: value as FreightSelectionState["primary"],
      secondary: "",
      customMode: "none",
      customText: ""
    });
    updateFormField("logistics", "");
  };

  const handleFreightSecondaryChange = (value: string) => {
    if (value === "返回") {
      setFreightSelection(emptyFreightSelection());
      updateFormField("logistics", "");
      return;
    }

    if (value === "其他") {
      setFreightSelection((current) => ({
        ...current,
        secondary: "其他",
        customMode: "secondary",
        customText: ""
      }));
      updateFormField("logistics", "");
      window.setTimeout(() => {
        fieldRefs.current.logistics?.focus({ preventScroll: true });
      }, 120);
      return;
    }

    const nextValue = buildFreightValue({
      ...freightSelection,
      secondary: value,
      customMode: "none",
      customText: ""
    });

    setFreightSelection((current) => ({
      ...current,
      secondary: value,
      customMode: "none",
      customText: ""
    }));
    updateFormField("logistics", nextValue);
    window.setTimeout(() => {
      moveToFirstItemName();
    }, 120);
  };

  const handleCustomFreightChange = (value: string) => {
    setFreightSelection((current) => {
      const nextSelection = {
        ...current,
        customText: value
      };
      updateFormField("logistics", buildFreightValue(nextSelection));
      return nextSelection;
    });
  };

  const scrollToIssueField = (fieldKey: string) => {
    focusFieldByKey(fieldKey);
  };

  const handleGenerate = () => {
    const issues = collectValidationIssues(form);

    if (issues.length > 0) {
      setHasParsed(true);
      setHint(issues[0].message);
      window.setTimeout(() => scrollToIssueField(issues[0].key), 120);
      return;
    }

    const syncResult = syncOrderToDatabase(form, database);
    const nextDatabase = syncResult.changed ? saveBusinessDatabase(syncResult.database) : database;
    const nextHint = syncResult.changed ? syncResult.summary : hint;

    if (syncResult.changed) {
      setDatabase(nextDatabase);
      setHint(nextHint);
    }

    const previewOrder: OrderForm = includeInLedger
      ? {
          ...form,
          billingSummary: {
            includeInLedger: true,
            previousBalance: customerHistoricalBalance,
            currentAmount: form.totalAmount,
            totalAmount: sumMoneyText(customerHistoricalBalance, form.totalAmount),
            relatedOrderId: editingHistoryRecordId
          }
        }
      : {
          ...form,
          billingSummary: undefined
        };

    const historyRecord = saveHistoryRecord(rawInput, previewOrder, editingHistoryRecordId || undefined);
    setEditingHistoryRecordId(historyRecord.id);

    if (includeInLedger) {
      upsertAutoBillingRecord({
        customerName: form.customer,
        amount: form.totalAmount,
        relatedOrderId: historyRecord.id,
        note: "订单累计到账单：¥ " + form.totalAmount,
        orderInfo: {
          rawInput,
          customer: form.customer,
          totalAmount: form.totalAmount,
          createdAtText: historyRecord.createdAtText
        }
      });
      previewOrder.billingSummary = {
        includeInLedger: true,
        previousBalance: customerHistoricalBalance,
        currentAmount: form.totalAmount,
        totalAmount: sumMoneyText(customerHistoricalBalance, form.totalAmount),
        relatedOrderId: historyRecord.id
      };
    } else {
      removeAutoBillingRecordByOrderId(historyRecord.id);
    }

    sessionStorage.setItem(PENDING_HISTORY_ID_KEY, historyRecord.id);

    const snapshot: EditorSnapshot = {
      rawInput,
      form: previewOrder,
      hasParsed: true,
      freightSelection,
      hint: nextHint,
      editingHistoryRecordId: historyRecord.id,
      includeInLedger
    };

    sessionStorage.setItem(EDITOR_STATE_KEY, JSON.stringify(snapshot));
    sessionStorage.setItem("invoice-preview-order", JSON.stringify(previewOrder));
    navigate("/preview", { state: { order: previewOrder } });
  };

  const customerIssue = getInputIssue(form.issues.customer, form.customer, fieldTips.customer);
  const phoneIssue = getInputIssue(form.issues.phone, form.phone, fieldTips.phone);
  const addressIssue = getInputIssue(form.issues.address, form.address, fieldTips.address);
  const logisticsIssue = getInputIssue(form.issues.logistics, form.logistics, fieldTips.logistics);

  return (
    <main className="page-shell">
      <div className="page phone-frame">
        <TopBar title="订单编辑" rightText="Phase 2 本地库" />

        <section className="hero-card">
          <div className="hero-card__heading hero-card__heading--stack hero-card__heading--editor-title">
            <div>
              <h2>快速录入报单</h2>
              <span className="status-chip">客户价优先</span>
            </div>
          </div>

          <div className="hero-card__quick-links hero-card__quick-links--editor">
            <button className="ghost-button btn-nav-history" type="button" onClick={() => navigate("/history")}>
              历史记录
            </button>
            <button className="ghost-button btn-nav-database" type="button" onClick={() => navigate("/database")}>
              数据库管理
            </button>
            <button className="ghost-button btn-nav-billing" type="button" onClick={() => navigate("/billing")}>
              账单
            </button>
          </div>

          <textarea
            className="prompt-box prompt-box--compact-editor"
            placeholder="请输入报单内容"
            value={rawInput}
            onChange={(event) => setRawInput(event.target.value)}
            onPaste={handlePaste}
          />

          {pastedImage ? (
            <div className="pasted-image-card">
              <div className="pasted-image-card__head">
                <span>已粘贴图片</span>
                <button
                  className="ghost-button btn-utility pasted-image-card__remove"
                  type="button"
                  onClick={handleRemovePastedImage}
                >
                  删除图片
                </button>
              </div>
              <img className="pasted-image-preview" src={pastedImage.url} alt="已粘贴图片预览" />
            </div>
          ) : null}

          <div className="action-row">
            <button className="secondary-button btn-action-soft" type="button" onClick={handleParse}>
              本地解析
            </button>
            <button className="ghost-button btn-utility" type="button" onClick={handleClear}>
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
                <span className="field-label">货运方式</span>
                <select
                  ref={registerFieldRef("logistics")}
                  className={`field-input field-select ${logisticsIssue ? "is-invalid" : ""} ${
                    activeFieldKey === "logistics" ? "field-attention" : ""
                  }`}
                  data-invalid={logisticsIssue ? "true" : "false"}
                  value={freightSelection.primary}
                  onChange={(event) => handleFreightPrimaryChange(event.target.value)}
                >
                  <option value="">请选择货运方式</option>
                  {freightPrimaryOptions.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>

                {showFreightSecondary ? (
                  <select
                    className={`field-input field-select field-input--sub ${logisticsIssue ? "is-invalid" : ""}`}
                    data-invalid={logisticsIssue ? "true" : "false"}
                    value={freightSelection.secondary}
                    onChange={(event) => handleFreightSecondaryChange(event.target.value)}
                  >
                    <option value="">请选择具体方式</option>
                    {secondaryFreightOptions.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                ) : null}

                {showFreightCustomInput ? (
                  <input
                    ref={registerFieldRef("logistics")}
                    className={`field-input field-input--sub ${logisticsIssue ? "is-invalid" : ""} ${
                      activeFieldKey === "logistics" ? "field-attention" : ""
                    }`}
                    data-invalid={logisticsIssue ? "true" : "false"}
                    placeholder={freightSelection.customMode === "primary" ? "请输入货运方式" : "请输入具体货运方式"}
                    value={freightSelection.customText}
                    onChange={(event) => handleCustomFreightChange(event.target.value)}
                    onBlur={handleCustomFreightCommit}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        handleCustomFreightCommit();
                      }
                    }}
                  />
                ) : null}

                {logisticsIssue ? <span className="field-error">{logisticsIssue.message}</span> : null}
              </div>

              <label className="field-block field-block--full">
                <span className="field-label">备注（可选）</span>
                <textarea
                  className="field-textarea field-textarea--compact"
                  rows={1}
                  value={form.remark}
                  onChange={(event) => updateFormField("remark", event.target.value)}
                />
              </label>
            </div>

            {shouldShowBillingPrompt ? (
              <div className="billing-alert-card">
                <div className="billing-alert-card__summary">
                  <strong>历史记账：¥ {customerHistoricalBalance}</strong>
                  <label className="billing-alert-card__check">
                    <input
                      type="checkbox"
                      checked={includeInLedger}
                      onChange={(event) => setIncludeInLedger(event.target.checked)}
                    />
                    <span>是否累计本次账单</span>
                  </label>
                </div>
                <p>默认不累计，只有勾选后，本次金额才会写入历史账单余额。</p>
              </div>
            ) : null}

            <div className="items-panel" ref={itemsPanelRef}>
              <div className="section-title-row">
                <h3>商品明细</h3>
                <button className="inline-button btn-action-soft" type="button" onClick={handleAddItem}>
                  添加一行
                </button>
              </div>

              <div className="items-header items-header--compact">
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
                  const priceSourceLabel = getPriceSourceLabel(item.priceSource);

                  return (
                    <div className="item-row item-row--compact" key={item.id}>
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
                        {item.modelCode ? <span className="table-meta">版号: {item.modelCode}</span> : null}
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
                        {priceSourceLabel ? <span className="table-badge">{priceSourceLabel}</span> : null}
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
                          className="delete-button delete-button--icon"
                          type="button"
                          aria-label="删除商品行"
                          title="删除"
                          onClick={() => handleDeleteItem(item.id)}
                        >
                          <span className="delete-button__icon" aria-hidden="true">
                            ×
                          </span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="total-box total-box--stack">
                <div className="total-box__line">
                  <span>本次合计金额</span>
                  <strong className="total-box__minor">¥ {form.totalAmount || "0"}</strong>
                </div>
                {includeInLedger && shouldShowBillingPrompt ? (
                  <div className="total-box__line total-box__line--emphasis">
                    <span>累计后的合计金额</span>
                    <strong>¥ {sumMoneyText(customerHistoricalBalance, form.totalAmount || "0")}</strong>
                  </div>
                ) : null}
              </div>
            </div>
          </section>
        ) : (
          <section className="empty-card">
            <h2>等待解析</h2>
            <p>先粘贴报单内容，再用本地数据库补全客户资料和价格。</p>
          </section>
        )}

        <div className="bottom-bar">
          <div className="bottom-bar__hint">{hint}</div>
          <button className="primary-button btn-action-primary" type="button" onClick={handleGenerate}>
            生成销货单
          </button>
        </div>
      </div>
    </main>
  );
}





