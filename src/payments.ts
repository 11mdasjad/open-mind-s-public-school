import { api } from "./api";
export async function checkout(
  invoiceId: string,
  notify: (message: string) => void,
  refresh: () => void,
) {
  if (!(window as any).Razorpay)
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.onload = () => resolve();
      script.onerror = () =>
        reject(
          new Error("Payment checkout could not be loaded. Please retry."),
        );
      document.head.append(script);
    });
  const order = await api(`/fees/${invoiceId}/order`, "POST", {});
  const instance = new (window as any).Razorpay({
    key: order.key,
    order_id: order.orderId,
    amount: order.amount,
    currency: order.currency,
    name: "Open Mind's Public School",
    description: "School fee payment",
    theme: { color: "#344332" },
    handler: async (result: any) => {
      try {
        const verified = await api("/payments/verify", "POST", result);
        notify(
          verified.reconciliationRequired
            ? "Payment captured; school accounts must reconcile this payment."
            : "Payment verified and receipt saved.",
        );
        refresh();
      } catch (e: any) {
        notify(
          `${e.message} Your payment will also be checked through the gateway webhook.`,
        );
      }
    },
    modal: {
      ondismiss: () =>
        notify("Checkout closed. No payment success has been assumed."),
    },
  });
  instance.on("payment.failed", () =>
    notify("Payment was not completed. Check your bank before retrying."),
  );
  instance.open();
}
