// Public build-time configuration only. Keep the literal access so Next.js
// includes this value in the browser bundle during next build.
export function getRealtimeUrl() {
  const production = process.env.NODE_ENV === "production";
  const value =
    process.env.NEXT_PUBLIC_REALTIME_URL?.trim() ||
    (production ? "" : "ws://localhost:3001");
  const url = URL.canParse(value) ? new URL(value) : null;
  if (
    !url ||
    !["ws:", "wss:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.hash ||
    (production &&
      (url.protocol !== "wss:" ||
        url.hostname === "localhost" ||
        url.hostname.endsWith(".localhost") ||
        url.hostname === "[::1]" ||
        url.hostname === "0.0.0.0" ||
        url.hostname.startsWith("127.")))
  )
    throw new Error(
      "Multijogador indisponível: endereço do servidor não configurado corretamente.",
    );
  return url.toString();
}
