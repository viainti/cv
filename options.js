import { DEFAULT_MODEL, DEFAULT_OPENROUTER_API_KEY } from "./config.js";

const apiKeyEl = document.getElementById("apiKey");
const modelEl = document.getElementById("model");
const extraPromptEl = document.getElementById("extraPrompt");
const saveSettingsBtn = document.getElementById("saveSettings");
const statusEl = document.getElementById("status");

init();

async function init() {
  const { openrouterApiKey = DEFAULT_OPENROUTER_API_KEY, model = DEFAULT_MODEL, extraPrompt = "" } =
    await chrome.storage.local.get(["openrouterApiKey", "model", "extraPrompt"]);

  apiKeyEl.value = openrouterApiKey;
  modelEl.value = model;
  extraPromptEl.value = extraPrompt;
}

saveSettingsBtn.addEventListener("click", async () => {
  await chrome.storage.local.set({
    openrouterApiKey: apiKeyEl.value.trim() || DEFAULT_OPENROUTER_API_KEY,
    model: modelEl.value.trim() || DEFAULT_MODEL,
    extraPrompt: extraPromptEl.value.trim()
  });

  statusEl.textContent = "Ajustes guardados correctamente.";
  setTimeout(() => {
    statusEl.textContent = "";
  }, 1800);
});
