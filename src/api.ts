let csrf = "";
export async function api(path: string, method = "GET", body?: any) {
  const multipart = body instanceof FormData;
  const response = await fetch(`/api${path}`, {
    method,
    credentials: "same-origin",
    headers: {
      "x-school-request": "1",
      ...(csrf ? { "x-csrf-token": csrf } : {}),
      ...(!multipart && body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? (multipart ? body : JSON.stringify(body)) : undefined,
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error || "Something went wrong. Please try again.");
  if (data.csrf) csrf = data.csrf;
  if (!["GET", "HEAD"].includes(method) && !path.startsWith('/auth/') && !path.startsWith('/notifications') && path !== '/portal-events')
    window.dispatchEvent(new Event('school-notifications-changed'));
  return data;
}
export const rupees = (value: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format((value || 0) / 100);
export const today = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
