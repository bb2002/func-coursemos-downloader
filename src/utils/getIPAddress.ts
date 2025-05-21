import { HttpRequest } from "@azure/functions";

export default function getIPAddress(req: HttpRequest): string | null {
  const forwardedFor =
    req.headers.get("x-forwarded-for") || req.headers.get("X-Forwarded-For");

  if (!forwardedFor) {
    return null;
  }

  const ip = forwardedFor.split(",")[0]?.trim();
  return ip || null;
}
