export function getApiBase() {
  const env = (import.meta?.env?.VITE_API_BASE_URL || "").trim();
  if (env) return env.replace(/\/$/, "");

  // dev: vite (5173) or docker front (3000) -> backend on 5000
  return `${window.location.protocol}//${window.location.hostname}:5000`;
}
