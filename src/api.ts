let csrf = "";
const inFlight = new Map<string, Promise<any>>();
export function api(path: string, method = "GET", body?: any): Promise<any> {
  if (method !== 'GET') { inFlight.clear(); return sendRequest(path, method, body); }
  const existing=inFlight.get(path);
  if(existing)return existing;
  const request=sendRequest(path,method,body).finally(()=>{if(inFlight.get(path)===request)inFlight.delete(path);});
  inFlight.set(path,request);
  return request;
}
async function sendRequest(path: string, method = "GET", body?: any) {
  const multipart = body instanceof FormData;
  const response = await fetch(`/api${path}`, {
    method,
    credentials: "same-origin",
    cache: 'no-store',
    headers: {
      "x-school-request": "1",
      ...(csrf ? { "x-csrf-token": csrf } : {}),
      ...(!multipart && body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? (multipart ? body : JSON.stringify(body)) : undefined,
  });

  const contentType = response.headers.get("content-type") || "";
  let data: any = null;
  if (contentType.includes("application/json")) {
    try {
      data = await response.json();
    } catch {
      data = null;
    }
  }

  if (!data) {
    let errorText = "";
    try {
      errorText = (await response.text()).trim();
    } catch {}

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(
          "Backend API endpoint not found (404). Backend server is not reachable on this domain.",
        );
      }
      throw new Error(
        errorText && errorText.length < 120 && !errorText.includes("<")
          ? errorText
          : `Server response error (${response.status}). Please check server logs.`,
      );
    }
    return {};
  }

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
