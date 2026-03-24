import { OrderItem } from "./types";

export const calculateAmount = (quantity: string, unitPrice: string) => {
  const qty = Number(quantity);
  const price = Number(unitPrice);

  if (quantity && unitPrice && Number.isFinite(qty) && Number.isFinite(price)) {
    return String(qty * price);
  }

  return "";
};

export const calculateTotalAmount = (items: OrderItem[]) =>
  String(
    items.reduce((sum, item) => {
      const amount = Number(item.amount || 0);
      return sum + (Number.isFinite(amount) ? amount : 0);
    }, 0)
  );
