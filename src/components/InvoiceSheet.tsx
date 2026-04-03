import { OrderForm, OrderItem } from "../types";

const FIXED_ROWS = 8;
const qrImageUrl = new URL("../../二维码.jpg", import.meta.url).href;

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
  rows?: SheetRow[];
  className?: string;
  dateText?: string;
};

export function buildInvoiceSheetRows(order: OrderForm, fixedRows = FIXED_ROWS): SheetRow[] {
  const items = order.items ?? [];
  if (items.length > fixedRows) {
    return items;
  }

  const blanks = Array.from({ length: Math.max(0, fixedRows - items.length) }).map((_, index) => ({
    id: `blank-${index}`,
    nameSpec: "",
    quantity: "",
    unitPrice: "",
    amount: ""
  }));

  return [...items, ...blanks].slice(0, fixedRows);
}

function buildDateText(dateText?: string) {
  if (dateText) {
    const date = new Date(dateText);
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString().slice(0, 10);
    }
  }

  const today = new Date();
  const yearText = String(today.getFullYear());
  const monthText = String(today.getMonth() + 1).padStart(2, "0");
  const dayText = String(today.getDate()).padStart(2, "0");
  return `${yearText}-${monthText}-${dayText}`;
}

export function InvoiceSheet({ order, rows, className = "", dateText }: InvoiceSheetProps) {
  const safeRows = rows ?? buildInvoiceSheetRows(order);
  const safeDateText = buildDateText(dateText);

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
          <strong>{safeDateText}</strong>
        </div>
      </div>

      <div className="sheet-table sheet-table--simple">
        <div className="sheet-row sheet-row--head">
          <span>名称及规格</span>
          <span>数量</span>
          <span>单价</span>
          <span>金额</span>
        </div>

        {safeRows.map((item) => (
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
          <span>货运方式</span>
          <strong>{order.logistics || "待填写"}</strong>
        </div>
        <div className="sheet-footer__block sheet-footer__block--address">
          <span>收货地址</span>
          <strong>{order.address || "待填写"}</strong>
        </div>
        {!order.billingSummary?.includeInLedger ? (
          <div className="sheet-footer__block sheet-footer__block--total">
            <span>合计金额</span>
            <strong>¥ {order.totalAmount}</strong>
          </div>
        ) : null}
        <div className="sheet-footer__block sheet-footer__block--remark">
          <span>备注</span>
          <strong>{order.remark || "无"}</strong>
        </div>
      </div>

      {order.billingSummary?.includeInLedger ? (
        <div className="sheet-footer sheet-footer--simple sheet-footer--billing">
          <div className="sheet-footer__block">
            <span>历史金额</span>
            <strong>¥ {order.billingSummary.previousBalance}</strong>
          </div>
          <div className="sheet-footer__block">
            <span>本次金额</span>
            <strong>¥ {order.billingSummary.currentAmount}</strong>
          </div>
          <div className="sheet-footer__block sheet-footer__block--total">
            <span>合计金额</span>
            <strong>¥ {order.billingSummary.totalAmount}</strong>
          </div>
        </div>
      ) : null}

      <div className="invoice-simple-bottom">
        <p>{companyInfo.business}</p>
        <p>{companyInfo.notice}</p>
      </div>
    </div>
  );
}


