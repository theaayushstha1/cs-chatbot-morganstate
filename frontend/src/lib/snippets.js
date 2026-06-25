// Personal code snippets ("My Snippets"). Stored in localStorage as the
// synchronous source of truth + offline cache, and synced to the backend in the
// background when the user is signed in (so they follow the account across
// devices). Each snippet: { id, name, language, code, updatedAt }.
//
// The public CRUD functions stay SYNCHRONOUS (callers are unchanged): they read/
// write localStorage immediately and fire the matching API call in the
// background. syncSnippetsFromServer() merges the server copy into the cache.

import { getApiBase } from "./apiBase";

const STORAGE_KEY = "csnav.snippets";
const MAX_SNIPPETS = 50;
const API_BASE = getApiBase();

function authHeaders() {
  const token = (() => {
    try { return window.localStorage.getItem("token"); } catch { return null; }
  })();
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : null;
}

function safeParse(raw) {
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function readCache() {
  try {
    return safeParse(window.localStorage.getItem(STORAGE_KEY) || "[]")
      .filter(s => s && typeof s.id === "string");
  } catch {
    return [];
  }
}

function writeCache(items) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_SNIPPETS)));
  } catch {
    /* storage full / unavailable — non-fatal */
  }
}

// ── Public CRUD (synchronous; background-synced) ────────────────────────────

// Returns all cached snippets, newest first.
export function listSnippets() {
  return readCache().sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
}

// Create or update. Writes the cache immediately and pushes to the server in the
// background (best-effort — local copy is authoritative for the current device).
export function saveSnippet({ id, name, language, code }) {
  const items = listSnippets();
  const updatedAt = new Date().toISOString();
  const existingIndex = id ? items.findIndex(s => s.id === id) : -1;
  const finalId = id && existingIndex >= 0
    ? id
    : `snip-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const record = {
    id: finalId,
    name: (name || "Untitled snippet").trim().slice(0, 80) || "Untitled snippet",
    language: language || "Python",
    code: code || "",
    updatedAt,
  };
  if (existingIndex >= 0) items[existingIndex] = record;
  else items.unshift(record);
  writeCache(items);

  // Background push to the server (no await — UI already has the local copy).
  const headers = authHeaders();
  if (headers) {
    fetch(`${API_BASE}/api/coding/snippets`, {
      method: "POST",
      headers,
      body: JSON.stringify({ client_id: finalId, name: record.name, language: record.language, code: record.code }),
    }).catch(() => { /* offline — local cache keeps it */ });
  }
  return record;
}

export function deleteSnippet(id) {
  writeCache(readCache().filter(s => s.id !== id));
  const headers = authHeaders();
  if (headers) {
    fetch(`${API_BASE}/api/coding/snippets/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers,
    }).catch(() => { /* offline — will re-reconcile on next sync */ });
  }
}

export function getSnippet(id) {
  return listSnippets().find(s => s.id === id) || null;
}

// ── Server sync ─────────────────────────────────────────────────────────────

// Pull the server copy and merge with the local cache (newest-wins per id, then
// any local-only snippets are pushed up). Returns the merged list. Call this on
// app load (after auth) to bring the device in line with the account.
export async function syncSnippetsFromServer() {
  const headers = authHeaders();
  if (!headers) return listSnippets();
  let serverItems = [];
  try {
    const res = await fetch(`${API_BASE}/api/coding/snippets`, { headers });
    if (!res.ok) return listSnippets();
    const data = await res.json();
    serverItems = Array.isArray(data.items) ? data.items : [];
  } catch {
    return listSnippets(); // offline — keep the local cache
  }

  const local = readCache();
  const byId = new Map();
  // Server first, then local overrides only if the local copy is newer.
  for (const s of serverItems) byId.set(s.id, s);
  const localOnly = [];
  for (const s of local) {
    const existing = byId.get(s.id);
    if (!existing) { byId.set(s.id, s); localOnly.push(s); }
    else if (new Date(s.updatedAt || 0) > new Date(existing.updatedAt || 0)) {
      byId.set(s.id, s); localOnly.push(s); // local is newer → push it up
    }
  }
  const merged = [...byId.values()].sort(
    (a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0)
  );
  writeCache(merged);

  // Push local-only / locally-newer snippets to the server (best-effort).
  for (const s of localOnly) {
    fetch(`${API_BASE}/api/coding/snippets`, {
      method: "POST",
      headers,
      body: JSON.stringify({ client_id: s.id, name: s.name, language: s.language, code: s.code }),
    }).catch(() => {});
  }
  return merged;
}

// ── File helpers (unchanged) ────────────────────────────────────────────────

// Extract runnable source from an uploaded file. Plain text (.py/.js/.txt/...) is
// returned as-is; a Jupyter notebook (.ipynb) has its code cells concatenated.
export function extractCodeFromFile(filename, text) {
  const lower = String(filename || "").toLowerCase();
  if (lower.endsWith(".ipynb")) {
    try {
      const nb = JSON.parse(text);
      const cells = Array.isArray(nb.cells) ? nb.cells : [];
      const codeBlocks = cells
        .filter(c => c.cell_type === "code")
        .map(c => (Array.isArray(c.source) ? c.source.join("") : String(c.source || "")))
        .filter(Boolean);
      return codeBlocks.join("\n\n# --- next cell ---\n\n");
    } catch {
      return text; // not valid JSON — fall back to raw
    }
  }
  return text;
}

// Best-effort language guess from a filename extension.
export function languageFromFilename(filename) {
  const lower = String(filename || "").toLowerCase();
  if (lower.endsWith(".py") || lower.endsWith(".ipynb")) return "Python";
  if (lower.endsWith(".js") || lower.endsWith(".jsx") || lower.endsWith(".ts") || lower.endsWith(".tsx")) return "JavaScript";
  if (lower.endsWith(".java")) return "Java";
  if (lower.endsWith(".cpp") || lower.endsWith(".cc") || lower.endsWith(".c") || lower.endsWith(".h") || lower.endsWith(".hpp")) return "C++";
  return null;
}
