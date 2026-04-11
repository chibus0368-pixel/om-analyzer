/**
 * DealSignals Crexi extension — popup settings UI.
 *
 * Reads and writes chrome.storage.local. Keys mirror background.js defaults:
 *   baseUrl, apiKey, workspaceId, analysisType
 */

const DEFAULTS = {
  baseUrl: "https://www.dealsignals.app",
  apiKey: "",
  workspaceId: "default",
  analysisType: "retail",
};

const $ = (id) => document.getElementById(id);

function setStatus(msg, kind) {
  const el = $("status");
  el.textContent = msg || "";
  el.className = "status" + (kind ? " " + kind : "");
}

function load() {
  chrome.storage.local.get(DEFAULTS, (settings) => {
    $("baseUrl").value = settings.baseUrl || DEFAULTS.baseUrl;
    $("apiKey").value = settings.apiKey || "";
    $("workspaceId").value = settings.workspaceId || DEFAULTS.workspaceId;
    $("analysisType").value = settings.analysisType || DEFAULTS.analysisType;
  });
}

function save() {
  const baseUrl = $("baseUrl").value.trim() || DEFAULTS.baseUrl;
  const apiKey = $("apiKey").value.trim();
  const workspaceId = $("workspaceId").value.trim() || "default";
  const analysisType = $("analysisType").value || "retail";

  if (!apiKey) {
    setStatus("API key is required.", "err");
    return;
  }
  if (!/^https?:\/\//i.test(baseUrl)) {
    setStatus("Base URL must start with http(s)://", "err");
    return;
  }

  chrome.storage.local.set({ baseUrl, apiKey, workspaceId, analysisType }, () => {
    setStatus("Saved ✓", "ok");
    setTimeout(() => setStatus("", ""), 1800);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  load();
  $("save").addEventListener("click", save);
});
