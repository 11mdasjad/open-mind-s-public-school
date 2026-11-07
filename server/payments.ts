import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";
import { db } from "./db";
export const paymentsEnabled = () =>
  Boolean(
    process.env.RAZORPAY_KEY_ID &&
    process.env.RAZORPAY_KEY_SECRET &&
    process.env.RAZORPAY_WEBHOOK_SECRET,
  );
export function validSignature(
  value: string | Buffer,
  signature: string,
  secret: string,
) {
  if (!/^[a-f0-9]{64}$/i.test(signature)) return false;
  const digest = createHmac("sha256", secret).update(value).digest();
  return timingSafeEqual(digest, Buffer.from(signature, "hex"));
}
export async function gateway(path: string, method = "GET", body?: unknown) {
  if (!paymentsEnabled())
    throw Object.assign(
      new Error(
        "Online payments are not configured. Please contact school accounts.",
      ),
      { status: 503 },
    );
  const response = await fetch(`https://api.razorpay.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Basic ${Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  const result = await response.json();
  if (!response.ok)
    throw Object.assign(
      new Error("Payment provider could not complete the request."),
      { status: 502 },
    );
  return result;
}
export async function reconcilePayment(orderId: string, paymentId: string) {
  if (
    !/^order_[a-zA-Z0-9]+$/.test(orderId) ||
    !/^pay_[a-zA-Z0-9]+$/.test(paymentId)
  )
    throw Object.assign(new Error("Invalid payment identifiers."), {
      status: 400,
    });
  const payment = await gateway(`/payments/${paymentId}`);
  const order = await db.gatewayOrder.findUnique({ where: { id: orderId } });
  if (
    !order ||
    payment.order_id !== order.id ||
    payment.amount !== order.amount ||
    payment.currency !== "INR" ||
    payment.status !== "captured" ||
    payment.captured !== true
  )
    throw Object.assign(
      new Error(
        "Payment is not captured and verified yet. Please retry after confirmation.",
      ),
      { status: 409 },
    );
  return db.$transaction(
    async (tx) => {
      const prior = await tx.payment.findUnique({
        where: { reference: paymentId },
      });
      if (prior) return prior;
      const current = await tx.gatewayOrder.findUniqueOrThrow({
        where: { id: order.id },
        include: {
          invoice: { include: { payments: { include: { refunds: true } } } },
        },
      });
      const balance =
        current.invoice.amount -
        current.invoice.payments.reduce(
          (s, p) => s + p.amount - p.refunds.reduce((a, r) => a + r.amount, 0),
          0,
        );
      if (balance < order.amount) {
        await tx.gatewayOrder.update({
          where: { id: order.id },
          data: { status: "Reconciliation required", paymentId },
        });
        return { reconciliationRequired: true };
      }
      const record = await tx.payment.create({
        data: {
          invoiceId: order.invoiceId,
          amount: order.amount,
          method: "Razorpay",
          reference: paymentId,
          recordedBy: "razorpay-verified",
          receipt: `RCT-${randomBytes(8).toString("hex").toUpperCase()}`,
        },
      });
      await tx.gatewayOrder.update({
        where: { id: order.id },
        data: { status: "Captured", paymentId },
      });
      await tx.auditLog.create({
        data: {
          actorId: "razorpay",
          action: "verified-payment",
          entity: "payment",
          entityId: record.id,
        },
      });
      return record;
    },
    { isolationLevel: "Serializable" },
  );
}
