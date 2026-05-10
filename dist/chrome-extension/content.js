if (window.__trcvastianContentLoaded) {
  throw new Error("TRCVASTIAN content script already loaded.");
}
window.__trcvastianContentLoaded = true;

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "AUTOFILL_FIELDS") {
    handleAutofillRequest({
      fields: message.fields || [],
      cvText: message.cvText || "",
      autofillProfile: message.autofillProfile || {},
      cvFileDataUrl: message.cvFileDataUrl || "",
      cvFileName: message.cvFileName || "",
      cvFileType: message.cvFileType || ""
    })
      .then((result) => sendResponse({ success: true, result }))
      .catch((error) => sendResponse({ success: false, reason: error instanceof Error ? error.message : "No se pudo autocompletar." }));
    return true;
  }

  if (message?.type === "SCRAPE_JOB_CONTEXT") {
    sendResponse(scrapeJobContext());
    return true;
  }

  if (message?.type === "SCRAPE_JOB_LIST") {
    sendResponse(scrapeJobList());
    return true;
  }

  if (message?.type === "EXTRACT_APPLY_DESTINATION") {
    sendResponse(extractApplyDestination());
    return true;
  }

  if (message?.type === "HIGHLIGHT_LINKEDIN_RECOMMENDATIONS") {
    highlightLinkedInRecommendations(message.recommendations || []);
    sendResponse({ success: true });
    return true;
  }

  if (message?.type === "EXTERNAL_JOB_ANALYSIS") {
    handleExternalJobAnalysis(message.analysis, message.jobUrl, message.applyLabel);
    sendResponse({ success: true });
    return true;
     }
   });

// ─── Autosave & Submission Tracking ─────────────────────────────────────────
let autosaveTimer = null;
const AUTOSAVE_DEBOUNCE_MS = 1500;
const DRAFT_STORAGE_KEY = "trcvastian-draft-";
const HISTORY_STORAGE_KEY = "trcvastian-history";
const EXTERNAL_AUTOFILL_CONTEXTS_KEY = "externalAutofillContexts";

function getContextKey() {
  const hostname = window.location.hostname;
  const path = window.location.pathname;
  const formId = document.querySelector("form")?.id || "default";
  return `${hostname}${path}#${formId}`;
}

function collectFormData() {
  const data = {};
  const fields = Array.from(document.querySelectorAll("input, textarea, select"))
    .filter((el) => el.type !== "hidden" && el.type !== "submit" && el.type !== "button");

  for (const field of fields) {
    const key = field.name || field.id || field.placeholder || `field-${data.length}`;
    const tag = field.tagName.toLowerCase();
    const type = (field.getAttribute("type") || tag).toLowerCase();

    if (type === "checkbox" || type === "radio") {
      if (field.checked) data[key] = true;
    } else if (tag === "select") {
      data[key] = field.value || null;
    } else {
      const val = field.value;
      if (val && String(val).trim()) data[key] = String(val).trim();
    }
  }
  return data;
}

async function saveDraft(force = false) {
  const formData = collectFormData();
  if (!force && Object.keys(formData).length === 0) return;

  const contextKey = getContextKey();
  const draft = {
    contextKey,
    url: window.location.href,
    title: document.title,
    data: formData,
    savedAt: Date.now(),
  };

  try {
    const existing = await chrome.storage.local.get([DRAFT_STORAGE_KEY]);
    const allDrafts = existing[DRAFT_STORAGE_KEY] || {};
    allDrafts[contextKey] = draft;
    await chrome.storage.local.set({ [DRAFT_STORAGE_KEY]: allDrafts });
  } catch (e) {
    console.warn("Autosave failed:", e);
  }
}

async function loadDraft() {
  try {
    const stored = await chrome.storage.local.get([DRAFT_STORAGE_KEY]);
    const allDrafts = stored[DRAFT_STORAGE_KEY] || {};
    const draft = allDrafts[getContextKey()];
    if (!draft?.data) return false;

    for (const [fieldKey, value] of Object.entries(draft.data)) {
      let field = document.querySelector(`[name="${fieldKey}"]`) ||
                  document.getElementById(fieldKey);
      if (!field) continue;
      const tag = field.tagName.toLowerCase();
      const type = (field.getAttribute("type") || tag).toLowerCase();

      if (type === "checkbox" || type === "radio") {
        field.checked = Boolean(value);
        dispatch(field);
      } else if (tag === "select") {
        field.value = String(value || "");
        dispatch(field);
      } else {
        field.value = String(value || "");
        dispatch(field);
      }
    }
    return true;
  } catch (e) {
    console.warn("Draft load failed:", e);
  }
  return false;
}

async function clearDraft() {
  try {
    const stored = await chrome.storage.local.get([DRAFT_STORAGE_KEY]);
    const allDrafts = stored[DRAFT_STORAGE_KEY] || {};
    delete allDrafts[getContextKey()];
    await chrome.storage.local.set({ [DRAFT_STORAGE_KEY]: allDrafts });
  } catch (e) {
    console.warn("Draft clear failed:", e);
  }
}

async function recordSubmission(jobContext, method = "autofill") {
  const fromLinkedInFlow = isLinkedInHost() || await hasLinkedInExternalAutofillContext();
  if (!fromLinkedInFlow) {
    return false;
  }

  const record = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    url: window.location.href,
    title: document.title,
    jobTitle: jobContext?.title || "Sin título",
    company: jobContext?.company || "Sin empresa",
    appliedAt: Date.now(),
    method,
    cvFileName: ""
  };

  try {
    const stored = await chrome.storage.local.get([HISTORY_STORAGE_KEY]);
    const history = stored[HISTORY_STORAGE_KEY] || [];
    history.unshift(record);
    await chrome.storage.local.set({ [HISTORY_STORAGE_KEY]: history });

    chrome.runtime.sendMessage({
      type: "RECORD_MANUAL_SUBMISSION",
      jobUrl: record.url,
      jobTitle: record.jobTitle,
      company: record.company,
      method,
      sourcePortal: "linkedin"
    }).catch(() => {});
    return true;
  } catch (e) {
    console.warn("Submission record failed:", e);
  }

  return false;
}

function scheduleAutosave() {
  if (autosaveTimer) clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => saveDraft(false), AUTOSAVE_DEBOUNCE_MS);
}

function enableAutosave() {
  document.addEventListener("input", (e) => {
    const target = e.target;
    if (!target) return;
    const tag = target.tagName.toLowerCase();
    const type = (target.getAttribute("type") || tag).toLowerCase();
    if ((tag === "input" && ["text","email","tel","url","search","checkbox","radio"].includes(type)) ||
        tag === "textarea" || tag === "select") {
      scheduleAutosave();
    }
  }, { capture: true });
}

function enableSubmissionTracking() {
  document.addEventListener("submit", async (e) => {
    const form = e.target;
    if (!(form instanceof HTMLFormElement)) return;
    const jobContext = scrapeJobContext();
    await recordSubmission(jobContext, "manual");
    await clearDraft();
    setTimeout(() => saveDraft(true), 2000);
  }, { capture: true });

  document.addEventListener("click", async (e) => {
    const target = e.target;
    if (!target) return;
    const btn = target.closest("button, input[type='submit'], input[type='button']");
    if (!btn) return;
    const txt = (btn.textContent || "").toLowerCase();
    if (txt.includes("enviar") || txt.includes("submit") || txt.includes("aplicar") || txt.includes("postular")) {
      const jobContext = scrapeJobContext();
      await recordSubmission(jobContext, "click");
      await clearDraft();
    }
  }, { capture: true });
}

function stage4Init() {
  enableAutosave();
  enableSubmissionTracking();
  loadDraft().then((restored) => {
    if (restored) console.info("[TRCVASTIAN] Borrador restaurado.");
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => setTimeout(stage4Init, 500));
} else {
  setTimeout(stage4Init, 500);
}

initTrcvastianScan();
initGlobalAutofillCta();
initExternalFormAutofill();
initLinkedInInlineAutoApply();

function hasExtensionRuntime() {
  return typeof chrome !== "undefined" && typeof chrome?.runtime?.sendMessage === "function";
}

async function sendRuntimeMessage(message) {
  if (!hasExtensionRuntime()) {
    scheduleExtensionReconnect();
    throw new Error("Reconectando la extensión...");
  }

  try {
    return await chrome.runtime.sendMessage(message);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error || "");
    if (/Extension context invalidated|Receiving end does not exist|Could not establish connection/i.test(reason)) {
      scheduleExtensionReconnect();
      throw new Error("Reconectando la extensión...");
    }
    throw error;
  }
}

function scheduleExtensionReconnect() {
  try {
    if (window.sessionStorage.getItem("trcvastian-reconnect-pending") === "1") {
      return;
    }

    window.sessionStorage.setItem("trcvastian-reconnect-pending", "1");
    window.setTimeout(() => {
      try {
        window.sessionStorage.removeItem("trcvastian-reconnect-pending");
      } catch {
        // Ignore storage access errors.
      }
      window.location.reload();
    }, 220);
  } catch {
    window.setTimeout(() => window.location.reload(), 220);
  }
}

function isLinkedInHost() {
  return window.location.hostname.includes("linkedin.com");
}

function normalizeContextUrl(value) {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }

  try {
    const url = new URL(text, window.location.href);
    url.hash = "";
    return url.toString();
  } catch {
    return text.replace(/#.*$/, "");
  }
}

function buildContextVariants(value) {
  const normalized = normalizeContextUrl(value);
  if (!normalized) {
    return [];
  }

  const variants = new Set([normalized]);
  try {
    const url = new URL(normalized);
    variants.add(`${url.origin}${url.pathname}`);
    variants.add(url.origin);
  } catch {
    // Ignore parse issues.
  }

  return [...variants];
}

function hasLinkedInUtmSource(value = window.location.href) {
  try {
    const url = new URL(String(value || ""), window.location.href);
    const utmSource = String(url.searchParams.get("utm_source") || "").trim().toLowerCase();
    return utmSource === "linkedin";
  } catch {
    return false;
  }
}

async function hasLinkedInExternalAutofillContext() {
  if (isLinkedInHost()) {
    return true;
  }

  if (hasLinkedInUtmSource()) {
    return true;
  }

  try {
    const { [EXTERNAL_AUTOFILL_CONTEXTS_KEY]: stored = {} } = await chrome.storage.local.get([EXTERNAL_AUTOFILL_CONTEXTS_KEY]);
    const variants = buildContextVariants(window.location.href);
    return variants.some((variant) => stored?.[variant]?.source === "linkedin");
  } catch {
    return false;
  }
}

function initLinkedInInlineAutoApply() {
  if (!window.location.hostname.includes("linkedin.com")) {
    return;
  }

  const tryMount = () => {
    if (!document.body) {
      return;
    }
    ensureLinkedInAutoApplyStyles();
    mountLinkedInInlineAutoApplyButton();
  };

  tryMount();
  window.addEventListener("load", tryMount);
  window.setTimeout(tryMount, 600);
  window.setTimeout(tryMount, 1600);

  const observer = new MutationObserver(() => {
    tryMount();
  });

  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
  }
}

function mountLinkedInInlineAutoApplyButton() {
  const applyButton =
    document.querySelector("button.jobs-apply-button") ||
    document.querySelector("a.jobs-apply-button") ||
    document.querySelector("button[data-live-test-job-apply-button]") ||
    document.querySelector("a[data-live-test-job-apply-button]");

  if (!(applyButton instanceof HTMLElement)) {
    return;
  }

  const actionRow =
    applyButton.closest(".jobs-s-apply")?.parentElement ||
    applyButton.parentElement?.parentElement ||
    applyButton.parentElement;

  if (!(actionRow instanceof HTMLElement)) {
    return;
  }

  const existing = actionRow.querySelector("#trcvastian-linkedin-autoapply");
  if (existing) {
    return;
  }

  const button = document.createElement("button");
  button.id = "trcvastian-linkedin-autoapply";
  button.type = "button";
  button.className = "trcvastian-linkedin-autoapply-btn";
  button.innerHTML = `
    <span class="trcvastian-linkedin-autoapply-dot" aria-hidden="true"></span>
    <span>AutoPostular</span>
  `;

  button.addEventListener("click", async () => {
    const targetUrl = resolveCurrentLinkedInJobUrl();
    if (!targetUrl) {
      button.classList.add("is-error");
      button.querySelector("span:last-child").textContent = "Sin vacante";
      window.setTimeout(() => {
        button.classList.remove("is-error");
        button.querySelector("span:last-child").textContent = "AutoPostular";
      }, 1600);
      return;
    }

    button.disabled = true;
    button.classList.add("is-loading");
    button.querySelector("span:last-child").textContent = "Postulando...";

    try {
      const response = await sendRuntimeMessage({
        type: "APPLICATION_FLOW_REQUEST",
        jobUrl: targetUrl
      });

      if (!response?.success) {
        throw new Error(response?.reason || "No se pudo postular.");
      }

      button.classList.remove("is-loading");
      button.classList.add("is-success");
      button.querySelector("span:last-child").textContent = "Abierto";
      window.setTimeout(() => {
        button.disabled = false;
        button.classList.remove("is-success");
        button.querySelector("span:last-child").textContent = "AutoPostular";
      }, 1800);
    } catch {
      button.disabled = false;
      button.classList.remove("is-loading");
      button.classList.add("is-error");
      button.querySelector("span:last-child").textContent = "Reintentar";
      window.setTimeout(() => {
        button.classList.remove("is-error");
        button.querySelector("span:last-child").textContent = "AutoPostular";
      }, 1800);
    }
  });

  if (applyButton.parentNode === actionRow && actionRow.contains(applyButton)) {
    actionRow.insertBefore(button, applyButton);
  } else {
    actionRow.appendChild(button);
  }
}

function resolveCurrentLinkedInJobUrl() {
  if (isLinkedInJobViewPage()) {
    return normalizeJobUrl(window.location.href);
  }

  const topCardLink = document.querySelector(".job-details-jobs-unified-top-card__job-title a[href*='/jobs/view/']");
  if (topCardLink instanceof HTMLAnchorElement && topCardLink.href) {
    return normalizeJobUrl(topCardLink.href);
  }

  const activeCardLink =
    document.querySelector(".jobs-search-results-list .job-card-list--active a[href*='/jobs/view/']") ||
    document.querySelector(".jobs-search-results-list .jobs-search-results__list-item--active a[href*='/jobs/view/']") ||
    document.querySelector(".jobs-search-results-list [aria-current='true'] a[href*='/jobs/view/']") ||
    document.querySelector(".jobs-search-results-list .scaffold-layout__list-item--active a[href*='/jobs/view/']");

  if (activeCardLink instanceof HTMLAnchorElement && activeCardLink.href) {
    return normalizeJobUrl(activeCardLink.href);
  }

  const current = scrapeJobContext();
  const list = scrapeJobList();
  const matched = list.find((item) => {
    const sameTitle = cleanText(item.title || "") === cleanText(current.title || "");
    const sameCompany = cleanText(item.company || "") === cleanText(current.company || "");
    return sameTitle && sameCompany && item.url;
  });

  return matched?.url ? normalizeJobUrl(matched.url) : "";
}

async function handleAutofillRequest({ fields, cvText, autofillProfile, cvFileDataUrl, cvFileName, cvFileType }) {
  ensureAutofillAssistantStyles();

  const profile = normalizeAutofillProfile(autofillProfile, cvText);
  const overlay = window.location.hostname.includes("linkedin.com")
    ? createSilentAutofillOverlay()
    : createAutofillAssistantOverlay();
  const jobContext = scrapeJobContext();
  let aggregateSummary = [];
  let lastStep = null;
  let advanced = false;
  let submitted = false;
  let actionLabel = "";
  let autoStepCount = 0;
  let language = "en";

  overlay.setHeadline(buildApplicationHeadline(jobContext));

  for (let stepIndex = 0; stepIndex < 8; stepIndex += 1) {
    const stepResult = await autofillCurrentStep({
      fields,
      cvText,
      profile,
      cvFileDataUrl,
      cvFileName,
      cvFileType,
      overlay
    });

    language = stepResult.language;
    lastStep = stepResult;
    aggregateSummary = mergeFilledSummary(aggregateSummary, stepResult.summary);

    const actionScope = window.location.hostname.includes("linkedin.com")
      ? findLinkedInEasyApplyRoot()
      : null;

    if (!shouldAutoAdvanceForm(stepResult, actionScope || document)) {
      const validationErrors = preValidateAllFields();
      if (validationErrors.length > 0) {
        overlay.setStatus(`${validationErrors.length} error(es) encontrado(s). Corrigiendo...`);
        await fixValidationErrors(validationErrors, profile, cvText, language, overlay);
      }
      break;
    }

    const action = findPrimaryFormAction(stepResult.unresolved, actionScope || document);
    if (!action) {
      break;
    }

    actionLabel = action.label;
    overlay.setStatus(`${language === "es" ? "Continuando automáticamente" : "Continuing automatically"}: ${action.label}`);
    let progressed = await triggerFormProgression(action, overlay, language);
    if (!progressed && window.location.hostname.includes("linkedin.com")) {
      const fixedErrors = await resolveLinkedInValidationErrors({
        profile,
        cvText,
        language,
        overlay
      });
      if (fixedErrors.length) {
        overlay.setStatus(language === "es" ? "Corrigiendo errores del modal de LinkedIn..." : "Fixing LinkedIn modal errors...");
        await delayMs(250);
        progressed = await triggerFormProgression(action, overlay, language);
      }
    }

    if (!progressed) {
      break;
    }

    advanced = true;
    autoStepCount += 1;
    submitted = action.kind === "submit";
    await delayMs(900);
  }

  const finalStep = lastStep || (await autofillCurrentStep({
    fields,
    cvText,
    profile,
    cvFileDataUrl,
    cvFileName,
    cvFileType,
    overlay
  }));
  aggregateSummary = mergeFilledSummary(aggregateSummary, finalStep.summary);
  overlay.setHeadline(buildApplicationHeadline(jobContext));
  
  const validationErrors = preValidateAllFields();
  if (validationErrors.length > 0) {
    await fixValidationErrors(validationErrors, profile, cvText, language, overlay);
  }
  
  overlay.setStatus(buildRecommendationStatus({
    summary: aggregateSummary,
    unresolved: finalStep.unresolved,
    dangerousFields: finalStep.dangerousFields,
    fileFields: finalStep.fileFields,
    cvFileName,
    language
  }));
  overlay.renderScore(buildFormScore({
    fillableFields: finalStep.fillableFields,
    summary: aggregateSummary,
    unresolved: finalStep.unresolved,
    dangerousFields: finalStep.dangerousFields
  }));
  overlay.renderSummary(aggregateSummary, finalStep.unresolved, buildApplyRecommendations({
    jobContext,
    summary: aggregateSummary,
    unresolved: finalStep.unresolved,
    dangerousFields: finalStep.dangerousFields,
    fileFields: finalStep.fileFields,
    cvFileName,
    language
  }));
  mountMagicFieldButtons(profile, cvText, language);

  return {
    filled: aggregateSummary,
    unresolved: finalStep.unresolved.map((field) => field.label || field.name || field.type || "Campo"),
    language,
    score: buildFormScore({
      fillableFields: finalStep.fillableFields,
      summary: aggregateSummary,
      unresolved: finalStep.unresolved,
      dangerousFields: finalStep.dangerousFields
    }),
    uploadedFiles: finalStep.fileFields.length,
    advanced,
    submitted,
    actionLabel,
    autoStepCount,
    validationErrors: preValidateAllFields().length
  };
}

async function fixValidationErrors(errors, profile, cvText, language, overlay) {
  for (const error of errors) {
    const field = collectFillableFields().find((f) => f.element === error.element);
    if (!field) continue;

    const value = await buildBestEffortFieldValue(field, profile, cvText, language);
    if (isMeaningfulValue(value)) {
      applyValueToField(field.element, value);
      flashFilledField(field.element);
      overlay?.markField(field.label || field.name || "Campo", "done", "Fix", summarizeValueForUi(value));
      await delayMs(100);
    }
  }
}

async function autofillCurrentStep({ fields, cvText, profile, cvFileDataUrl, cvFileName, cvFileType, overlay }) {
  const fillableFields = collectFillableFields();
  const fileFields = collectFileFields();
  const language = detectFormLanguage(fillableFields);
  const dangerousFields = fillableFields.filter((field) => isDangerousField(field));
  const planned = [];
  const usedTargets = new Set();
  const summary = [];

  overlay.setStatus("Analizando campos y preparando respuestas...");
  overlay.renderDangerousFields(dangerousFields);

  if (fileFields.length) {
    overlay.setStatus("Detecté campos de CV. Preparando archivo guardado...");
    const uploaded = await autofillResumeFiles(fileFields, {
      dataUrl: cvFileDataUrl,
      fileName: cvFileName,
      fileType: cvFileType,
      cvText,
      preferPdf: window.location.hostname.includes("linkedin.com")
    });
    if (uploaded.length) {
      for (const field of uploaded) {
        overlay.markField(field.label || field.name || "Resume", "done", "CV", cvFileName || "CV cargado");
      }
    }
  }

  if (window.location.hostname.includes("linkedin.com")) {
    await autofillLinkedInEasyApplyStep({
      profile,
      cvFileName,
      cvFileDataUrl,
      cvFileType,
      cvText,
      overlay
    });
    await resolveLinkedInValidationErrors({
      profile,
      cvText,
      language,
      overlay
    });
  }

  for (const field of fields || []) {
    const target = resolveFieldTarget(field, fillableFields, usedTargets);
    if (!target) {
      continue;
    }

    usedTargets.add(target.key);
    planned.push({
      target,
      value: field.value,
      source: "AI"
    });
  }

  for (const target of fillableFields) {
    if (usedTargets.has(target.key) || isFieldCompleted(target.element)) {
      continue;
    }

    const inferredValue = inferFieldValue(target, profile, cvText, { language });
    if (!isMeaningfulValue(inferredValue)) {
      continue;
    }

    usedTargets.add(target.key);
    planned.push({
      target,
      value: inferredValue,
      source: "Auto"
    });
  }

  for (const plan of planned) {
    overlay.setStatus(`Rellenando ${plan.target.label || plan.target.name || plan.target.type}...`);
    overlay.markField(plan.target.label || plan.target.name || plan.target.type || "Campo", "loading", plan.source);
    const applied = applyValueToField(plan.target.element, plan.value);

    if (applied) {
      flashFilledField(plan.target.element);
      summary.push({
        label: plan.target.label || plan.target.name || plan.target.type || "Campo",
        value: summarizeValueForUi(plan.value),
        source: plan.source
      });
      overlay.markField(plan.target.label || plan.target.name || plan.target.type || "Campo", "done", plan.source, summarizeValueForUi(plan.value));
    } else {
      overlay.markField(plan.target.label || plan.target.name || plan.target.type || "Campo", "skip", plan.source, "No se pudo aplicar");
    }

    await delayMs(90);
  }

  const remaining = collectFillableFields().filter((field) => !isFieldCompleted(field.element) && !shouldSkipField(field));
  if (remaining.length) {
    for (const field of remaining) {
      const inferredValue = inferFieldValue(field, profile, cvText, { aggressive: true, language });
      if (!isMeaningfulValue(inferredValue)) {
        overlay.markField(field.label || field.name || field.type || "Campo", "skip", "Auto", "Revisión manual");
        continue;
      }

      const applied = applyValueToField(field.element, inferredValue);
      if (applied) {
        flashFilledField(field.element);
        summary.push({
          label: field.label || field.name || field.type || "Campo",
          value: summarizeValueForUi(inferredValue),
          source: "Auto"
        });
        overlay.markField(field.label || field.name || field.type || "Campo", "done", "Auto", summarizeValueForUi(inferredValue));
      }
      await delayMs(70);
    }
  }

  const finalPassFields = collectFillableFields().filter((field) => !isFieldCompleted(field.element) && !shouldSkipField(field));
  if (finalPassFields.length) {
    for (const field of finalPassFields) {
      let fallbackValue = inferFieldValue(field, profile, cvText, { aggressive: true, language });
      if (!isMeaningfulValue(fallbackValue) && field.tag === "select" && field.options.length) {
        fallbackValue = chooseSelectFallback(field, profile);
      }
      if (!isMeaningfulValue(fallbackValue) && (field.type === "checkbox" || field.type === "radio")) {
        fallbackValue = inferBooleanFallback(field);
      }
      if (!isMeaningfulValue(fallbackValue) && field.tag === "textarea") {
        fallbackValue = buildTextareaAnswer(field, profile, cvText, language);
      }

      if (!isMeaningfulValue(fallbackValue)) {
        continue;
      }

      const applied = applyValueToField(field.element, fallbackValue);
      if (applied) {
        flashFilledField(field.element);
        summary.push({
          label: field.label || field.name || field.type || "Campo",
          value: summarizeValueForUi(fallbackValue),
          source: "Auto"
        });
        overlay.markField(field.label || field.name || field.type || "Campo", "done", "Auto", summarizeValueForUi(fallbackValue));
      }
      await delayMs(50);
    }
  }

  const unresolved = collectFillableFields().filter((field) => !isFieldCompleted(field.element) && !shouldSkipField(field));
  return {
    fillableFields,
    fileFields,
    language,
    dangerousFields,
    summary,
    unresolved
  };
}

function mergeFilledSummary(baseSummary, nextSummary) {
  const merged = Array.isArray(baseSummary) ? [...baseSummary] : [];
  const seen = new Set(merged.map((item) => `${item.label}|${item.value}|${item.source}`));
  for (const item of nextSummary || []) {
    const key = `${item.label}|${item.value}|${item.source}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    merged.push(item);
  }
  return merged;
}

function getActionableUnresolvedFields(stepResult, scopeRoot = document) {
  const root = scopeRoot instanceof HTMLElement ? scopeRoot : document.body;
  return (stepResult?.unresolved || []).filter((field) => {
    if (!field?.element || !(field.element instanceof HTMLElement)) {
      return false;
    }

    if (root instanceof HTMLElement && !root.contains(field.element)) {
      return false;
    }

    if (!isElementVisible(field.element) || shouldSkipField(field)) {
      return false;
    }

    const lookup = `${field.label} ${field.name} ${field.type} ${field.contextText}`.toLowerCase();
    if (/follow company|guardar para después|save application|subir foto|upload photo|cover photo/i.test(lookup)) {
      return false;
    }

    return Boolean(
      field.required ||
      /name|email|mail|phone|mobile|telephone|tel[eé]fono|resume|cv|curriculum|authorization|sponsorship|location|city|linkedin|portfolio/i.test(lookup)
    );
  });
}

function shouldAutoAdvanceForm(stepResult, scopeRoot = document) {
  if (!stepResult || stepResult.dangerousFields.length > 0) {
    return false;
  }

  if (stepResult.unresolved.some((field) => isDangerousField(field))) {
    return false;
  }

  if (isLinkedInApplyModalScope(scopeRoot)) {
    return hasCompletedRequiredFieldsInScope(scopeRoot);
  }

  return getActionableUnresolvedFields(stepResult, scopeRoot).length <= 1;
}

function isLinkedInApplyModalScope(scopeRoot) {
  if (!window.location.hostname.includes("linkedin.com")) {
    return false;
  }

  const root = scopeRoot instanceof HTMLElement ? scopeRoot : null;
  if (!root) {
    return false;
  }

  const text = cleanText(root.textContent || "").toLowerCase();
  return /apply to|contact info|submit application|review your application|application powered/i.test(text);
}

function hasCompletedRequiredFieldsInScope(scopeRoot) {
  const root = scopeRoot instanceof HTMLElement ? scopeRoot : document.body;
  const scopedFields = collectFillableFields().filter((field) => {
    return field?.element instanceof HTMLElement && root?.contains(field.element) && isElementVisible(field.element);
  });

  const requiredFields = scopedFields.filter((field) => {
    const lookup = `${field.label} ${field.name} ${field.type} ${field.contextText}`.toLowerCase();
    return field.required || /first name|last name|email|phone|mobile|resume|cv|country code|authorization/i.test(lookup);
  });

  if (!requiredFields.length) {
    return getActionableUnresolvedFields({ unresolved: scopedFields, dangerousFields: [] }, root).length <= 1;
  }

  return requiredFields.every((field) => isFieldCompleted(field.element) || shouldSkipField(field));
}

function findPrimaryFormAction(unresolvedFields = [], scopeRoot = document) {
  const unresolvedSet = new Set((unresolvedFields || []).map((field) => field.element).filter(Boolean));
  const searchRoot = scopeRoot instanceof HTMLElement || scopeRoot instanceof Document ? scopeRoot : document;
  const candidates = Array.from(searchRoot.querySelectorAll("button, input[type='submit'], input[type='button'], a[role='button'], a.button, a.btn"))
    .filter((element) => element instanceof HTMLElement)
    .map((element) => buildFormActionCandidate(element, unresolvedSet))
    .filter(Boolean)
    .sort((left, right) => right.score - left.score);

  return candidates[0] || null;
}

function buildFormActionCandidate(element, unresolvedSet) {
  if (!(element instanceof HTMLElement) || !isElementVisible(element) || isElementDisabled(element)) {
    return null;
  }

  const label = cleanText([
    element.textContent,
    element.getAttribute("value"),
    element.getAttribute("aria-label"),
    element.getAttribute("title"),
    element.getAttribute("name")
  ].filter(Boolean).join(" "));
  const normalized = label.toLowerCase();
  if (!normalized) {
    return null;
  }

  if (/(cancel|close|dismiss|skip|back|previous|volver|atr[aá]s|cerrar|descartar|guardar para despu[eé]s|save(?! application)|follow|sign in|log in)/.test(normalized)) {
    return null;
  }

  if (!/(submit|apply|send|continue|next|review|finish|complete|confirm|enviar|continuar|siguiente|revisar|finalizar|completar|confirmar|postular|solicitar|aplicar)/.test(normalized)) {
    return null;
  }

  let score = 0;
  if (/(submit|send|finish|complete|confirm|enviar|finalizar|completar|confirmar)/.test(normalized)) score += 80;
  if (/(apply|postular|solicitar|aplicar)/.test(normalized)) score += 70;
  if (/(continue|next|review|continuar|siguiente|revisar)/.test(normalized)) score += 60;
  if (/submit application|send application|enviar solicitud/.test(normalized)) score += 120;
  if (element.matches("[type='submit'], .btn-primary, .button-primary, [data-automation-id='bottom-navigation-next-button']")) score += 25;
  if (element.matches(".artdeco-button--primary, .jobs-apply-button, .jobs-easy-apply-content__footer button")) score += 30;
  if (element.closest(".jobs-easy-apply-content__footer, .artdeco-modal__actionbar, footer")) score += 35;
  if (element.closest("form")) score += 20;
  if (Array.from(unresolvedSet).some((field) => field.closest("form") && field.closest("form") === element.closest("form"))) score += 15;

  return {
    element,
    label,
    score,
    kind: /(submit application|submit|send|finish|complete|confirm|enviar solicitud|enviar|finalizar|completar|confirmar)/.test(normalized) ? "submit" : "continue"
  };
}

async function triggerFormProgression(action, overlay, language) {
  const beforeUrl = window.location.href;
  const beforeSignature = captureFormSignature();
  const beforeStep = detectCurrentFormStep();
  const form = action.element.closest("form");

  try {
    if (form && action.kind === "submit" && typeof form.requestSubmit === "function" && action.element.tagName.toLowerCase() !== "a") {
      form.requestSubmit(action.element.matches("button, input") ? action.element : undefined);
    } else {
      action.element.click();
    }
  } catch {
    try {
      action.element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
    } catch {
      overlay.setStatus(language === "es" ? "No se pudo avanzar automáticamente." : "Could not continue automatically.");
      return false;
    }
  }

  let progressed = await waitForFormProgression(beforeUrl, beforeSignature, 9000);
  
  if (!progressed && window.location.hostname.includes("linkedin.com")) {
    const afterStep = detectCurrentFormStep();
    progressed = beforeStep !== afterStep || captureFormSignature() !== beforeSignature;
  }
  
  if (!progressed) {
    await delayMs(500);
    progressed = captureFormSignature() !== beforeSignature;
  }
  
  return progressed;
}

function detectCurrentFormStep() {
  const headings = Array.from(document.querySelectorAll("h1, h2, h3, legend"))
    .map((el) => cleanText(el.textContent || "").toLowerCase());
  
  const stepIndicator = document.querySelector("[aria-current='step'], .step-active, [class*='active']");
  const stepText = stepIndicator ? cleanText(stepIndicator.textContent || "") : "";
  
  const modalTitle = document.querySelector(".artdeco-modal__title, .jobs-easy-apply-modal__title");
  const titleText = modalTitle ? cleanText(modalTitle.textContent || "").toLowerCase() : "";
  
  return `${headings.join("|")}::${stepText}::${titleText}`;
}

function captureFormSignature() {
  const fields = collectFillableFields().slice(0, 12).map((field) => `${field.label}|${field.name}|${isFieldCompleted(field.element) ? "1" : "0"}`);
  const headings = Array.from(document.querySelectorAll("h1, h2, h3, legend"))
    .slice(0, 6)
    .map((element) => cleanText(element.textContent || ""))
    .join("|");
  const buttons = Array.from(document.querySelectorAll("button, input[type='submit'], input[type='button']"))
    .slice(0, 8)
    .map((element) => cleanText(element.textContent || element.getAttribute("value") || ""))
    .join("|");
  return `${window.location.href}::${document.title}::${headings}::${fields.join("~")}::${buttons}`;
}

async function waitForFormProgression(previousUrl, previousSignature, timeout = 9000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    await delayMs(250);
    if (stripHashUrl(window.location.href) !== stripHashUrl(previousUrl)) {
      return true;
    }
    if (captureFormSignature() !== previousSignature) {
      return true;
    }
  }
  return false;
}

function stripHashUrl(value) {
  return String(value || "").replace(/#.*$/, "");
}

function isElementVisible(element) {
  if (!(element instanceof HTMLElement)) {
    return false;
  }
  const style = window.getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) {
    return false;
  }
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function isElementDisabled(element) {
  return Boolean(
    element.getAttribute("aria-disabled") === "true" ||
    element.hasAttribute("disabled") ||
    element.classList.contains("disabled")
  );
}

function collectFillableFields() {
  const enhancedFields = enhanceFieldDetection();
  const standardFields = Array.from(document.querySelectorAll("input, textarea, select"))
    .filter((element) => isSupportedField(element));

  const allFields = new Map();
  for (const element of [...enhancedFields, ...standardFields]) {
    const key = `${element.tagName}-${element.name || element.id || ""}-${element.type || ""}`;
    if (!allFields.has(key)) {
      allFields.set(key, element);
    }
  }

  return Array.from(allFields.values())
    .filter((element) => isSupportedField(element))
    .map((element, index) => buildFieldMeta(element, index));
}

function enhanceFieldDetection() {
  const enhancedSelectors = [
    "input:not([type='hidden']):not([type='submit']):not([type='button']):not([type='reset']):not([type='image']):not([type='file'])",
    "textarea",
    "select",
    "[contenteditable='true']",
    "[role='textbox']",
    "[role='combobox']",
    ".artdeco-text-input--input",
    ".jobs-easy-apply-form-element input",
    ".fb-dash-form-element input",
    ".ember-text-field",
    ".ember-text-area",
    "input.ember-view",
    "input[data-artdeco-autocomplete-input]",
    "input[data-control-name='first_name'], input[data-control-name='last_name']",
    "input[name*='phone'], input[name*='email'], input[name*='name']",
    "input[id*='phone'], input[id*='email'], input[id*='name']"
  ];

  const allFields = new Set();
  for (const selector of enhancedSelectors) {
    try {
      document.querySelectorAll(selector).forEach((el) => allFields.add(el));
    } catch {}
  }
  return Array.from(allFields);
}

function collectFileFields() {
  const fields = Array.from(document.querySelectorAll('input[type="file"]'));
  return fields
    .filter((element) => element instanceof HTMLInputElement)
    .map((element, index) => buildFieldMeta(element, `file-${index}`))
    .filter((field) => {
      const lookup = `${field.label} ${field.name} ${field.contextText} ${field.accept}`.toLowerCase();
      return /resume|updated resume|cv|curriculum|upload|attachment|cover letter|adjuntar|subir hoja de vida|subir cv|curr[ií]culum|pdf|docx?/i.test(lookup);
    });
}

function isSupportedField(element) {
  if (!(element instanceof HTMLElement)) {
    return false;
  }

  const tag = element.tagName.toLowerCase();
  if (tag === "input") {
    const type = (element.getAttribute("type") || "text").toLowerCase();
    return !["hidden", "submit", "button", "reset", "image", "file"].includes(type);
  }
  return tag === "textarea" || tag === "select";
}

function buildFieldMeta(element, index) {
  const tag = element.tagName.toLowerCase();
  const type = (element.getAttribute("type") || tag).toLowerCase();
  
  let label =
    (element.labels && element.labels[0] && cleanText(element.labels[0].innerText || "")) ||
    cleanText(element.getAttribute("aria-label") || "") ||
    cleanText(element.getAttribute("placeholder") || "") ||
    cleanText(findClosestLabelText(element));
  
  const name = cleanText(element.getAttribute("name") || element.id || "");
  
  if (!label) {
    label = inferLabelFromContext(element);
  }
  
  const parentContext = getParentFieldContext(element);

  return {
    element,
    key: `${type}:${name}:${index}`,
    tag,
    type,
    label,
    name,
    id: cleanText(element.id || ""),
    contextText: cleanText(element.closest("label, div, section, article, form")?.textContent || ""),
    parentContext,
    accept: cleanText(element.getAttribute("accept") || ""),
    required: Boolean(element.required || element.getAttribute("aria-required") === "true"),
    options: tag === "select" ? Array.from(element.options || []).map((option) => option.textContent.trim()).filter(Boolean) : []
  };
}

async function autofillResumeFiles(fileFields, cvFile) {
  if (!fileFields.length || (!cvFile?.dataUrl && !cvFile?.cvText)) {
    return [];
  }

  const uploaded = [];
  for (const field of fileFields) {
    if (!(field.element instanceof HTMLInputElement)) {
      continue;
    }

    const file = buildResumeUploadFile({
      dataUrl: cvFile.dataUrl,
      fileName: cvFile.fileName,
      fileType: cvFile.fileType,
      cvText: cvFile.cvText,
      preferPdf: cvFile.preferPdf,
      accept: field.accept
    });
    if (!file) {
      continue;
    }

    const transfer = new DataTransfer();
    transfer.items.add(file);
    field.element.files = transfer.files;
    dispatch(field.element);
    uploaded.push(field);
    flashFilledField(field.element);
    await delayMs(60);
  }

  return uploaded;
}

function buildResumeUploadFile({ dataUrl, fileName, fileType, cvText, preferPdf = false, accept = "" }) {
  const normalizedAccept = String(accept || "").toLowerCase();
  const wantsPdf = preferPdf || normalizedAccept.includes("pdf");
  const sourceFile = dataUrlToFile(dataUrl, fileName, fileType);

  if (wantsPdf) {
    if (sourceFile && /pdf/i.test(sourceFile.type || sourceFile.name)) {
      return sourceFile;
    }

    const pdfFile = buildPdfFileFromText(cvText, fileName);
    if (pdfFile) {
      return pdfFile;
    }
  }

  if (sourceFile) {
    return sourceFile;
  }

  return buildPdfFileFromText(cvText, fileName);
}

function dataUrlToFile(dataUrl, fileName, fileType) {
  try {
    const [meta, body] = String(dataUrl || "").split(",");
    if (!meta || !body) {
      return null;
    }
    const mimeMatch = meta.match(/data:(.*?);base64/);
    const mime = fileType || (mimeMatch ? mimeMatch[1] : "application/octet-stream");
    const binary = atob(body);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new File([bytes], fileName || "resume", { type: mime });
  } catch {
    return null;
  }
}

function buildPdfFileFromText(text, fileName) {
  const safeText = String(text || "").trim();
  if (!safeText) {
    return null;
  }

  const pdfBytes = buildSimplePdf(safeText);
  const safeBase = String(fileName || "resume")
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[^a-z0-9-_]+/gi, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase() || "resume";

  return new File([pdfBytes], `${safeBase}.pdf`, { type: "application/pdf" });
}

function buildSimplePdf(text) {
  const lines = String(text || "")
    .replace(/\r/g, "")
    .split("\n")
    .slice(0, 80)
    .map((line) => line.slice(0, 110));

  const streamLines = ["BT", "/F1 11 Tf", "50 792 Td", "14 TL"];
  let first = true;

  for (const raw of lines) {
    const safe = raw
      .replace(/\\/g, "\\\\")
      .replace(/\(/g, "\\(")
      .replace(/\)/g, "\\)");

    if (first) {
      streamLines.push(`(${safe}) Tj`);
      first = false;
    } else {
      streamLines.push(`T* (${safe}) Tj`);
    }
  }

  if (!lines.length) {
    streamLines.push("(Resume) Tj");
  }

  streamLines.push("ET");
  const contentStream = streamLines.join("\n");

  const objects = [
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
    "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj",
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj",
    "4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj",
    `5 0 obj << /Length ${contentStream.length} >> stream\n${contentStream}\nendstream endobj`
  ];

  let body = "%PDF-1.4\n";
  const offsets = [0];

  for (const obj of objects) {
    offsets.push(body.length);
    body += `${obj}\n`;
  }

  const xrefOffset = body.length;
  body += `xref\n0 ${objects.length + 1}\n`;
  body += "0000000000 65535 f \n";

  for (let i = 1; i < offsets.length; i += 1) {
    body += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }

  body += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return new TextEncoder().encode(body);
}

function getFieldKey(element) {
  return element?.dataset?.trcvastianFieldKey || "";
}

function findClosestLabelText(element) {
  const wrapper = element.closest("label, div, section, article");
  return wrapper?.querySelector("label")?.textContent || "";
}

function resolveFieldTarget(field, fillableFields, usedTargets) {
  const candidates = [];
  if (field?.selectorHint) {
    candidates.push((item) => itemMatchesSelector(item.element, field.selectorHint));
  }
  if (field?.name) {
    candidates.push((item) => item.name.toLowerCase() === String(field.name).toLowerCase());
  }
  if (field?.label) {
    const lookup = String(field.label).toLowerCase();
    candidates.push((item) => item.label.toLowerCase().includes(lookup));
  }

  for (const matcher of candidates) {
    const match = fillableFields.find((item) => !usedTargets.has(item.key) && matcher(item));
    if (match) {
      return match;
    }
  }

  return fillableFields.find((item) => !usedTargets.has(item.key) && item.name && field?.name && item.name.toLowerCase().includes(String(field.name).toLowerCase())) || null;
}

function itemMatchesSelector(element, selector) {
  try {
    return element.matches(selector);
  } catch {
    return false;
  }
}

function applyValueToField(element, rawValue) {
  const value = rawValue ?? "";
  const tag = element.tagName.toLowerCase();
  const type = (element.getAttribute("type") || tag).toLowerCase();

  if (!isMeaningfulValue(value) && type !== "checkbox" && type !== "radio" && tag !== "select") {
    return false;
  }

  if (tag === "select") {
    const applied = selectOption(element, value, true);
    if (applied) {
      dispatch(element);
    }
    return applied;
  }

  if (type === "checkbox") {
    element.checked = inferBooleanValue(value, element);
    dispatch(element);
    return true;
  }

  if (type === "radio") {
    const applied = selectRadioValue(element, value);
    return applied;
  }

  element.focus();
  element.value = String(value);
  dispatch(element);
  element.blur();
  return true;
}

function selectOption(selectElement, value, allowFallback = false) {
  const normalized = String(value).trim().toLowerCase();
  const options = Array.from(selectElement.options);
  const match =
    options.find((option) => option.value.toLowerCase() === normalized) ||
    options.find((option) => option.textContent.trim().toLowerCase() === normalized) ||
    options.find((option) => normalized && option.textContent.trim().toLowerCase().includes(normalized));

  if (match) {
    selectElement.value = match.value;
    return true;
  }

  if (allowFallback) {
    const preferred =
      options.find((option) => /prefer not to say|decline|not specified|other/i.test(option.textContent || "")) ||
      options.find((option) => option.value && option.value !== "") ||
      options.find((option) => option.textContent.trim() && !/select|choose/i.test(option.textContent));
    if (preferred) {
      selectElement.value = preferred.value;
      return true;
    }
  }

  return false;
}

function dispatch(element) {
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

function ensureAutofillAssistantStyles() {
  if (document.getElementById("trcvastian-autofill-assistant-styles")) {
    return;
  }

   const style = document.createElement("style");
   style.id = "trcvastian-autofill-assistant-styles";
   style.textContent = `
     .trcvastian-field-filled {
       outline: 2px solid rgba(15, 93, 134, 0.45) !important;
       outline-offset: 2px !important;
       transition: outline-color .2s ease !important;
       position: relative;
     }
     .trcvastian-field-filled::after {
       content: "";
       position: absolute;
       top: -6px;
       right: -6px;
       width: 14px;
       height: 14px;
       background: #22c55e;
       border-radius: 999px;
       border: 2px solid white;
       box-shadow: 0 2px 5px rgba(34, 197, 94, 0.35);
       background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M20 6L9 17l-5-5' stroke='%23fff' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
       background-size: 10px;
       background-position: center;
       background-repeat: no-repeat;
       pointer-events: none;
       z-index: 100;
     }
     #trcvastian-autofill-assistant {
       position: fixed;
       left: 18px;
       bottom: 18px;
       width: 320px;
       max-height: 52vh;
       overflow: hidden;
       z-index: 2147483646;
       border-radius: 18px;
       background: rgba(255, 255, 255, 0.97);
       box-shadow: 0 18px 38px rgba(7, 30, 39, 0.18), inset 0 0 0 1px rgba(193,199,209,0.18);
       backdrop-filter: blur(14px);
       color: #071e27;
       font-family: Inter, system-ui, sans-serif;
     }
     .trcvastian-assistant-header {
       display: flex;
       align-items: flex-start;
       justify-content: space-between;
       gap: 8px;
       padding: 14px 14px 10px 14px;
       border-bottom: 1px solid rgba(193,199,209,0.2);
       background: rgba(255,255,255,0.5);
     }
     .trcvastian-assistant-header-left {
       min-width: 0;
       flex: 1;
     }
     .trcvastian-assistant-header-actions {
       display: flex;
       align-items: center;
       gap: 6px;
       flex-shrink: 0;
     }
      .trcvastian-assistant-collapse-btn,
      .trcvastian-assistant-close-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
        border: 0;
        border-radius: 8px;
        background: rgba(15, 93, 134, 0.08);
        color: #0f5d86;
        cursor: pointer;
        transition: all .15s ease;
        padding: 0;
      }
      .trcvastian-assistant-collapse-btn:hover,
      .trcvastian-assistant-close-btn:hover {
        background: rgba(15, 93, 134, 0.18);
        color: #071e27;
        transform: scale(1.05);
      }
      .trcvastian-assistant-close-btn:hover {
        background: rgba(199, 68, 68, 0.15);
        color: #c44;
      }
      .trcvastian-assistant-body {
        padding: 0 14px 14px 14px;
        overflow-y: auto;
        max-height: calc(52vh - 60px);
        transition: max-height .25s ease, opacity .25s ease;
      }
      .trcvastian-assistant-body.hidden {
        display: none;
      }
     .trcvastian-assistant-kicker {
       color: #6b7f88;
       font: 700 10px/1.1 Inter, system-ui, sans-serif;
       letter-spacing: 0.18em;
       text-transform: uppercase;
     }
     .trcvastian-assistant-title {
       color: #071e27;
       font: 700 15px/1.3 Manrope, Inter, system-ui, sans-serif;
       letter-spacing: -0.01em;
       margin-top: 4px;
     }
     .trcvastian-assistant-status {
       margin-top: 8px;
       color: #4d6570;
       font: 500 12px/1.45 Inter, system-ui, sans-serif;
     }
      .trcvastian-assistant-score {
        display: grid;
        grid-template-columns: 56px 1fr;
        gap: 10px;
        margin-top: 14px;
        border-radius: 14px;
        padding: 10px;
        background: linear-gradient(135deg, #eef8fd 0%, #e6f5fc 100%);
        border: 1px solid rgba(15,93,134,0.08);
        box-shadow: 0 2px 6px rgba(7,30,39,0.06);
      }
      .trcvastian-assistant-score.hidden { display: none; }
      .trcvastian-assistant-score-value {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: 12px;
        background: linear-gradient(135deg, #0f5d86 0%, #0d4d70 100%);
        color: white;
        font: 800 18px/1 Manrope, Inter, system-ui, sans-serif;
        letter-spacing: -0.02em;
        min-width: 48px;
        height: 38px;
      }
      .trcvastian-assistant-score-copy {
        color: #4d6570;
        font: 500 10.5px/1.4 Inter, system-ui, sans-serif;
        min-width: 0;
        display: flex;
        flex-direction: column;
        justify-content: center;
        gap: 2px;
      }
       .trcvastian-assistant-score-title {
         color: #071e27;
         font: 700 11px/1.2 Manrope, Inter, system-ui, sans-serif;
         margin-bottom: 1px;
       }
       .trcvastian-assistant-score-stats {
         color: #4d6570;
         font: 500 10.5px/1.4 Inter, system-ui, sans-serif;
         letter-spacing: -0.01em;
       }
     .trcvastian-assistant-danger {
       margin-top: 12px;
       border-radius: 16px;
       padding: 10px;
       background: #fbf5ef;
       box-shadow: inset 0 0 0 1px rgba(215,171,112,0.18);
     }
     .trcvastian-assistant-danger.hidden { display: none; }
     .trcvastian-assistant-danger-title {
       color: #8a5a1c;
       font: 700 10px/1 Inter, system-ui, sans-serif;
       letter-spacing: .16em;
       text-transform: uppercase;
     }
     .trcvastian-assistant-danger-list {
       display: flex;
       flex-wrap: wrap;
       gap: 6px;
       margin-top: 8px;
     }
      .trcvastian-assistant-danger-chip {
        display: inline-flex;
        align-items: center;
        border-radius: 999px;
        padding: 4px 9px;
        background: rgba(15, 93, 134, 0.08);
        color: #0f5d86;
        font: 700 10px/1.3 Inter, system-ui, sans-serif;
        border: 1px solid rgba(15,93,134,0.15);
        backdrop-filter: blur(4px);
      }
     .trcvastian-assistant-list,
     .trcvastian-assistant-summary {
       display: grid;
       gap: 7px;
       margin-top: 12px;
     }
     .trcvastian-assistant-item {
       border-radius: 14px;
       padding: 9px 10px;
       background: #f4f9fc;
       box-shadow: inset 0 0 0 1px rgba(193,199,209,0.16);
     }
     .trcvastian-review-card {
       width: 100%;
       text-align: left;
       cursor: pointer;
       transition: transform .16s ease, box-shadow .16s ease, background .16s ease;
       border: 0;
     }
     .trcvastian-review-card:hover {
       transform: translateY(-1px);
       background: #eef7fb;
       box-shadow: inset 0 0 0 1px rgba(15,93,134,0.2), 0 10px 20px rgba(7,30,39,0.06);
     }
     .trcvastian-assistant-row {
       display: flex;
       align-items: start;
       justify-content: space-between;
       gap: 8px;
     }
     .trcvastian-assistant-label {
       font: 700 11px/1.3 Inter, system-ui, sans-serif;
       color: #071e27;
     }
     .trcvastian-assistant-meta {
       margin-top: 4px;
       font: 500 11px/1.4 Inter, system-ui, sans-serif;
       color: #59717b;
     }
     .trcvastian-assistant-badge {
       display: inline-flex;
       align-items: center;
       justify-content: center;
       border-radius: 999px;
       padding: 4px 8px;
       font: 700 10px/1 Inter, system-ui, sans-serif;
       letter-spacing: .06em;
       text-transform: uppercase;
       white-space: nowrap;
     }
     .trcvastian-assistant-badge-loading { background: #e9f4fb; color: #0f5d86; }
     .trcvastian-assistant-badge-done { background: #dbf3ef; color: #0d6862; }
     .trcvastian-assistant-badge-skip { background: #edf5fa; color: #5a707b; }
     .trcvastian-assistant-section {
       margin-top: 14px;
       color: #6b7f88;
       font: 700 10px/1 Inter, system-ui, sans-serif;
       letter-spacing: .18em;
       text-transform: uppercase;
     }
     .trcvastian-assistant-section.hidden { display: none; }
      .trcvastian-magic-button {
        position: absolute;
        z-index: 2147483644;
        width: 28px;
        height: 28px;
        border: 0;
        border-radius: 999px;
        background: linear-gradient(135deg, #0f5d86 0%, #0d4d70 100%);
        color: white;
        box-shadow: 0 6px 14px rgba(15,93,134,0.32), 0 2px 4px rgba(0,0,0,0.12);
        font: 700 14px/1 Manrope, Inter, system-ui, sans-serif;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: transform .18s ease, box-shadow .18s ease, filter .18s ease;
      }
      .trcvastian-magic-button:hover {
        transform: translateY(-2px) scale(1.05);
        box-shadow: 0 10px 20px rgba(15,93,134,0.4), 0 4px 6px rgba(0,0,0,0.15);
        filter: brightness(1.1);
      }
      .trcvastian-magic-button:active {
        transform: translateY(0) scale(0.98);
      }
      .trcvastian-magic-button.is-loading {
        filter: saturate(0.6) brightness(0.95);
        opacity: 0.85;
        transform: scale(0.95);
      }
   `;

  document.head.appendChild(style);
}

function createAutofillAssistantOverlay() {
  let root = document.getElementById("trcvastian-autofill-assistant");
  if (root) {
    root.remove();
  }

   root = document.createElement("div");
   root.id = "trcvastian-autofill-assistant";
   root.innerHTML = `
     <div class="trcvastian-assistant-header">
       <div class="trcvastian-assistant-header-left">
         <div class="trcvastian-assistant-kicker">TRCVASTIAN</div>
         <div id="trcvastian-assistant-title" class="trcvastian-assistant-title">Autocompletando</div>
       </div>
       <div class="trcvastian-assistant-header-actions">
         <button type="button" id="trcvastian-assistant-collapse" class="trcvastian-assistant-collapse-btn" aria-label="Colapsar panel">
           <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
             <path d="M18 15l-6-6-6 6"/>
           </svg>
         </button>
         <button type="button" id="trcvastian-assistant-close" class="trcvastian-assistant-close-btn" aria-label="Cerrar panel">
           <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
             <path d="M18 6L6 18M6 6l12 12"/>
           </svg>
         </button>
       </div>
     </div>
     <div id="trcvastian-assistant-body" class="trcvastian-assistant-body">
       <div id="trcvastian-assistant-status" class="trcvastian-assistant-status">Preparando formulario...</div>
       <div id="trcvastian-assistant-score" class="trcvastian-assistant-score hidden"></div>
       <div id="trcvastian-assistant-danger" class="trcvastian-assistant-danger hidden"></div>
       <div id="trcvastian-assistant-list" class="trcvastian-assistant-list"></div>
       <div id="trcvastian-assistant-section" class="trcvastian-assistant-section hidden">Resumen</div>
       <div id="trcvastian-assistant-summary" class="trcvastian-assistant-summary"></div>
     </div>
   `;
   document.body.appendChild(root);

   const titleEl = root.querySelector("#trcvastian-assistant-title");
   const statusEl = root.querySelector("#trcvastian-assistant-status");
   const scoreEl = root.querySelector("#trcvastian-assistant-score");
   const dangerEl = root.querySelector("#trcvastian-assistant-danger");
   const listEl = root.querySelector("#trcvastian-assistant-list");
   const sectionEl = root.querySelector("#trcvastian-assistant-section");
   const summaryEl = root.querySelector("#trcvastian-assistant-summary");
   const bodyEl = root.querySelector("#trcvastian-assistant-body");
   const collapseBtn = root.querySelector("#trcvastian-assistant-collapse");
   const closeBtn = root.querySelector("#trcvastian-assistant-close");

   let isCollapsed = false;

   const toggleCollapse = () => {
     isCollapsed = !isCollapsed;
     bodyEl.classList.toggle("hidden", isCollapsed);
     collapseBtn.innerHTML = isCollapsed
       ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>`
       : `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18 15l-6-6-6 6"/></svg>`;
   };

   collapseBtn?.addEventListener("click", (e) => {
     e.stopPropagation();
     toggleCollapse();
   });

   closeBtn?.addEventListener("click", (e) => {
     e.stopPropagation();
     root.remove();
   });

   root.addEventListener("dblclick", (e) => {
     e.stopPropagation();
     toggleCollapse();
   });

   document.addEventListener("keydown", (e) => {
     if (e.key === "Escape" && document.getElementById("trcvastian-autofill-assistant")) {
       root.remove();
     }
   });

   closeBtn?.addEventListener("click", (e) => {
     e.stopPropagation();
     root.remove();
   });

   root.addEventListener("dblclick", (e) => {
     e.stopPropagation();
     toggleCollapse();
   });

  root.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const reviewCard = target.closest("[data-review-field-key]");
    if (!(reviewCard instanceof HTMLElement)) {
      return;
    }

    const key = reviewCard.getAttribute("data-review-field-key");
    const field = collectFillableFields().find((item) => item.key === key);
    if (field?.element) {
      field.element.scrollIntoView({ behavior: "smooth", block: "center" });
      field.element.focus();
      flashFilledField(field.element);
    }
  });

  return {
    setHeadline(text) {
      titleEl.textContent = text;
    },
    setStatus(text) {
      statusEl.textContent = text;
    },
     renderScore(score) {
       if (!score || !scoreEl) {
         return;
       }
       scoreEl.classList.remove("hidden");
       const stats = [`${score.completed}/${score.total} completos`, `${score.unresolved} por revisar`];
       if (score.dangerous > 0) {
         stats.push(`${score.dangerous} sensibles`);
       }
       scoreEl.innerHTML = `
         <div class="trcvastian-assistant-score-value">${escapeHtml(score.ratio)}%</div>
         <div class="trcvastian-assistant-score-copy">
           <div class="trcvastian-assistant-score-title">${escapeHtml(score.readiness)}</div>
           <div class="trcvastian-assistant-score-stats">${escapeHtml(stats.join(" • "))}</div>
         </div>
       `;
     },
    renderDangerousFields(fields) {
      if (!dangerEl) {
        return;
      }
      if (!fields.length) {
        dangerEl.classList.add("hidden");
        dangerEl.innerHTML = "";
        return;
      }
      dangerEl.classList.remove("hidden");
      dangerEl.innerHTML = `
        <div class="trcvastian-assistant-danger-title">Campos sensibles</div>
        <div class="trcvastian-assistant-danger-list">
          ${fields
            .slice(0, 8)
            .map((field) => `<span class="trcvastian-assistant-danger-chip">${escapeHtml(field.label || field.name || field.type || "Campo")}</span>`)
            .join("")}
        </div>
      `;
    },
    markField(label, state, source, meta = "") {
      const safeKey = `${label}-${source}`;
      let item = listEl.querySelector(`[data-key="${cssEscape(safeKey)}"]`);
      if (!item) {
        item = document.createElement("div");
        item.className = "trcvastian-assistant-item";
        item.setAttribute("data-key", safeKey);
        listEl.prepend(item);
      }

      item.innerHTML = `
        <div class="trcvastian-assistant-row">
          <div>
            <div class="trcvastian-assistant-label">${escapeHtml(label)}</div>
            <div class="trcvastian-assistant-meta">${escapeHtml(meta || source)}</div>
          </div>
          <span class="trcvastian-assistant-badge trcvastian-assistant-badge-${escapeHtml(state)}">${escapeHtml(state)}</span>
        </div>
      `;
    },
    renderSummary(filled, unresolved, recommendations = []) {
      sectionEl.classList.remove("hidden");
      sectionEl.textContent = "Recommendations";
      const recommendationMarkup = recommendations
        .map(
          (item) => `
            <div class="trcvastian-assistant-item">
              <div class="trcvastian-assistant-row">
                <div>
                  <div class="trcvastian-assistant-label">${escapeHtml(item.title)}</div>
                  <div class="trcvastian-assistant-meta">${escapeHtml(item.copy)}</div>
                </div>
                <span class="trcvastian-assistant-badge ${item.tone === "done" ? "trcvastian-assistant-badge-done" : item.tone === "skip" ? "trcvastian-assistant-badge-skip" : "trcvastian-assistant-badge-loading"}">${escapeHtml(item.tag)}</span>
              </div>
            </div>
          `
        )
        .join("");
      const unresolvedMarkup = unresolved.length
        ? unresolved
            .slice(0, 4)
            .map(
              (item) => `
                <button type="button" class="trcvastian-assistant-item trcvastian-review-card" data-review-field-key="${escapeHtml(item.key || "")}">
                  <div class="trcvastian-assistant-row">
                    <div>
                      <div class="trcvastian-assistant-label">${escapeHtml(item.label || item.name || item.type || "Campo")}</div>
                      <div class="trcvastian-assistant-meta">Revisión manual recomendada</div>
                    </div>
                    <span class="trcvastian-assistant-badge trcvastian-assistant-badge-skip">Check</span>
                  </div>
                </button>
              `
            )
            .join("")
        : "";
      summaryEl.innerHTML = recommendationMarkup + unresolvedMarkup;
    }
  };
}

function createSilentAutofillOverlay() {
  const existing = document.getElementById("trcvastian-autofill-assistant");
  existing?.remove();

  return {
    setHeadline() {},
    setStatus() {},
    renderScore() {},
    renderDangerousFields() {},
    markField() {},
    renderSummary() {}
  };
}

function buildApplicationHeadline(jobContext) {
  const company = cleanText(jobContext?.company || "");
  const title = cleanText(jobContext?.title || "");

  if (company) {
    return `Apply to ${company}`;
  }

  if (title) {
    return `Apply to ${title}`;
  }

  return "Apply to";
}

function buildRecommendationStatus({ summary, unresolved, dangerousFields, fileFields, cvFileName, language }) {
  const suggestions = buildApplyRecommendations({
    summary,
    unresolved,
    dangerousFields,
    fileFields,
    cvFileName,
    language
  });

  return suggestions[0]?.copy || (language === "es" ? "Revisa los datos antes de enviar." : "Review the details before sending.");
}

function buildApplyRecommendations({ jobContext, summary = [], unresolved = [], dangerousFields = [], fileFields = [], cvFileName = "", language = "en" }) {
  const recommendations = [];
  const isSpanish = String(language || "").toLowerCase().startsWith("es");

  if (fileFields.length) {
    recommendations.push({
      title: isSpanish ? "CV listo" : "Resume ready",
      copy: cvFileName
        ? isSpanish
          ? `Usamos ${cvFileName} para el campo de resume.`
          : `We used ${cvFileName} for the resume field.`
        : isSpanish
          ? "Se detectó un campo de resume y se intentó cargar tu CV."
          : "A resume field was detected and your saved CV was used.",
      tag: isSpanish ? "CV" : "Resume",
      tone: "done"
    });
  }

  if (jobContext?.title || jobContext?.company) {
    recommendations.push({
      title: isSpanish ? "Vacante detectada" : "Job detected",
      copy: [jobContext?.title, jobContext?.company].filter(Boolean).join(" · ") || (isSpanish ? "Seguimos la vacante abierta." : "We are following the open job."),
      tag: isSpanish ? "Job" : "Job",
      tone: "loading"
    });
  }

  if (dangerousFields.length) {
    recommendations.push({
      title: isSpanish ? "Campos sensibles" : "Sensitive fields",
      copy: isSpanish
        ? "Revisa salario, visa o autorización antes de enviar."
        : "Review salary, visa, or authorization fields before sending.",
      tag: isSpanish ? "Check" : "Check",
      tone: "skip"
    });
  }

  if (unresolved.length) {
    recommendations.push({
      title: isSpanish ? "Revisión manual" : "Manual review",
      copy: isSpanish
        ? `Quedan ${unresolved.length} campo(s) por validar.`
        : `${unresolved.length} field(s) still need review.`,
      tag: isSpanish ? "Check" : "Check",
      tone: "skip"
    });
  }

  if (!dangerousFields.length && !unresolved.length) {
    recommendations.push({
      title: isSpanish ? "Listo para revisar" : "Ready to review",
      copy: isSpanish
        ? `Se completaron ${summary.length} campos. Revisa y envía.`
        : `${summary.length} fields were completed. Review and submit.`,
      tag: isSpanish ? "Ready" : "Ready",
      tone: "done"
    });
  }

  return recommendations.slice(0, 4);
}

function inferBooleanValue(value, element) {
  const normalized = String(value || "").toLowerCase();
  if (["true", "yes", "1", "si", "on"].includes(normalized)) {
    return true;
  }
  if (["false", "no", "0", "off"].includes(normalized)) {
    return false;
  }

  const text = `${element.getAttribute("name") || ""} ${element.getAttribute("aria-label") || ""} ${findClosestLabelText(element)}`.toLowerCase();
  return /agree|consent|terms|privacy|policy|authorize|authorise|gdpr|receive updates/.test(text);
}

function selectRadioValue(element, value) {
  const name = element.getAttribute("name");
  if (!name) {
    return false;
  }

  const radios = Array.from(document.querySelectorAll(`input[type="radio"][name="${cssEscape(name)}"]`));
  const normalized = String(value || "").trim().toLowerCase();
  const exact =
    radios.find((radio) => String(radio.value || "").trim().toLowerCase() === normalized) ||
    radios.find((radio) => cleanText(findClosestLabelText(radio)).toLowerCase() === normalized) ||
    radios.find((radio) => normalized && cleanText(findClosestLabelText(radio)).toLowerCase().includes(normalized));

  const fallback =
    radios.find((radio) => /prefer not to say|decline|other/i.test(`${radio.value} ${findClosestLabelText(radio)}`)) ||
    radios[0];

  const target = exact || fallback;
  if (!target) {
    return false;
  }

  target.checked = true;
  dispatch(target);
  return true;
}

function cssEscape(value) {
  if (typeof CSS !== "undefined" && CSS.escape) {
    return CSS.escape(value);
  }

  return value.replace(/"/g, '\\"');
}

function normalizeAutofillProfile(profile, cvText) {
  const safe = profile && typeof profile === "object" ? profile : {};
  const rawText = String(cvText || "");
  const phoneCountry = inferPhoneCountryInfo(String(safe.phone || "").trim(), String(safe.location || safe.city || "").trim());
  return {
    fullName: String(safe.fullName || "").trim(),
    firstName: String(safe.firstName || "").trim(),
    lastName: String(safe.lastName || "").trim(),
    email: String(safe.email || "").trim(),
    phone: String(safe.phone || "").trim(),
    phoneNational: extractNationalPhone(String(safe.phone || "").trim(), phoneCountry),
    phoneCountryCode: phoneCountry.dialCode,
    phoneCountryLabel: phoneCountry.label,
    linkedin: String(safe.linkedin || "").trim(),
    github: String(safe.github || "").trim(),
    portfolio: String(safe.portfolio || "").trim(),
    website: String(safe.website || safe.portfolio || "").trim(),
    location: String(safe.location || safe.city || "").trim(),
    city: String(safe.city || "").trim(),
    state: String(safe.state || safe.province || "").trim(),
    country: String(safe.country || "").trim(),
    role: String(safe.role || "").trim(),
    seniority: String(safe.seniority || "").trim(),
    remotePreference: String(safe.remotePreference || "").trim(),
    cvSnippet: String(safe.cvSnippet || rawText.slice(0, 420)).trim(),
    skills: Array.isArray(safe.skills) ? safe.skills : []
  };
}

function inferFieldValue(field, profile, cvText, options = {}) {
  const lookup = `${field.label} ${field.name} ${field.type} ${field.parentContext}`.toLowerCase();
  const aggressive = Boolean(options.aggressive);
  const language = options.language || "en";

  if (/full name|name and surname|legal name|candidate name|your name/i.test(lookup)) {
    return profile.fullName || [profile.firstName, profile.lastName].filter(Boolean).join(" ");
  }
  if (/first name|given name|nombre.*pila|prenom/i.test(lookup)) {
    return profile.firstName || profile.fullName.split(/\s+/)[0] || "";
  }
  if (/last name|family name|surname|apellido|nom de famille/i.test(lookup)) {
    return profile.lastName || profile.fullName.split(/\s+/).slice(1).join(" ") || "";
  }
  if (/email|e-mail|correo electronico|courriel/i.test(lookup)) {
    return profile.email;
  }
  if (/phone country code|country code|dial code|código de área|código de país|landesvorwahl|vorwahl|indicatif/i.test(lookup)) {
    return profile.phoneCountryLabel || profile.phoneCountryCode || "";
  }
  if (/phone|mobile|telephone|tel|telefon|telefonnummer|handynummer|mobilnummer|handy|t[eé]l[eé]phone|num[eé]ro/i.test(lookup)) {
    return profile.phoneNational || profile.phone;
  }
  if (/linkedin|linked ?in/i.test(lookup)) {
    return profile.linkedin;
  }
  if (/github/i.test(lookup)) {
    return profile.github;
  }
  if (/portfolio|website|personal site|site|url|web personal/i.test(lookup)) {
    return profile.website || profile.portfolio || profile.linkedin || profile.github;
  }
  if (/city|location|address|country|region|ciudad|ubicaci[oó]n|adresse/i.test(lookup)) {
    return profile.location || profile.city;
  }
  if (/job title|title|current role|position|headline|cargo|puesto/i.test(lookup)) {
    return profile.role;
  }
  if (/salary|salario|compensation|remuneration|expected pay|pretension/i.test(lookup)) {
    return aggressive ? translateByLanguage("Negotiable", language) : "";
  }
  if (/notice|available|start date|disponibilidad|pr[eé]avis/i.test(lookup)) {
    return aggressive ? translateByLanguage("2 weeks", language) : "";
  }
  if (/authorization|authorisation|work permit|visa|sponsorship|autorizaci[oó]n|permiso de trabajo/i.test(lookup)) {
    if (field.tag === "select" && field.options.length) {
      return field.options.find((option) => /prefer not to say|yes|authorized|authorised|willing|open|dispuesto/i.test(option)) || field.options[0] || "";
    }
    return aggressive ? translateByLanguage("Please discuss", language) : "";
  }
  if (/experience|years|a[n~]os|exp[eé]rience/i.test(lookup)) {
    return profile.seniority || (aggressive ? "5+" : "");
  }
  if (/company|empresa|entreprise|employer/i.test(lookup)) {
    return profile.company || profile.currentCompany || "";
  }
  if (/school|university|education|college|escuela|universidad|formation/i.test(lookup)) {
    return profile.education || "";
  }
  if (/degree|titulo|diploma|grade/i.test(lookup)) {
    return profile.degree || "";
  }
  if (/website|link|url|blog/i.test(lookup)) {
    return profile.website || profile.portfolio || "";
  }
  if (/zip|postal code|c[oó]digo postal|code postal|plz/i.test(lookup)) {
    return profile.postalCode || "";
  }
  if (/street|calle|stra[sß]e|address/i.test(lookup)) {
    return profile.street || "";
  }
  if (/state|province|estado|province/i.test(lookup)) {
    return profile.state || "";
  }
  if (/cover|motivation|why|about you|tell us|summary|message|carta|motivation/i.test(lookup)) {
    return buildTextareaAnswer(field, profile, cvText, language);
  }
  if (/additional|comments|notes|comentarios|remarques/i.test(lookup)) {
    return buildTextareaAnswer(field, profile, cvText, language);
  }
  if (/skills|competencies|habilidades|comp[eé]tences/i.test(lookup)) {
    return Array.isArray(profile.skills) ? profile.skills.join(", ") : "";
  }
  if (/languages|idiomas|langues/i.test(lookup)) {
    return profile.languages || "";
  }
  if (/certification|certificaci[oó]n|certificat/i.test(lookup)) {
    return profile.certifications || "";
  }
  if (/reference|referencia|r[eé]f[eé]rence/i.test(lookup)) {
    return profile.references || "";
  }
  if (/headline|tagline|resumen|sobre m[ií]|about me|sobre m[ií]|profile summary/i.test(lookup)) {
    return profile.headline || profile.cvSnippet || "";
  }
  if (field.tag === "textarea") {
    return buildTextareaAnswer(field, profile, cvText, language);
  }
  if (field.tag === "select" && field.options.length) {
    return chooseSelectFallback(field, profile);
  }
  if (field.type === "checkbox" || field.type === "radio") {
    return inferBooleanFallback(field);
  }
  if (aggressive) {
    return profile.cvSnippet || summarizeCvText(cvText);
  }

  return "";
}

function buildTextareaAnswer(field, profile, cvText, language = "en") {
  const lookup = `${field.label} ${field.name}`.toLowerCase();
  if (/cover|motivation|why|about you|tell us|summary|message/.test(lookup)) {
    const skills = Array.isArray(profile.skills) ? profile.skills.slice(0, 4).join(", ") : "";
    const english = [
      `I am interested in this role because it aligns well with my background in ${profile.role || "software development"}.`,
      skills ? `I bring hands-on experience with ${skills}.` : "",
      profile.cvSnippet || summarizeCvText(cvText)
    ]
      .filter(Boolean)
      .join(" ");

    const spanish = [
      `Me interesa esta posición porque encaja bien con mi experiencia en ${profile.role || "desarrollo de software"}.`,
      skills ? `Aporto experiencia práctica con ${skills}.` : "",
      profile.cvSnippet || summarizeCvText(cvText)
    ]
      .filter(Boolean)
      .join(" ");

    return language === "es" ? spanish : english;
  }

  return profile.cvSnippet || summarizeCvText(cvText);
}

function validateFieldBeforeSubmit(field) {
  const value = field.element.value || "";
  const type = field.type || "";
  const label = (field.label || "").toLowerCase();

  if (field.required && !value.trim()) {
    return { valid: false, message: "Campo requerido" };
  }

  if (/email|correo|e-mail/i.test(label) && value.trim()) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(value.trim())) {
      return { valid: false, message: "Email inválido" };
    }
  }

  if (/phone|tel[eé]fono|mobile/i.test(label) && value.trim()) {
    const phoneDigits = value.replace(/\D/g, "");
    if (phoneDigits.length < 7) {
      return { valid: false, message: "Teléfono muy corto" };
    }
  }

  if (/url|website|portfolio|linkedin|github/i.test(label) && value.trim()) {
    try {
      new URL(value.trim());
    } catch {
      if (!value.startsWith("http")) {
        return { valid: false, message: "URL inválida" };
      }
    }
  }

  return { valid: true };
}

function preValidateAllFields() {
  const fields = collectFillableFields();
  const errors = [];

  for (const field of fields) {
    if (isFieldCompleted(field.element) && !shouldSkipField(field)) {
      const validation = validateFieldBeforeSubmit(field);
      if (!validation.valid) {
        errors.push({
          field: field.label || field.name || field.type,
          message: validation.message,
          element: field.element
        });
      }
    }
  }

  return errors;
}

function summarizeCvText(cvText) {
  return cleanText(String(cvText || "").split(/\n+/).slice(0, 6).join(" ")).slice(0, 320);
}

function chooseSelectFallback(field, profile) {
  const options = field.options || [];
  const lookup = `${field.label} ${field.name}`.toLowerCase();
  if (/phone country code|country code|dial code|código de área|código de país|landesvorwahl|vorwahl/.test(lookup)) {
    return (
      options.find((option) => profile.phoneCountryLabel && option.toLowerCase().includes(profile.phoneCountryLabel.toLowerCase())) ||
      options.find((option) => profile.phoneCountryCode && option.toLowerCase().includes(profile.phoneCountryCode.toLowerCase())) ||
      options[0] ||
      ""
    );
  }
  const roleMatch = options.find((option) => profile.role && option.toLowerCase().includes(profile.role.toLowerCase()));
  return roleMatch || options.find((option) => /prefer not to say|other|remote|yes/i.test(option)) || options[0] || "";
}

async function autofillLinkedInEasyApplyStep({ profile, cvFileName, cvFileDataUrl, cvFileType, cvText, overlay }) {
  const modalRoot = findLinkedInEasyApplyRoot();
  if (!modalRoot) {
    return;
  }

  await ensureLinkedInPhoneCountryCode(modalRoot, profile);
  const phoneHandled = ensureLinkedInPhoneNumber(modalRoot, profile);
  if (!phoneHandled && modalHasRequiredPhoneField(modalRoot)) {
    overlay.setStatus("Falta tu número personal. Agrégalo en el CV o complétalo en el modal para que puedan llamarte.");
  }
  const resumeHandled = await ensureLinkedInResumeSelection(modalRoot, cvFileName);
  const modalFileFields = collectFileFieldsInScope(modalRoot);
  const requiresResumeUpload = modalRequiresLinkedInResumeUpload(modalRoot);

  if (modalFileFields.length && (requiresResumeUpload || !resumeHandled)) {
    overlay.setStatus("Subiendo CV PDF al modal de LinkedIn...");
    await autofillResumeFiles(modalFileFields, {
      dataUrl: cvFileDataUrl,
      fileName: cvFileName,
      fileType: cvFileType,
      cvText,
      preferPdf: true
    });
  }
}

function modalRequiresLinkedInResumeUpload(root) {
  const text = cleanText(root?.textContent || "").toLowerCase();
  return /upload resume|be sure to include an updated resume|updated resume|resume/i.test(text);
}

function collectFileFieldsInScope(root) {
  return collectFileFields().filter((field) => {
    return root instanceof HTMLElement && field?.element instanceof HTMLElement && root.contains(field.element);
  });
}

async function resolveLinkedInValidationErrors({ profile, cvText, language, overlay }) {
  const modalRoot = findLinkedInEasyApplyRoot();
  if (!modalRoot) {
    return [];
  }

  const fixed = [];
  let attempts = 0;
  const maxAttempts = 3;

  while (attempts < maxAttempts) {
    const invalidFields = collectLinkedInInvalidFields(modalRoot);
    if (!invalidFields.length) {
      break;
    }

    for (const field of invalidFields) {
      const value = await buildBestEffortFieldValue(field, profile, cvText, language);
      if (!isMeaningfulValue(value)) {
        continue;
      }

      const applied = applyValueToField(field.element, value);
      if (!applied) {
        continue;
      }

      flashFilledField(field.element);
      fixed.push(field);
      overlay?.markField(field.label || field.name || field.type || "Campo", "done", "Auto", summarizeValueForUi(value));
      await delayMs(120);
    }

    await delayMs(300);
    attempts += 1;
  }

  const remainingErrors = collectLinkedInInvalidFields(modalRoot);
  if (remainingErrors.length && attempts >= maxAttempts) {
    overlay?.setStatus(language === "es" 
      ? `Quedan ${remainingErrors.length} campos con errores. Revísalos manualmente.` 
      : `${remainingErrors.length} fields still have errors. Please review manually.`);
  }

  return fixed;
}

function collectLinkedInInvalidFields(root) {
  const fillableFields = collectFillableFields().filter((field) => {
    return root instanceof HTMLElement && field?.element instanceof HTMLElement && root.contains(field.element);
  });

  return fillableFields.filter((field) => {
    const element = field.element;
    const container = element.closest(".fb-dash-form-element, .jobs-easy-apply-form-section__grouping, .artdeco-text-input, .artdeco-typeahead, .artdeco-inline-feedback");
    const containerText = cleanText(container?.textContent || "").toLowerCase();
    const invalidAttr = element.getAttribute("aria-invalid") === "true";
    const describedBy = String(element.getAttribute("aria-describedby") || "");
    const describedNode = describedBy ? document.getElementById(describedBy) : null;
    const describedText = cleanText(describedNode?.textContent || "").toLowerCase();
    const hasErrorCopy = /required|enter a valid|invalid|please enter|please select|completa|obligatorio|válido|invalid email|gib|erforderlich|ungültig|bitte/i.test(`${containerText} ${describedText}`);

    return invalidAttr || hasErrorCopy;
  });
}

async function buildBestEffortFieldValue(field, profile, cvText, language) {
  let inferred = inferFieldValue(field, profile, cvText, { aggressive: true, language });

  if (!isMeaningfulValue(inferred)) {
    try {
      const response = await sendRuntimeMessage({
        type: "GENERATE_FIELD_CONTENT",
        pageUrl: window.location.href,
        field: {
          label: field.label,
          name: field.name,
          type: field.type,
          options: field.options || []
        }
      });
      inferred = response?.success ? String(response.result?.value || "") : "";
    } catch {
      // Ignore and fall back.
    }
  }

  if (!isMeaningfulValue(inferred) && field.tag === "select" && field.options.length) {
    inferred = chooseSelectFallback(field, profile);
  }
  if (!isMeaningfulValue(inferred) && (field.type === "checkbox" || field.type === "radio")) {
    inferred = inferBooleanFallback(field);
  }
  if (!isMeaningfulValue(inferred) && field.tag === "textarea") {
    inferred = buildTextareaAnswer(field, profile, cvText, language);
  }

  return inferred;
}

function findLinkedInEasyApplyRoot() {
  return (
    document.querySelector(".jobs-easy-apply-modal") ||
    document.querySelector(".artdeco-modal[role='dialog']") ||
    document.querySelector("[role='dialog']")
  );
}

function findLinkedInFieldContainer(root, pattern) {
  const candidates = Array.from(root.querySelectorAll("label, fieldset, div"));
  return candidates.find((node) => pattern.test(cleanText(node.textContent || ""))) || null;
}

async function ensureLinkedInPhoneCountryCode(root, profile) {
  const targetLabel = profile.phoneCountryLabel || profile.phoneCountryCode || "";
  if (!targetLabel) {
    return false;
  }

  const container = findLinkedInFieldContainer(root, /phone country code|country code|dial code|código de área|código de país|landesvorwahl|vorwahl/i);
  if (!container) {
    return false;
  }

  const nativeSelect = container.querySelector("select");
  if (nativeSelect instanceof HTMLSelectElement) {
    const applied = selectOption(nativeSelect, targetLabel, false) || selectOption(nativeSelect, profile.phoneCountryCode || "", false);
    if (applied) {
      dispatch(nativeSelect);
      return true;
    }
  }

  const trigger =
    container.querySelector("[aria-haspopup='listbox']") ||
    container.querySelector("button") ||
    container.querySelector("[role='combobox']");

  if (!(trigger instanceof HTMLElement)) {
    return false;
  }

  trigger.click();
  await delayMs(180);

  const options = Array.from(document.querySelectorAll("[role='option'], li, div"))
    .filter((node) => node instanceof HTMLElement)
    .filter((node) => isElementVisible(node))
    .filter((node) => /(\+\d+)|switzerland|spain|colombia|mexico|argentina|peru|chile|usa|united states|germany|france|uk|united kingdom/i.test(cleanText(node.textContent || "")));

  const match = options.find((node) => cleanText(node.textContent || "").toLowerCase().includes(String(targetLabel).toLowerCase()))
    || options.find((node) => profile.phoneCountryCode && cleanText(node.textContent || "").includes(profile.phoneCountryCode));

  if (match instanceof HTMLElement) {
    match.click();
    await delayMs(120);
    return true;
  }

  return false;
}

function ensureLinkedInPhoneNumber(root, profile) {
  const phoneValue = profile.phoneNational || profile.phone || "";
  if (!phoneValue) {
    return false;
  }

  const phoneFields = collectFillableFields().filter((field) => {
    const lookup = `${field.label} ${field.name} ${field.type}`.toLowerCase();
    return /phone|mobile|telephone|tel|telefon|telefonnummer|handynummer|mobilnummer|handy/.test(lookup) && !/country code|dial code|código|landesvorwahl|vorwahl/.test(lookup);
  });

  for (const field of phoneFields) {
    if (!root.contains(field.element) || isFieldCompleted(field.element)) {
      continue;
    }
    const applied = applyValueToField(field.element, phoneValue);
    if (applied) {
      flashFilledField(field.element);
      return true;
    }
  }

  return false;
}

function modalHasRequiredPhoneField(root) {
  const phoneFields = collectFillableFields().filter((field) => {
    const lookup = `${field.label} ${field.name} ${field.type} ${field.contextText}`.toLowerCase();
    return root.contains(field.element) &&
      /phone|mobile|telephone|tel|telefon|telefonnummer|handynummer|mobilnummer|handy/.test(lookup) &&
      !/country code|dial code|código|landesvorwahl|vorwahl/.test(lookup);
  });

  return phoneFields.some((field) => field.required || /\*/.test(field.label || ""));
}

async function ensureLinkedInResumeSelection(root, cvFileName) {
  const normalizedFileName = String(cvFileName || "").trim().toLowerCase();
  const fileStem = normalizedFileName.replace(/\.[a-z0-9]+$/i, "");
  const section = findLinkedInFieldContainer(root, /resume|cv|updated resume|be sure to include an updated resume|upload resume/i);
  if (!section) {
    return false;
  }

  const radioCandidates = Array.from(section.querySelectorAll("input[type='radio'], input[type='checkbox']"));
  for (const input of radioCandidates) {
    const wrapper = input.closest("label, li, div");
    const text = cleanText(wrapper?.textContent || "");
    if (!text) continue;
    if ((normalizedFileName && text.toLowerCase().includes(normalizedFileName)) || (fileStem && text.toLowerCase().includes(fileStem))) {
      if (!input.checked) {
        input.click();
        await delayMs(120);
      }
      return true;
    }
  }

  const clickableResume = Array.from(section.querySelectorAll("label, button, [role='button'], li, div"))
    .filter((node) => node instanceof HTMLElement)
    .find((node) => {
      const text = cleanText(node.textContent || "").toLowerCase();
      return Boolean(text) && ((normalizedFileName && text.includes(normalizedFileName)) || (fileStem && text.includes(fileStem)));
    });

  if (clickableResume instanceof HTMLElement) {
    clickableResume.click();
    await delayMs(120);
    return true;
  }

  return false;
}

function inferLabelFromContext(element) {
  const walker = document.createTreeWalker(
    element.parentElement || document.body,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: (node) => {
        const text = cleanText(node.textContent || "");
        if (!text || text.length < 2 || text.length > 60) {
          return NodeFilter.FILTER_REJECT;
        }
        if (/^[a-z\s]+:$/i.test(text) || /^[a-z\s]+$/i.test(text)) {
          return NodeFilter.FILTER_ACCEPT;
        }
        return NodeFilter.FILTER_REJECT;
      }
    }
  );

  const nearbyLabels = [];
  let node;
  while ((node = walker.nextNode())) {
    const rect = node.parentElement?.getBoundingClientRect();
    const elemRect = element.getBoundingClientRect();
    if (rect && rect.bottom <= elemRect.top + 20 && Math.abs(rect.left - elemRect.left) < 200) {
      nearbyLabels.push(cleanText(node.textContent || ""));
    }
  }

  return nearbyLabels[nearbyLabels.length - 1] || "";
}

function getParentFieldContext(element) {
  const container = element.closest("fieldset, .artdeco-text-input, .fb-dash-form-element, .jobs-easy-apply-form-element, [data-form-element], label");
  if (!container) {
    return "";
  }
  
  const allText = Array.from(container.querySelectorAll("label, span, p, div"))
    .map((el) => cleanText(el.textContent || ""))
    .filter(Boolean)
    .join(" ");
  
  return cleanText(allText);
}

function inferPhoneCountryInfo(phone, location) {
  const normalizedPhone = String(phone || "").trim();
  const normalizedLocation = String(location || "").toLowerCase();
  const byCode = [
    { dialCode: "+41", label: "Switzerland (+41)", hints: ["switzerland", "zurich", "geneva", "basel", "bern"] },
    { dialCode: "+34", label: "Spain (+34)", hints: ["spain", "españa", "madrid", "barcelona", "valencia"] },
    { dialCode: "+57", label: "Colombia (+57)", hints: ["colombia", "bogota", "medellin", "cali"] },
    { dialCode: "+52", label: "Mexico (+52)", hints: ["mexico", "méxico", "cdmx", "guadalajara", "monterrey"] },
    { dialCode: "+54", label: "Argentina (+54)", hints: ["argentina", "buenos aires", "cordoba", "córdoba"] },
    { dialCode: "+51", label: "Peru (+51)", hints: ["peru", "perú", "lima"] },
    { dialCode: "+56", label: "Chile (+56)", hints: ["chile", "santiago"] },
    { dialCode: "+1", label: "United States (+1)", hints: ["united states", "usa", "miami", "new york", "san francisco"] },
    { dialCode: "+49", label: "Germany (+49)", hints: ["germany", "deutschland", "berlin", "munich"] },
    { dialCode: "+33", label: "France (+33)", hints: ["france", "paris", "lyon"] },
    { dialCode: "+44", label: "United Kingdom (+44)", hints: ["united kingdom", "uk", "london", "manchester"] }
  ];

  const codeMatch = byCode.find((item) => normalizedPhone.startsWith(item.dialCode));
  if (codeMatch) {
    return codeMatch;
  }

  const locationMatch = byCode.find((item) => item.hints.some((hint) => normalizedLocation.includes(hint)));
  if (locationMatch) {
    return locationMatch;
  }

  return { dialCode: "", label: "", hints: [] };
}

function extractNationalPhone(phone, countryInfo) {
  const raw = String(phone || "").trim();
  if (!raw) {
    return "";
  }

  const compact = raw.replace(/[^\d+]/g, "");
  if (countryInfo?.dialCode && compact.startsWith(countryInfo.dialCode)) {
    return compact.slice(countryInfo.dialCode.length).replace(/^\D+/, "");
  }

  return compact.replace(/^\+/, "");
}

function inferBooleanFallback(field) {
  const lookup = `${field.label} ${field.name}`.toLowerCase();
  if (/agree|consent|terms|privacy|policy|gdpr|subscribe|updates/.test(lookup)) {
    return "yes";
  }
  if (/disability|gender|race|ethnicity|veteran/.test(lookup)) {
    return "prefer not to say";
  }
  return "yes";
}

function isMeaningfulValue(value) {
  return !(value == null || String(value).trim() === "");
}

function isFieldCompleted(element) {
  if (element.getAttribute("aria-invalid") === "true") {
    return false;
  }

  const tag = element.tagName.toLowerCase();
  const type = (element.getAttribute("type") || tag).toLowerCase();
  if (tag === "select") {
    return Boolean(String(element.value || "").trim());
  }
  if (type === "checkbox" || type === "radio") {
    return Boolean(element.checked);
  }
  return Boolean(String(element.value || "").trim());
}

function shouldSkipField(field) {
  const lookup = `${field.label} ${field.name}`.toLowerCase();
  return /captcha|upload|resume|cv file|photo|avatar/.test(lookup);
}

function isDangerousField(field) {
  const lookup = `${field.label} ${field.name} ${field.type}`.toLowerCase();
  return /salary|compensation|expected pay|notice|visa|sponsorship|authorization|authorisation|criminal|background|felony|conviction|disability|gender|race|ethnicity|veteran|ssn|social security|tax|birthday|date of birth/.test(
    lookup
  );
}

function detectFormLanguage(fields) {
  const sample = `${document.documentElement.lang || ""} ${document.body?.innerText?.slice(0, 1200) || ""} ${fields
    .slice(0, 10)
    .map((field) => `${field.label} ${field.name}`)
    .join(" ")}`.toLowerCase();
  if (/\bes\b|español|salario|nombre|apellido|empresa|ubicación|teléfono|autorización|¿/.test(sample)) {
    return "es";
  }
  return "en";
}

function translateByLanguage(value, language) {
  if (language !== "es") {
    return value;
  }

  const translations = {
    Negotiable: "A convenir",
    "2 weeks": "2 semanas",
    "Please discuss": "Prefiero comentarlo en entrevista"
  };

  return translations[value] || value;
}

function buildFormScore({ fillableFields, summary, unresolved, dangerousFields }) {
  const total = fillableFields.filter((field) => !shouldSkipField(field)).length || 1;
  const completed = Math.min(summary.length, total);
  const unresolvedCount = unresolved.length;
  const ratio = Math.max(0, Math.min(100, Math.round((completed / total) * 100)));
  const readiness = unresolvedCount === 0 ? "Listo para revisar" : unresolvedCount <= 2 ? "Casi listo" : "Revisión pendiente";

  return {
    total,
    completed,
    resolved: total - unresolvedCount - completed,
    unresolved: unresolvedCount,
    dangerous: dangerousFields.length,
    ratio,
    readiness
  };
}

function flashFilledField(element) {
  element.classList.add("trcvastian-field-filled");
  window.setTimeout(() => element.classList.remove("trcvastian-field-filled"), 1800);
}

function delayMs(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function summarizeValueForUi(value) {
  const text = String(value || "").trim();
  if (text.length <= 48) {
    return text;
  }
  return `${text.slice(0, 45)}...`;
}

function mountMagicFieldButtons(profile, cvText, language) {
  cleanupMagicFieldButtons();
  const targets = collectFillableFields().filter((field) => field.tag === "textarea" || isMagicInputType(field.type));
  if (!targets.length) {
    return;
  }

  const buttons = [];
  for (const field of targets) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "trcvastian-magic-button";
    button.textContent = "✦";
    button.title = "Generar con AI";
    button.setAttribute("data-field-key", field.key);
    buttons.push({ button, field });
    document.body.appendChild(button);

    button.addEventListener("click", async () => {
      button.classList.add("is-loading");
      button.textContent = "…";
      try {
        const response = await sendRuntimeMessage({
          type: "GENERATE_FIELD_CONTENT",
          pageUrl: window.location.href,
          field: {
            label: field.label,
            name: field.name,
            type: field.type,
            options: field.options || []
          }
        });

        let value = response?.success ? String(response.result?.value || "") : "";
        if (!value.trim()) {
          value = inferFieldValue(field, profile, cvText, { aggressive: true, language });
        }

        if (isMeaningfulValue(value)) {
          applyValueToField(field.element, value);
          flashFilledField(field.element);
        }
      } catch {
        const fallback = inferFieldValue(field, profile, cvText, { aggressive: true, language });
        if (isMeaningfulValue(fallback)) {
          applyValueToField(field.element, fallback);
          flashFilledField(field.element);
        }
      } finally {
        button.classList.remove("is-loading");
        button.textContent = "✦";
      }
    });
  }

  const positionButtons = () => {
    for (const entry of buttons) {
      if (!document.body.contains(entry.field.element)) {
        continue;
      }

      const rect = entry.field.element.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        entry.button.style.display = "none";
        continue;
      }

      entry.button.style.display = "inline-flex";
      entry.button.style.top = `${window.scrollY + rect.top + 6}px`;
      entry.button.style.left = `${window.scrollX + rect.right - 34}px`;
    }
  };

  positionButtons();
  const onScroll = () => positionButtons();
  const onResize = () => positionButtons();
  window.addEventListener("scroll", onScroll, true);
  window.addEventListener("resize", onResize);
  document.body.dataset.trcvastianMagicMounted = "1";
  document.body.__trcvastianMagicCleanup = () => {
    window.removeEventListener("scroll", onScroll, true);
    window.removeEventListener("resize", onResize);
    for (const entry of buttons) {
      entry.button.remove();
    }
  };
}

function cleanupMagicFieldButtons() {
  const cleanup = document.body.__trcvastianMagicCleanup;
  if (typeof cleanup === "function") {
    cleanup();
  }
  delete document.body.__trcvastianMagicCleanup;
  delete document.body.dataset.trcvastianMagicMounted;
  for (const button of document.querySelectorAll(".trcvastian-magic-button")) {
    button.remove();
  }
}

function isMagicInputType(type) {
  return ["text", "email", "tel", "url", "search"].includes(String(type || "").toLowerCase());
}

function scrapeJobContext() {
  const companyInfo = extractCompanyInfo();
  const title = pickText([
    ".job-details-jobs-unified-top-card__job-title",
    ".top-card-layout__title",
    "[data-job-title]",
    "h1"
  ]);
  const company = pickText([
    ".job-details-jobs-unified-top-card__company-name",
    ".topcard__org-name-link",
    ".topcard__flavor a",
    "[data-company-name]"
  ]);
  const location = pickText([
    ".job-details-jobs-unified-top-card__primary-description-container",
    ".topcard__flavor--bullet",
    "[data-job-location]"
  ]);
  const description = pickText([
    ".jobs-description__content",
    ".jobs-box__html-content",
    ".show-more-less-html__markup",
    "main",
    "article"
  ]);
  const applyLabel = pickText([
    "button.jobs-apply-button",
    "a.jobs-apply-button",
    "button[data-live-test-job-apply-button]"
  ]);
  const companyLogoUrl = normalizeAbsoluteUrl(
    document.querySelector(".job-details-jobs-unified-top-card__company-logo img")?.getAttribute("src") ||
      document.querySelector(".jobs-unified-top-card__company-logo img")?.getAttribute("src") ||
      document.querySelector(".artdeco-entity-image img")?.getAttribute("src") ||
      document.querySelector("img[alt*='logo' i]")?.getAttribute("src") ||
      ""
  );

  return {
    pageTitle: document.title || "",
    title,
    company: company || companyInfo.name,
    location,
    description: trimText(description, 7000),
    companySummary: companyInfo.summary,
    companyLinkedInUrl: companyInfo.linkedinUrl,
    companyOfficialUrl: companyInfo.officialUrl,
    companyWikipediaUrl: companyInfo.wikipediaUrl,
    companyLogoUrl,
    applyLabel,
    isLinkedIn: window.location.hostname.includes("linkedin.com"),
    url: window.location.href
  };
}

function extractCompanyInfo() {
  const name = pickText([
    ".job-details-jobs-unified-top-card__company-name",
    ".topcard__org-name-link",
    "[data-company-name]",
    "a[href*='/company/']"
  ]);

  const linkedinUrl = normalizeAbsoluteUrl(
    document.querySelector("a[href*='/company/']")?.getAttribute("href") || ""
  );

  const officialUrl = normalizeAbsoluteUrl(
    document.querySelector("a[href^='https://']:not([href*='linkedin.com'])")?.getAttribute("href") ||
      document.querySelector("a[href^='http://']:not([href*='linkedin.com'])")?.getAttribute("href") ||
      ""
  );

  const summary = trimText(
    pickText([
      ".jobs-company__company-description",
      ".jobs-company__company-description p",
      ".jobs-company__box p",
      ".jobs-company__box .t-14",
      ".job-details-about-company-module__company-description",
      ".job-details-about-company-module p",
      "[data-test-id='about-company']",
      "[data-test-id='company-description']"
    ]) || findSectionText(["about the company", "sobre la empresa", "company", "empresa"]),
    420
  );

  const wikipediaUrl = name
    ? `https://en.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(name)}`
    : "";

  return {
    name,
    summary,
    linkedinUrl,
    officialUrl,
    wikipediaUrl
  };
}

function findSectionText(headings) {
  const targets = Array.isArray(headings) ? headings : [headings];
  const nodes = Array.from(document.querySelectorAll("h1, h2, h3, h4, strong, span"));

  for (const node of nodes) {
    const label = cleanText(node.textContent || "").toLowerCase();
    if (!targets.some((item) => label.includes(String(item).toLowerCase()))) {
      continue;
    }

    const section = node.closest("section, article, div");
    const text = cleanText(section?.textContent || "");
    if (text && text.length > 40) {
      return text;
    }
  }

  return "";
}

function scrapeJobList() {
  if (isLinkedInJobViewPage()) {
    const current = scrapeJobContext();
    if (current.title || current.pageTitle) {
      return [
        {
          id: current.url || window.location.href,
          title: current.title || current.pageTitle || "Job actual",
          company: current.company || "",
          location: current.location || "",
          url: current.url || window.location.href,
          description: current.description || "",
          easyApply: /easy apply/i.test(current.applyLabel || ""),
          companyLogoUrl: current.companyLogoUrl || ""
        }
      ];
    }
  }

  const selectors = [
    ".jobs-search-results-list a[href*='/jobs/view/']",
    ".job-card-container__link[href*='/jobs/view/']",
    "a.job-card-list__title[href*='/jobs/view/']",
    "a[href*='/jobs/view/']"
  ];

  const seen = new Set();
  const jobs = [];

  for (const selector of selectors) {
    const links = Array.from(document.querySelectorAll(selector));

    for (const link of links) {
      const url = normalizeJobUrl(link.href);
      const container =
        link.closest("li") ||
        link.closest(".job-card-container") ||
        link.closest("article") ||
        link.parentElement;

      const title = cleanText(
        container?.querySelector(".job-card-list__title, .job-card-container__link, a.job-card-list__title, [data-job-title], h3, h4")?.textContent ||
          link.textContent ||
          ""
      );

      if (!url || !title || seen.has(url) || !looksLikeJobTitle(title)) {
        continue;
      }

      const company = cleanText(
        container?.querySelector(".artdeco-entity-lockup__subtitle, .job-card-container__company-name, h4, .subtitle")?.textContent || ""
      );
      const location = cleanText(
        container?.querySelector(".job-card-container__metadata-wrapper, .job-card-container__metadata-item, .artdeco-entity-lockup__caption")?.textContent ||
          ""
      );
      const easyApply = /easy apply/i.test(cleanText(container?.textContent || ""));
      const companyLogoUrl = normalizeAbsoluteUrl(
        container?.querySelector("img")?.getAttribute("src") ||
        ""
      );

      seen.add(url);
      jobs.push({
        id: url,
        title,
        company,
        location,
        url,
        description: cleanText(container?.textContent || ""),
        easyApply,
        companyLogoUrl
      });
    }

    if (jobs.length >= 12) {
      break;
    }
  }

  if (!jobs.length) {
    const current = scrapeJobContext();
    if (current.title || current.pageTitle) {
      jobs.push({
        id: current.url || window.location.href,
        title: current.title || current.pageTitle || "Job actual",
        company: current.company || "",
        location: current.location || "",
        url: current.url || window.location.href,
        description: current.description || "",
        easyApply: /easy apply/i.test(current.applyLabel || ""),
        companyLogoUrl: current.companyLogoUrl || ""
      });
    }
  }

  return jobs.slice(0, 12);
}

function looksLikeJobTitle(value) {
  const text = cleanText(value);
  if (!text || text.length < 8) {
    return false;
  }

  if (/^(remote|hybrid|onsite|on-site|full[- ]?time|part[- ]?time|contract|temporary|internship)$/i.test(text)) {
    return false;
  }

  return /[a-z]/i.test(text) && /\s/.test(text);
}

function pickText(selectors) {
  for (const selector of selectors) {
    const node = document.querySelector(selector);
    const text = node?.textContent?.trim();
    if (text) {
      return text.replace(/\s+/g, " ");
    }
  }

  return "";
}

function trimText(value, maxLength) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 1)}…`;
}

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeJobUrl(value) {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }

  try {
    const url = new URL(text, window.location.href);
    url.hash = "";
    url.search = "";
    return url.toString();
  } catch {
    return "";
  }
}

function normalizeAbsoluteUrl(value) {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }

  try {
    return new URL(text, window.location.href).toString();
  } catch {
    return "";
  }
}

function extractApplyDestination() {
  const candidates = findApplyCandidates();

  for (const candidate of candidates) {
    const { target, anchor, applyLabel, href } = candidate;

    if (/linkedin\.com\/jobs\/collections\//i.test(href) || /similar-jobs/i.test(href)) {
      continue;
    }

    if (href && !href.includes("linkedin.com")) {
      if (typeof target.click === "function") {
        target.click();
      }
      return {
        externalUrl: href,
        mode: "external_apply",
        applyLabel
      };
    }

    if (typeof target.click === "function") {
      target.click();
      return {
        externalUrl: "",
        mode: inferApplyMode(applyLabel),
        applyLabel
      };
    }
  }

  return {
    externalUrl: "",
    mode: "",
    applyLabel: ""
  };
}

function findApplyCandidates() {
  const selectors = [
    "a.jobs-apply-button",
    "button.jobs-apply-button",
    "a[data-live-test-job-apply-button]",
    "button[data-live-test-job-apply-button]",
    "a[href*='apply']",
    "button[aria-label*='Apply']",
    "a[aria-label*='Apply']",
    "button[data-control-name*='apply']",
    "a[data-control-name*='apply']",
    "button",
    "a"
  ];

  const seen = new Set();
  const candidates = [];
  const scopedRoots = isLinkedInJobViewPage()
    ? [
        document.querySelector(".job-details-jobs-unified-top-card__container--two-pane"),
        document.querySelector(".jobs-unified-top-card"),
        document.querySelector(".job-view-layout")
      ].filter(Boolean)
    : [document];
  const roots = scopedRoots.length ? [...scopedRoots, document] : [document];

  for (const root of roots) {
    for (const selector of selectors) {
      const nodes = Array.from(root.querySelectorAll(selector));
      for (const target of nodes) {
      if (!(target instanceof HTMLElement)) {
        continue;
      }

      const signature = buildElementSignature(target);
      if (seen.has(signature)) {
        continue;
      }
      seen.add(signature);

      const anchor = target.tagName.toLowerCase() === "a" ? target : target.closest("a");
      const applyLabel = cleanText([
        target.textContent,
        target.getAttribute("aria-label"),
        target.getAttribute("data-control-name"),
        target.getAttribute("data-live-test-job-apply-button")
      ].filter(Boolean).join(" "));
      const href = normalizeAbsoluteUrl(
        anchor?.href ||
          target.getAttribute?.("href") ||
          target.getAttribute?.("data-apply-url") ||
          target.dataset?.applyUrl ||
          ""
      );

      if (/linkedin\.com\/jobs\/collections\//i.test(href) || /similar-jobs/i.test(href)) {
        continue;
      }

      if (!isApplyLikeLabel(applyLabel) && !looksLikeExternalApplyUrl(href)) {
        continue;
      }

      candidates.push({
        target,
        anchor,
        applyLabel,
        href,
        external: looksLikeExternalApplyUrl(href)
      });
    }
    }
  }

  return candidates.sort((left, right) => scoreApplyCandidate(right) - scoreApplyCandidate(left));
}

function scoreApplyCandidate(candidate) {
  let score = 0;
  const label = String(candidate.applyLabel || "").toLowerCase();
  const href = String(candidate.href || "").toLowerCase();

  if (/easy apply/.test(label)) score += 50;
  if (/(apply|application|submit application|postular|postulate|postulación|solicitar|solicitud|enviar solicitud|aplicar)/.test(label)) score += 30;
  if (candidate.target.matches(".jobs-apply-button, [data-live-test-job-apply-button]")) score += 25;
  if (looksLikeExternalApplyUrl(href)) score += 20;
  if (/lever|greenhouse|workday|smartrecruiters|ashby|myworkdayjobs/.test(href)) score += 35;
  if (candidate.target.offsetParent !== null) score += 10;

  return score;
}

function inferApplyMode(applyLabel) {
  const label = String(applyLabel || "").toLowerCase();
  if (/easy apply/.test(label)) {
    return "easy_apply";
  }
  if (/(apply|postular|postulate|solicitar|aplicar|enviar solicitud)/.test(label)) {
    return "apply_clicked";
  }
  return "internal_apply";
}

function isApplyLikeLabel(value) {
  const label = String(value || "").toLowerCase();
  return /(easy apply|apply now|apply|application|submit application|postular|postúlate|postulate|postulación|solicitar|solicitud|enviar solicitud|aplicar|inscribirme|inscribirse)/.test(label);
}

function looksLikeExternalApplyUrl(value) {
  const href = String(value || "").toLowerCase();
  if (!href) {
    return false;
  }

  return !href.includes("linkedin.com") && /(apply|postul|solicit|lever|greenhouse|workday|smartrecruiters|ashby|myworkdayjobs|jobs\.)/.test(href);
}

function buildElementSignature(target) {
  return [
    target.tagName,
    target.getAttribute("href") || "",
    target.getAttribute("aria-label") || "",
    target.getAttribute("data-control-name") || "",
    cleanText(target.textContent || "").slice(0, 80)
  ].join("|");
}

function highlightLinkedInRecommendations(recommendations) {
  if (!window.location.hostname.includes("linkedin.com")) {
    return;
  }

  ensureRecommendationStyles();
  cleanupRecommendationBadges();
  const recommendedByUrl = new Map(recommendations.map((item) => [normalizeJobUrl(item.url), item]));

  if (isLinkedInJobViewPage()) {
    const currentRecommendation = recommendedByUrl.get(normalizeJobUrl(window.location.href));
    if (currentRecommendation) {
      renderLinkedInJobViewBadge(currentRecommendation);
    }
    return;
  }

  const cards = Array.from(
    document.querySelectorAll(
      ".jobs-search-results-list a[href*='/jobs/view/'], .job-card-container__link[href*='/jobs/view/'], a.job-card-list__title[href*='/jobs/view/']"
    )
  );

  for (const link of cards) {
    const url = normalizeJobUrl(link.href);
    const recommendation = recommendedByUrl.get(url);
    const card =
      link.closest("li") ||
      link.closest(".job-card-container") ||
      link.closest("article") ||
      link.parentElement;

    if (!card) {
      continue;
    }

    card.classList.remove("cv-apply-recommended", "cv-apply-top-pick", "cv-apply-weak");

    if (!recommendation) {
      continue;
    }

    if (recommendation.tier === "weak") {
      card.classList.add("cv-apply-weak");
    } else {
      card.classList.add("cv-apply-recommended");
    }

    if (recommendation.topPick) {
      card.classList.add("cv-apply-top-pick");
    }

    const badge = document.createElement("div");
    badge.className = "cv-apply-badge";
    badge.dataset.tier = recommendation.tier || "low";
    if (recommendation.easyApply) {
      badge.dataset.easyApply = "true";
    }
    badge.textContent = buildBadgeText(recommendation);
    card.prepend(badge);
  }
}

function cleanupRecommendationBadges() {
  for (const badge of document.querySelectorAll(".cv-apply-badge, .cv-apply-hero-badge")) {
    badge.remove();
  }

  for (const node of document.querySelectorAll(".cv-apply-recommended, .cv-apply-top-pick, .cv-apply-weak, .cv-apply-hero-target")) {
    node.classList.remove("cv-apply-recommended", "cv-apply-top-pick", "cv-apply-weak", "cv-apply-hero-target");
  }
}

function isLinkedInJobViewPage() {
  return /linkedin\.com\/jobs\/view\//i.test(window.location.href);
}

function isLikelyApplicationFormPage() {
  if (!/^https?:/i.test(window.location.protocol)) {
    return false;
  }

  if (isLinkedInJobViewPage()) {
    return false;
  }

  const url = `${window.location.hostname}${window.location.pathname}`.toLowerCase();
  const form = document.querySelector("form");
  const fillableFields = collectFillableFields();
  const fileFields = collectFileFields();
  const bodyText = cleanText(document.body?.innerText || "").toLowerCase().slice(0, 5000);
  const headingsText = Array.from(document.querySelectorAll("h1, h2, h3, legend, label, strong"))
    .map((element) => cleanText(element.textContent || ""))
    .join(" ")
    .toLowerCase();
  const applyButtons = Array.from(document.querySelectorAll("button, input[type='submit'], a"))
    .map((element) => cleanText(element.textContent || element.getAttribute("value") || ""))
    .join(" ")
    .toLowerCase();
  const hasIdentityFields = fillableFields.some((field) => /name|full name|first name|last name|nombre|apellido|email|correo|phone|mobile|tel[eé]fono/i.test(`${field.label} ${field.name}`));
  const hasResumeSignals =
    fileFields.length > 0 ||
    /resume|updated resume|upload file|upload resume|upload cv|curriculum|cv|hoja de vida|adjuntar cv|subir cv|subir hoja de vida|autofill from resume/.test(bodyText) ||
    /resume|updated resume|upload file|application|basic info|informaci[oó]n b[aá]sica|hoja de vida|curriculum|cv|autofill from resume/.test(headingsText);
  const hasApplicationSignals =
    /(apply|application|submit application|candidate|candidate profile|cover letter|work authorization|basic info|personal information|informaci[oó]n personal|datos personales|informaci[oó]n b[aá]sica|ashby|greenhouse|lever|workday)/.test(url) ||
    /(apply|application|submit application|candidate profile|resume|curriculum|cover letter|work authorization|basic info|personal information|informaci[oó]n personal|datos personales|informaci[oó]n b[aá]sica|autofill from resume)/.test(bodyText) ||
    /(apply|submit application|continue application|send application|postular|postúlate|solicitar|continuar solicitud|enviar solicitud)/.test(applyButtons);

  const hasBasicFields = fillableFields.length >= 1;
  const formLikeStructure = Boolean(form) || fillableFields.length >= 2;
  const likelyForm = formLikeStructure && hasBasicFields && (hasApplicationSignals || hasIdentityFields || hasResumeSignals);

  return likelyForm;
}

function isLikelyJobDetailPage() {
  if (!/^https?:/i.test(window.location.protocol)) {
    return false;
  }

  if (isLikelyApplicationFormPage()) {
    return false;
  }

  if (isLinkedInJobViewPage()) {
    return true;
  }

  const url = `${window.location.hostname}${window.location.pathname}`.toLowerCase();
  const title = cleanText(document.title || "").toLowerCase();
  const headings = Array.from(document.querySelectorAll("h1, h2"))
    .map((element) => cleanText(element.textContent || ""))
    .join(" ")
    .toLowerCase();
  const bodyText = cleanText(document.body?.innerText || "").toLowerCase().slice(0, 5000);
  const hasApplyButton = Boolean(findApplyCandidates().length > 0);
  const hasJobCopy =
    /(about the job|job description|responsibilities|requirements|qualifications|about this role|sobre el empleo|descripción del puesto)/.test(bodyText) ||
    /(jobs|careers|job|empleo|trabajo)/.test(url);
  const hasRoleTitle =
    /(engineer|developer|designer|manager|analyst|specialist|frontend|backend|full stack|product|marketing|sales|qa|devops)/.test(title) ||
    /(engineer|developer|designer|manager|analyst|specialist|frontend|backend|full stack|product|marketing|sales|qa|devops)/.test(headings);

  return hasApplyButton && hasJobCopy && hasRoleTitle;
}

function renderLinkedInJobViewBadge(recommendation) {
  const topCard = document.querySelector(".job-details-jobs-unified-top-card__container--two-pane") ||
    document.querySelector(".job-details-jobs-unified-top-card__content--two-pane") ||
    document.querySelector(".jobs-unified-top-card") ||
    document.querySelector(".job-view-layout");

  if (!(topCard instanceof HTMLElement)) {
    return;
  }

  topCard.classList.add("cv-apply-hero-target");

  const badge = document.createElement("div");
  badge.className = "cv-apply-hero-badge";
  badge.dataset.tier = recommendation.tier || "low";
  badge.innerHTML = `
    <span class="cv-apply-hero-label">${escapeHtml(recommendation.topPick ? "Top Match" : recommendation.tier === "good" ? "Good Fit" : "Match")}</span>
    <span class="cv-apply-hero-score">${escapeHtml(recommendation.score || "--")}%</span>
  `;

  if (recommendation.easyApply) {
    badge.setAttribute("data-easy-apply", "true");
  }

  topCard.appendChild(badge);
}

function ensureRecommendationStyles() {
  if (document.getElementById("cv-apply-linkedin-styles")) {
    return;
  }

  const style = document.createElement("style");
  style.id = "cv-apply-linkedin-styles";
  style.textContent = `
    .cv-apply-recommended {
      position: relative;
      background: linear-gradient(180deg, rgba(219, 241, 254, 0.88) 0%, rgba(255, 255, 255, 0.96) 100%) !important;
      box-shadow: 0 0 0 2px rgba(28, 93, 128, 0.16), 0 20px 34px rgba(7, 30, 39, 0.06) !important;
      border-radius: 18px !important;
    }

    .cv-apply-top-pick {
      box-shadow: 0 0 0 2px rgba(0, 69, 100, 0.24), 0 24px 38px rgba(0, 69, 100, 0.1) !important;
    }

    .cv-apply-weak {
      opacity: 0.52 !important;
      filter: saturate(0.72) !important;
    }

    .cv-apply-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      margin: 10px 10px 0;
      padding: 6px 10px;
      border-radius: 999px;
      background: linear-gradient(135deg, rgba(0, 69, 100, 0.96) 0%, rgba(28, 93, 128, 0.9) 100%);
      color: white;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .cv-apply-hero-target {
      position: relative !important;
    }

    .cv-apply-hero-badge {
      position: absolute;
      right: 24px;
      top: 24px;
      z-index: 3;
      display: inline-flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-width: 96px;
      min-height: 96px;
      padding: 14px 12px;
      border-radius: 24px;
      background: rgba(255, 255, 255, 0.94);
      box-shadow: 0 18px 36px rgba(7, 30, 39, 0.14), inset 0 0 0 1px rgba(193,199,209,0.2);
      backdrop-filter: blur(10px);
    }

    .cv-apply-hero-badge[data-tier="top"] {
      background: rgba(15, 93, 134, 0.96);
      color: white;
    }

    .cv-apply-hero-badge[data-tier="good"] {
      background: rgba(219, 243, 239, 0.98);
      color: #0d6862;
    }

    .cv-apply-hero-badge[data-tier="medium"] {
      background: rgba(237, 245, 250, 0.98);
      color: #476270;
    }

    .cv-apply-hero-label {
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      text-align: center;
      line-height: 1.1;
    }

    .cv-apply-hero-score {
      margin-top: 6px;
      font-size: 28px;
      font-weight: 800;
      line-height: 1;
      letter-spacing: -0.03em;
    }

    .cv-apply-hero-badge[data-easy-apply="true"]::after {
      content: "Easy Apply";
      margin-top: 8px;
      padding: 4px 8px;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.16);
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.04em;
    }

    .cv-apply-badge[data-tier="top"] {
      background: linear-gradient(135deg, rgba(0, 69, 100, 0.96) 0%, rgba(28, 93, 128, 0.92) 100%);
      box-shadow: 0 10px 18px rgba(0, 69, 100, 0.18);
    }

    .cv-apply-badge[data-tier="good"] {
      background: linear-gradient(135deg, rgba(10, 102, 194, 0.92) 0%, rgba(71, 145, 214, 0.88) 100%);
      box-shadow: 0 10px 18px rgba(10, 102, 194, 0.16);
    }

    .cv-apply-badge[data-tier="medium"] {
      background: linear-gradient(135deg, rgba(10, 93, 116, 0.92) 0%, rgba(63, 132, 151, 0.84) 100%);
      box-shadow: 0 10px 18px rgba(10, 93, 116, 0.14);
    }

    .cv-apply-badge[data-easy-apply="true"]::after {
      content: "Easy Apply";
      margin-left: 4px;
      padding: 2px 6px;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.16);
      font-size: 10px;
      letter-spacing: 0.04em;
      text-transform: none;
    }

    @media (max-width: 1200px) {
      .cv-apply-hero-badge {
        right: 18px;
        top: 18px;
        min-width: 84px;
        min-height: 84px;
        padding: 12px 10px;
      }

      .cv-apply-hero-score {
        font-size: 24px;
      }
    }
  `;

  document.head.appendChild(style);
}

function ensureLinkedInAutoApplyStyles() {
  if (document.getElementById("trcvastian-linkedin-autoapply-styles")) {
    return;
  }

  const style = document.createElement("style");
  style.id = "trcvastian-linkedin-autoapply-styles";
  style.textContent = `
    .trcvastian-linkedin-autoapply-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      min-width: 188px;
      padding: 0 22px;
      height: 50px;
      border: 1px solid rgba(10, 102, 194, 0.16);
      border-radius: 999px;
      background: linear-gradient(135deg, rgba(232, 240, 254, 0.98) 0%, rgba(220, 234, 255, 0.98) 100%);
      color: #0a66c2;
      font: 700 16px/1 "SF Pro Display", "Segoe UI", Inter, system-ui, sans-serif;
      letter-spacing: -0.01em;
      cursor: pointer;
      box-shadow: 0 4px 14px rgba(10, 102, 194, 0.08), inset 0 0 0 1px rgba(255, 255, 255, 0.72);
      transition: transform 0.18s ease, box-shadow 0.18s ease, opacity 0.18s ease, filter 0.18s ease, background 0.18s ease;
      margin-right: 12px;
      white-space: nowrap;
    }

    .trcvastian-linkedin-autoapply-btn:hover {
      transform: translateY(-1px);
      box-shadow: 0 10px 24px rgba(10, 102, 194, 0.14), inset 0 0 0 1px rgba(255, 255, 255, 0.8);
    }

    .trcvastian-linkedin-autoapply-btn:disabled {
      cursor: progress;
      opacity: 0.9;
    }

    .trcvastian-linkedin-autoapply-dot {
      width: 16px;
      height: 16px;
      border-radius: 999px;
      background: linear-gradient(135deg, #0a66c2 0%, #60a5fa 100%);
      box-shadow: 0 0 0 5px rgba(10, 102, 194, 0.12);
      flex-shrink: 0;
    }

    .trcvastian-linkedin-autoapply-btn.is-loading {
      filter: saturate(0.92);
    }

    .trcvastian-linkedin-autoapply-btn.is-loading .trcvastian-linkedin-autoapply-dot {
      animation: trcvastian-pulse 0.9s ease-in-out infinite;
    }

    .trcvastian-linkedin-autoapply-btn.is-success {
      background: linear-gradient(135deg, rgba(220, 252, 231, 0.98) 0%, rgba(209, 250, 229, 0.98) 100%);
      color: #15803d;
    }

    .trcvastian-linkedin-autoapply-btn.is-success .trcvastian-linkedin-autoapply-dot {
      background: linear-gradient(135deg, #16a34a 0%, #4ade80 100%);
      box-shadow: 0 0 0 6px rgba(22, 163, 74, 0.12);
    }

    .trcvastian-linkedin-autoapply-btn.is-error {
      background: linear-gradient(135deg, rgba(254, 226, 226, 0.98) 0%, rgba(255, 241, 242, 0.98) 100%);
      color: #b91c1c;
    }

    .trcvastian-linkedin-autoapply-btn.is-error .trcvastian-linkedin-autoapply-dot {
      background: linear-gradient(135deg, #dc2626 0%, #fb7185 100%);
      box-shadow: 0 0 0 6px rgba(220, 38, 38, 0.1);
    }

    @keyframes trcvastian-pulse {
      0%, 100% { transform: scale(1); opacity: 1; }
      50% { transform: scale(0.88); opacity: 0.72; }
    }
  `;

  document.head.appendChild(style);
}

function buildBadgeText(recommendation) {
  const prefix =
    recommendation.topPick ? "Top Match" : recommendation.tier === "good" ? "Good Fit" : recommendation.tier === "medium" ? "Medium Fit" : "Weak Fit";
  const easy = recommendation.easyApply ? " Easy Apply" : "";
  return `${prefix} ${recommendation.score}%${easy}`;
}

function initTrcvastianScan() {
  if (!/^https?:/i.test(window.location.protocol)) {
    return;
  }

  ensureScanWidgetStyles();
  
  const checkBodyExists = () => {
    if (!document.body) {
      setTimeout(checkBodyExists, 100);
      return;
    }
    
    let mounted = false;
    let observerTimeout = null;

    const tryMount = () => {
      if (observerTimeout) {
        clearTimeout(observerTimeout);
      }
      observerTimeout = setTimeout(() => {
        const shouldShow = isLikelyJobDetailPage() || isEligibleUnifiedAutofillPage();
        const existing = document.getElementById("trcvastian-scan-root");
        
        if (shouldShow && !existing) {
          mountUnifiedWidget();
          mounted = true;
        } else if (shouldShow && mounted && existing) {
          updateUnifiedWidget(existing);
          return;
        } else if (!shouldShow && existing) {
          existing.remove();
          mounted = false;
        }
      }, 500);
    };

    tryMount();

    const observer = new MutationObserver(() => {
      tryMount();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    
    window.addEventListener("popstate", () => tryMount());
    
    let lastUrl = window.location.href;
    const urlCheckInterval = setInterval(() => {
      if (window.location.href !== lastUrl) {
        lastUrl = window.location.href;
        tryMount();
      }
    }, 1000);
    
     window.addEventListener("pagehide", () => clearInterval(urlCheckInterval));
  };
  
  checkBodyExists();
}

async function isEligibleUnifiedAutofillPage() {
  if (isLinkedInHost()) {
    return false;
  }

  if (!isLikelyApplicationFormPage()) {
    return false;
  }

  return hasLinkedInExternalAutofillContext();
}

function getUnifiedWidgetMode() {
  if (isLikelyJobDetailPage()) {
    return "job";
  }

  if (!isLinkedInHost() && isLikelyApplicationFormPage()) {
    return "form";
  }

  return "job";
}

const TRCVASTIAN_WIDGET_POSITION_KEY = "trcvastianWidgetPosition";

function getStoredWidgetPosition() {
  try {
    const raw = window.localStorage.getItem(TRCVASTIAN_WIDGET_POSITION_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    if (typeof parsed?.top === "number" && typeof parsed?.right === "number") {
      return parsed;
    }
  } catch {}

  return null;
}

function setStoredWidgetPosition(position) {
  try {
    window.localStorage.setItem(TRCVASTIAN_WIDGET_POSITION_KEY, JSON.stringify(position));
  } catch {}
}

function buildUnifiedWidgetMarkup(mode) {
  const isForm = mode === "form";
  const launcherLabel = isForm ? "Autofill" : "Job tools";
  const title = isForm ? "Autocompletar" : "Scan job";
  const copy = isForm
    ? "Completa este formulario con tu CV guardado."
    : "Analiza la vacante y luego postula en un solo lugar.";
  const primaryLabel = isForm ? "Autocompletar" : "Analizar";
  const secondaryLabel = isForm ? "Cerrar" : "AutoPostular";

  return `
    <button id="trcvastian-scan-button" type="button" class="trcvastian-scan-button">
      <span class="trcvastian-scan-orb" aria-hidden="true">
        <span class="trcvastian-scan-orb-core">TRC</span>
      </span>
      <span class="trcvastian-scan-copy" aria-hidden="true">
        <span class="trcvastian-scan-kicker">TRCVASTIAN</span>
        <span class="trcvastian-scan-name">${launcherLabel}</span>
      </span>
    </button>
    <div id="trcvastian-scan-panel" class="trcvastian-scan-panel hidden" data-mode="${mode}">
      <div class="trcvastian-panel-head">
        <div>
          <div class="trcvastian-kicker">TRCVASTIAN</div>
          <div class="trcvastian-title">${title}</div>
        </div>
        <div class="trcvastian-panel-head-actions">
          <button id="trcvastian-drag-handle" type="button" class="trcvastian-drag-handle" title="Mover widget" aria-label="Mover widget">
            <span></span><span></span><span></span>
          </button>
          <button id="trcvastian-close-panel" type="button" class="trcvastian-close">×</button>
        </div>
      </div>
      <p id="trcvastian-panel-status" class="trcvastian-copy">${copy}</p>
      <div id="trcvastian-loader" class="trcvastian-loader hidden">
        <div class="trcvastian-spinner"></div>
        <span id="trcvastian-loader-text">${isForm ? "Completando..." : "Analizando..."}</span>
      </div>
      <div id="trcvastian-company-card" class="trcvastian-company-card hidden">
        <div class="trcvastian-company-name" id="trcvastian-company-name">Empresa</div>
        <p class="trcvastian-company-summary" id="trcvastian-company-summary">Resumen</p>
        <div class="trcvastian-company-links" id="trcvastian-company-links"></div>
      </div>
      <div id="trcvastian-panel-badges" class="trcvastian-badges hidden">
        <span id="trcvastian-fit-badge" class="trcvastian-fit">--</span>
        <span id="trcvastian-verdict-badge" class="trcvastian-soft">Sin analizar</span>
      </div>
      <div id="trcvastian-panel-list" class="trcvastian-list"></div>
      <div class="trcvastian-actions ${isForm ? "trcvastian-actions-single" : ""}">
        <button id="trcvastian-analyze" type="button" class="trcvastian-action-primary">${primaryLabel}</button>
        <button id="trcvastian-apply" type="button" class="trcvastian-action-secondary">${secondaryLabel}</button>
      </div>
    </div>
  `;
}

function mountUnifiedWidget() {
  const existing = document.getElementById("trcvastian-scan-root");

  if (existing) {
    updateUnifiedWidget(existing);
    return;
  }

  const mode = getUnifiedWidgetMode();
  const root = document.createElement("div");
  root.id = "trcvastian-scan-root";
  root.innerHTML = buildUnifiedWidgetMarkup(mode);

  applyWidgetPosition(root);
  document.body.appendChild(root);
  bindUnifiedWidget(root);
}

function updateUnifiedWidget(root) {
  const panel = root.querySelector("#trcvastian-scan-panel");
  const currentMode = panel?.getAttribute("data-mode") || "";
  const nextMode = getUnifiedWidgetMode();
  if (currentMode === nextMode) {
    return;
  }

  const wasOpen = !panel?.classList.contains("hidden");
  root.innerHTML = buildUnifiedWidgetMarkup(nextMode);
  applyWidgetPosition(root);
  bindUnifiedWidget(root);
  if (wasOpen) {
    root.querySelector("#trcvastian-scan-panel")?.classList.remove("hidden");
  }
}

function applyWidgetPosition(root) {
  if (!root) {
    return;
  }

  const stored = getStoredWidgetPosition();
  if (stored) {
    root.style.top = `${Math.max(12, stored.top)}px`;
    root.style.right = `${Math.max(0, stored.right)}px`;
    root.style.bottom = "auto";
  }
}

function bindUnifiedWidget(root) {
  const panel = root.querySelector("#trcvastian-scan-panel");
  const status = root.querySelector("#trcvastian-panel-status");
  const list = root.querySelector("#trcvastian-panel-list");
  const badges = root.querySelector("#trcvastian-panel-badges");
  const fitBadge = root.querySelector("#trcvastian-fit-badge");
  const verdictBadge = root.querySelector("#trcvastian-verdict-badge");
  const companyCard = root.querySelector("#trcvastian-company-card");
  const companyName = root.querySelector("#trcvastian-company-name");
  const companySummary = root.querySelector("#trcvastian-company-summary");
  const companyLinks = root.querySelector("#trcvastian-company-links");
  const loader = root.querySelector("#trcvastian-loader");
  const loaderText = root.querySelector("#trcvastian-loader-text");
  const mode = panel?.getAttribute("data-mode") || "job";
  const isForm = mode === "form";
  const dragHandle = root.querySelector("#trcvastian-drag-handle");

  const showLoader = (text = "Analizando...") => {
    if (loader) {
      loader.classList.remove("hidden");
      if (loaderText) loaderText.textContent = text;
    }
    if (!isForm && badges) badges.classList.add("hidden");
    if (list) list.innerHTML = "";
  };

  const hideLoader = () => {
    if (loader) loader.classList.add("hidden");
  };

  root.querySelector("#trcvastian-scan-button")?.addEventListener("click", () => {
    panel?.classList.toggle("hidden");
  });

  root.querySelector("#trcvastian-close-panel")?.addEventListener("click", () => {
    panel?.classList.add("hidden");
  });

  dragHandle?.addEventListener("pointerdown", (event) => {
    if (!(event instanceof PointerEvent)) {
      return;
    }

    event.preventDefault();
    const rect = root.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    const startTop = rect.top;
    const startRight = Math.max(window.innerWidth - rect.right, 0);

    const move = (moveEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;
      const nextTop = Math.min(Math.max(12, startTop + deltaY), Math.max(12, window.innerHeight - 120));
      const nextRight = Math.min(Math.max(0, startRight - deltaX), Math.max(0, window.innerWidth - 120));
      root.style.top = `${nextTop}px`;
      root.style.right = `${nextRight}px`;
      root.style.bottom = "auto";
    };

    const up = () => {
      const top = parseFloat(root.style.top || `${rect.top}`) || rect.top;
      const right = parseFloat(root.style.right || `${startRight}`) || startRight;
      setStoredWidgetPosition({ top, right });
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
  });

  root.querySelector("#trcvastian-analyze")?.addEventListener("click", async () => {
    if (!status || !list || !badges || !fitBadge || !verdictBadge) return;

    if (isForm) {
      status.textContent = "Completando formulario...";
      showLoader("Completando...");
      try {
        const response = await sendRuntimeMessage({
          type: "AUTOFILL_REQUEST",
          tabUrl: window.location.href
        });

        if (!response?.success) {
          throw new Error(response?.reason || "No se pudo autocompletar.");
        }

        hideLoader();
        status.textContent = "✓ Formulario completado. Revisa y envía.";
        list.innerHTML = `<div class="trcvastian-item">Usamos tu CV guardado para completar los campos detectados.</div>`;
      } catch (error) {
        hideLoader();
        status.textContent = error instanceof Error ? error.message : "Error al completar.";
      }
      return;
    }

    status.textContent = "Analizando vacancy...";
    showLoader("Analizando...");

    try {
      const response = await sendRuntimeMessage({
        type: "ANALYZE_JOB_REQUEST",
        tabUrl: window.location.href
      });

      if (!response?.success) {
        throw new Error(response?.reason || "No se pudo analizar.");
      }

      const analysis = response.result?.localAnalysis;
      const ai = response.result?.aiAnalysis;
      const pageContext = response.result?.pageContext || {};
      const recommended = ai?.recommended ?? analysis?.recommended;
      const actions = ai?.tailoredTips?.length ? ai.tailoredTips : analysis?.suggestedActions || [];
      const gaps = ai?.gaps?.length ? ai.gaps : analysis?.gaps || [];

      hideLoader();

      status.textContent = recommended
        ? "✓ Vale pena aplicar"
        : "⚠ Revisa tu CV antes";
      fitBadge.textContent = analysis?.score ? `${analysis.score}%` : "--";
      verdictBadge.textContent = recommended ? "Good fit" : "Revisar";
      badges.classList.remove("hidden");
      renderCompanyCard(companyCard, companyName, companySummary, companyLinks, pageContext);

      const items = [
        ...(actions || []).slice(0, 2),
        ...(gaps || []).slice(0, 2).map((item) => `→ ${item}`)
      ].slice(0, 4);

      list.innerHTML = items.length
        ? items.map((item) => `<div class="trcvastian-item">${escapeHtml(item)}</div>`).join("")
        : `<div class="trcvastian-item">✓ Tu CV encaja bien</div>`;
      panel?.classList.remove("hidden");
    } catch (error) {
      hideLoader();
      status.textContent = error instanceof Error ? error.message : "Error al analizar.";
    }
  });

  root.querySelector("#trcvastian-apply")?.addEventListener("click", async () => {
    if (!status) return;

    if (isForm) {
      panel?.classList.add("hidden");
      return;
    }

    status.textContent = "Abriendo formulario...";
    showLoader("Abriendo...");
    try {
      const response = await sendRuntimeMessage({
        type: "APPLICATION_FLOW_REQUEST",
        jobUrl: window.location.href
      });

      if (!response?.success) {
        throw new Error(response?.reason || "No se pudo abrir.");
      }

      hideLoader();
      status.textContent = "✓ Listo. Revisa el formulario.";
    } catch (error) {
      hideLoader();
      status.textContent = error instanceof Error ? error.message : "Error.";
    }
  });
}

function renderCompanyCard(card, nameEl, summaryEl, linksEl, pageContext) {
  if (!card || !nameEl || !summaryEl || !linksEl) {
    return;
  }

  const companyName = String(pageContext?.company || "").trim();
  const summary = String(pageContext?.companySummary || "").trim();
  const links = [
    pageContext?.companyLinkedInUrl ? { label: "LinkedIn", url: pageContext.companyLinkedInUrl } : null,
    pageContext?.companyOfficialUrl ? { label: "Official", url: pageContext.companyOfficialUrl } : null,
    pageContext?.companyWikipediaUrl ? { label: "Wikipedia", url: pageContext.companyWikipediaUrl } : null
  ].filter(Boolean);

  if (!companyName && !summary && !links.length) {
    card.classList.add("hidden");
    return;
  }

  nameEl.textContent = companyName || "Company";
  summaryEl.textContent = summary || "No encontramos un resumen claro de la empresa en esta vacante.";
  linksEl.innerHTML = links
    .map((item) => `<a class="trcvastian-company-link" href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(item.label)}</a>`)
    .join("");
  card.classList.remove("hidden");
}

function ensureScanWidgetStyles() {
  if (document.getElementById("trcvastian-scan-styles")) {
    return;
  }

  const style = document.createElement("style");
  style.id = "trcvastian-scan-styles";
  style.textContent = `
    #trcvastian-scan-root {
      position: fixed;
      right: 0;
      top: 98px;
      z-index: 2147483000;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 10px;
      pointer-events: none;
    }
    .trcvastian-scan-button {
      display: inline-flex;
      align-items: center;
      gap: 12px;
      min-width: 198px;
      padding: 10px 18px 10px 10px;
      border: 0;
      border-radius: 999px 0 0 999px;
      background: rgba(255,255,255,0.92);
      color: #071e27;
      box-shadow: 0 16px 36px rgba(7, 30, 39, 0.14), inset 0 0 0 1px rgba(193,199,209,0.18);
      cursor: pointer;
      pointer-events: auto;
      backdrop-filter: blur(14px);
      overflow: hidden;
      transition: transform .22s ease, box-shadow .22s ease, background .22s ease;
      transform: translateX(0);
    }
    .trcvastian-scan-button:hover,
    #trcvastian-scan-root:hover .trcvastian-scan-button {
      transform: translateX(0);
      box-shadow: 0 18px 40px rgba(7, 30, 39, 0.18), inset 0 0 0 1px rgba(193,199,209,0.22);
    }
    .trcvastian-scan-orb {
      display: inline-flex;
      width: 46px;
      height: 46px;
      align-items: center;
      justify-content: center;
      border-radius: 999px;
      background:
        radial-gradient(circle at 30% 30%, rgba(255,255,255,0.28) 0%, rgba(255,255,255,0.08) 24%, transparent 25%),
        linear-gradient(180deg, #145f87 0%, #0c4969 100%);
      box-shadow: 0 10px 24px rgba(12, 73, 105, 0.22);
    }
    .trcvastian-scan-orb-core {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 34px;
      height: 34px;
      border-radius: 999px;
      background: rgba(255,255,255,0.12);
      color: white;
      font: 800 10px/1 Inter, system-ui, sans-serif;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      box-shadow: inset 0 0 0 1px rgba(255,255,255,0.12);
    }
    .trcvastian-scan-copy {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      white-space: nowrap;
      opacity: 1;
      transform: translateX(0);
      transition: opacity .18s ease, transform .18s ease;
    }
    .trcvastian-scan-button:hover .trcvastian-scan-copy,
    #trcvastian-scan-root:hover .trcvastian-scan-copy {
      opacity: 1;
      transform: translateX(0);
    }
    .trcvastian-scan-kicker {
      color: #6d8089;
      font: 700 10px/1 Inter, system-ui, sans-serif;
      letter-spacing: 0.18em;
      text-transform: uppercase;
    }
    .trcvastian-scan-name {
      color: #071e27;
      margin-top: 3px;
      font: 700 16px/1 Manrope, Inter, system-ui, sans-serif;
      letter-spacing: -0.02em;
    }
    .trcvastian-scan-panel {
      width: 328px;
      max-height: 56vh;
      overflow: auto;
      padding: 14px;
      border-radius: 20px;
      background:
        radial-gradient(circle at top right, rgba(129,243,229,0.16), transparent 28%),
        linear-gradient(180deg, rgba(247,251,254,0.98) 0%, rgba(255,255,255,0.98) 100%);
      box-shadow: 0 22px 48px rgba(7, 30, 39, 0.16), inset 0 0 0 1px rgba(193,199,209,0.18);
      color: #071e27;
      pointer-events: auto;
      backdrop-filter: blur(16px);
    }
    .trcvastian-scan-panel.hidden { display: none; }
    .trcvastian-panel-head { display:flex; align-items:start; justify-content:space-between; gap:10px; }
    .trcvastian-panel-head-actions { display:flex; align-items:center; gap:8px; }
    .trcvastian-kicker { color:#5f7680; font:700 10px/1 Inter, system-ui, sans-serif; letter-spacing:.22em; text-transform:uppercase; }
    .trcvastian-title { margin-top:4px; font:700 19px/1.05 Manrope, Inter, system-ui, sans-serif; letter-spacing:-.02em; }
    .trcvastian-drag-handle { display:inline-flex; align-items:center; justify-content:center; gap:3px; width:34px; height:34px; border:0; border-radius:999px; background:rgba(238,245,250,0.9); cursor:grab; color:#56707b; box-shadow: inset 0 0 0 1px rgba(193,199,209,.22); }
    .trcvastian-drag-handle:active { cursor:grabbing; }
    .trcvastian-drag-handle span { width:3px; height:3px; border-radius:999px; background:currentColor; display:block; }
    .trcvastian-close { border:0; background:rgba(238,245,250,0.9); width:28px; height:28px; border-radius:999px; font-size:18px; line-height:1; cursor:pointer; color:#56707b; box-shadow: inset 0 0 0 1px rgba(193,199,209,.22); }
    .trcvastian-copy { margin:10px 0 0; color:#506873; font:500 12px/1.5 Inter, system-ui, sans-serif; }
    .trcvastian-loader { display:flex; align-items:center; justify-content:center; gap:10px; padding:16px 0; }
    .trcvastian-loader.hidden { display:none; }
    .trcvastian-spinner { width:22px; height:22px; border:3px solid #e0e8ed; border-top-color:#0f5d86; border-radius:50%; animation:trcvastian-spin .9s linear infinite }
    @keyframes trcvastian-spin { to { transform:rotate(360deg); } }
    #trcvastian-loader-text { color:#5a707b; font:500 12px/1 Inter, system-ui, sans-serif; }
    .trcvastian-company-card { margin-top:10px; border-radius:16px; padding:11px; background:#f4f9fc; box-shadow: inset 0 0 0 1px rgba(193,199,209,.16); }
    .trcvastian-company-card.hidden { display:none; }
    .trcvastian-company-kicker { color:#6b7f88; font:700 9px/1 Inter, system-ui, sans-serif; letter-spacing:.18em; text-transform:uppercase; }
    .trcvastian-company-name { margin-top:4px; color:#071e27; font:700 14px/1.1 Manrope, Inter, system-ui, sans-serif; }
    .trcvastian-company-summary { margin:8px 0 0; color:#4d6570; font:500 11px/1.5 Inter, system-ui, sans-serif; }
    .trcvastian-company-links { display:flex; flex-wrap:wrap; gap:6px; margin-top:9px; }
    .trcvastian-company-link { display:inline-flex; align-items:center; justify-content:center; border-radius:999px; padding:6px 9px; background:white; color:#0f5d86; text-decoration:none; font:700 10px/1 Inter, system-ui, sans-serif; letter-spacing:.04em; box-shadow: inset 0 0 0 1px rgba(15,93,134,.14); }
    .trcvastian-company-link:hover { background:#eef6fb; }
    .trcvastian-badges { display:flex; gap:6px; flex-wrap:wrap; margin-top:10px; }
    .trcvastian-badges.hidden { display:none; }
    .trcvastian-fit, .trcvastian-soft { display:inline-flex; align-items:center; border-radius:999px; padding:6px 10px; font:700 10px/1 Inter, system-ui, sans-serif; text-transform:uppercase; letter-spacing:.08em; }
    .trcvastian-fit { background:#dbf3ef; color:#0d6862; }
    .trcvastian-soft { background:#edf5fa; color:#56707b; }
    .trcvastian-list { display:grid; gap:7px; margin-top:12px; }
    .trcvastian-item { border-radius:16px; padding:10px 11px; background:#f3f8fb; color:#4d6570; font:500 11px/1.5 Inter, system-ui, sans-serif; box-shadow: inset 0 0 0 1px rgba(193,199,209,.16); }
    .trcvastian-actions { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:12px; }
    .trcvastian-actions-single { grid-template-columns:1fr; }
    .trcvastian-action-primary, .trcvastian-action-secondary { border:0; border-radius:15px; padding:10px 10px; cursor:pointer; font:700 12px/1.2 Manrope, Inter, system-ui, sans-serif; transition: transform .16s ease, box-shadow .16s ease, background .16s ease; }
    .trcvastian-action-primary { background:#0f5d86; color:white; box-shadow: 0 12px 24px rgba(15,93,134,.16); }
    .trcvastian-action-secondary { background:#eef5fa; color:#071e27; box-shadow: inset 0 0 0 1px rgba(193,199,209,.24); }
    .trcvastian-action-primary:hover, .trcvastian-action-secondary:hover { transform: translateY(-1px); }
    @media (max-width: 1180px) {
      #trcvastian-scan-root { right: 0; top: auto; bottom: 18px; }
      .trcvastian-scan-button { transform: translateX(52px); }
      .trcvastian-scan-panel { width: 290px; max-height: 48vh; }
    }

    #trcvastian-autofill-root {
      all: initial;
      position: fixed;
      right: 14px;
      bottom: 14px;
      z-index: 2147483645;
      display: block !important;
      pointer-events: auto;
    }
    .trcvastian-autofill-button {
      all: initial;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 40px;
      height: 40px;
      border: 0;
      border-radius: 999px;
      background: rgba(15, 93, 134, 0.92);
      color: white;
      box-shadow: 0 12px 24px rgba(15, 93, 134, 0.18);
      cursor: pointer;
      transition: transform .18s ease, box-shadow .18s ease, filter .18s ease;
      opacity: 0.88;
      pointer-events: auto;
      visibility: visible;
    }
    .trcvastian-autofill-button:hover {
      transform: translateY(-2px);
      box-shadow: 0 16px 28px rgba(15, 93, 134, 0.24);
      filter: brightness(1.04);
      opacity: 1;
    }
    .trcvastian-autofill-orb {
      display: inline-flex;
      width: 28px;
      height: 28px;
      align-items: center;
      justify-content: center;
      border-radius: 999px;
      background: rgba(255,255,255,0.16);
      box-shadow: inset 0 0 0 1px rgba(255,255,255,0.14);
      color: white;
      font: 800 9px/1 Inter, system-ui, sans-serif;
      letter-spacing: 0.1em;
      text-transform: uppercase;
    }
    .trcvastian-autofill-button.is-loading {
      filter: saturate(0.9);
      opacity: 0.92;
    }
    .trcvastian-external-header { display:flex; align-items:center; justify-content:space-between; padding:10px 12px; border-bottom:1px solid rgba(193,199,209,0.2); }
    .trcvastian-external-title { font:700 10px/1 Inter, system-ui, sans-serif; letter-spacing:.12em; color:#0f5d86; }
    .trcvastian-close-form { border:0; background:transparent; width:22px; height:22px; border-radius:999px; font-size:16px; cursor:pointer; color:#6b7f88; }
    .trcvastian-external-content { padding:12px; }
    .trcvastian-external-intro { margin:0 0 12px; font:500 12px/1.4 Inter, system-ui, sans-serif; color:#4d6570; }
    .trcvastian-form-loader { display:flex; align-items:center; justify-content:center; gap:8px; padding:10px 0; color:#5a707b; font:500 11px/1 Inter, system-ui, sans-serif; }
    .trcvastian-form-loader.hidden { display:none; }
    .trcvastian-form-summary { display:grid; gap:6px; margin-bottom:12px; }
    .trcvastian-form-field { display:flex; justify-content:space-between; padding:6px 10px; background:#f4f9fc; border-radius:8px; }
    .trcvastian-form-label { font:600 11px/1 Inter, system-ui, sans-serif; color:#5f7680; }
    .trcvastian-form-value { font:600 11px/1 Inter, system-ui, sans-serif; color:#0d6862; }
    .trcvastian-fill-all-btn { width:100%; padding:10px 12px; border:0; border-radius:12px; background:#0f5d86; color:white; font:700 12px/1.2 Inter, system-ui, sans-serif; cursor:pointer; box-shadow:0 8px 20px rgba(15,93,134,0.2); transition:transform .15s ease, box-shadow .15s ease; }
    .trcvastian-fill-all-btn:hover { transform:translateY(-1px); box-shadow:0 12px 24px rgba(15,93,134,0.26); }
    .trcvastian-fill-all-btn:disabled { opacity:0.8; cursor:default; }
    .trcvastian-form-status { margin:10px 0 0; font:500 11px/1.4 Inter, system-ui, sans-serif; text-align:center; }
    .trcvastian-external-job { margin-bottom:10px; }
    .trcvastian-external-job-title { font:700 13px/1.2 Inter, system-ui, sans-serif; color:#071e27; }
    .trcvastian-external-job-summary { margin:4px 0 0; font:400 11px/1.4 Inter, system-ui, sans-serif; color:#5a707b; }
    .trcvastian-external-badges { display:flex; gap:8px; margin-bottom:10px; }
    .trcvastian-external-score { display:inline-flex; align-items:center; padding:4px 10px; border-radius:999px; background:#0f5d86; color:white; font:700 11px/1 Inter, system-ui, sans-serif; }
    .trcvastian-external-verdict { display:inline-flex; align-items:center; padding:4px 10px; border-radius:999px; font:700 10px/1 Inter, system-ui, sans-serif; text-transform:uppercase; letter-spacing:.04em; }
    .trcvastian-external-verdict.trcvastian-good { background:#dbf3ef; color:#0d6862; }
    .trcvastian-external-verdict.trcvastian-warning { background:#fef3e6; color:#a85c00; }
    .trcvastian-external-list { display:grid; gap:6px; margin-bottom:12px; }
    .trcvastian-external-item { padding:6px 8px; background:#f4f9fc; border-radius:8px; font:500 11px/1.3 Inter, system-ui, sans-serif; color:#4d6570; }
  `;

  document.head.appendChild(style);
}

function initGlobalAutofillCta() {
  document.getElementById("trcvastian-autofill-root")?.remove();
}

async function mountGlobalAutofillCta() {
  if (isLinkedInHost()) {
    return;
  }

  if (!(await hasLinkedInExternalAutofillContext())) {
    document.getElementById("trcvastian-autofill-root")?.remove();
    return;
  }

  if (!isLikelyApplicationFormPage()) {
    document.getElementById("trcvastian-autofill-root")?.remove();
    return;
  }

  const form = document.querySelector("form");
  const inputs = document.querySelectorAll("input, textarea, select");
  const existing = document.getElementById("trcvastian-autofill-root");
  
  console.log("TRCVASTIAN: mountGlobalAutofillCta", { 
    hasForm: !!form, 
    inputCount: inputs.length,
    existing: !!existing
  });
  
  if (existing) {
    existing.style.display = "block";
    existing.style.visibility = "visible";
    return;
  }

  if (!form && inputs.length < 1) {
    return;
  }

  const root = document.createElement("div");
  root.id = "trcvastian-autofill-root";
  root.innerHTML = `
    <button id="trcvastian-autofill-button" type="button" class="trcvastian-autofill-button" title="Autocompletar · TRCVASTIAN" aria-label="Autocompletar · TRCVASTIAN">
      <span class="trcvastian-autofill-orb">TRC</span>
    </button>
  `;
  root.style.cssText = `
    position: fixed;
    right: 14px;
    bottom: 14px;
    z-index: 2147483645;
    display: block;
    visibility: visible;
  `;

  const btn = root.querySelector("#trcvastian-autofill-button");
  if (btn) {
    btn.style.cssText = `
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 48px;
      height: 48px;
      border: none;
      border-radius: 50%;
      background: rgba(15, 93, 134, 0.95);
      color: white;
      font: 800 10px/1 Inter, system-ui, sans-serif;
      letter-spacing: 0.08em;
      cursor: pointer;
      box-shadow: 0 12px 24px rgba(15, 93, 134, 0.25);
      transition: transform 0.18s ease, box-shadow 0.18s ease;
    `;
  }

  (document.body || document.documentElement).appendChild(root);
  console.log("TRCVASTIAN: Button mounted!");

  root.querySelector("#trcvastian-autofill-button")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    if (!(button instanceof HTMLElement)) {
      return;
    }

    button.classList.add("is-loading");
    button.setAttribute("title", "Completando · TRCVASTIAN");
    button.setAttribute("aria-label", "Completando · TRCVASTIAN");

    try {
      const response = await sendRuntimeMessage({
        type: "AUTOFILL_REQUEST",
        tabUrl: window.location.href
      });

      if (!response?.success) {
        throw new Error(response?.reason || "No se pudo autocompletar.");
      }

      button.setAttribute("title", "Listo · TRCVASTIAN");
      button.setAttribute("aria-label", "Listo · TRCVASTIAN");
      window.setTimeout(() => {
        button.setAttribute("title", "Autocompletar · TRCVASTIAN");
        button.setAttribute("aria-label", "Autocompletar · TRCVASTIAN");
        button.classList.remove("is-loading");
      }, 1800);
    } catch {
      button.setAttribute("title", "Intentar otra vez · TRCVASTIAN");
      button.setAttribute("aria-label", "Intentar otra vez · TRCVASTIAN");
      button.classList.remove("is-loading");
    }
  });
}

async function shouldShowExternalAutofillWidget() {
  if (isLinkedInHost()) {
    return false;
  }

  if (!/^https?:/i.test(window.location.protocol)) {
    return false;
  }

  if (!isLikelyApplicationFormPage()) {
    return false;
  }

  return hasLinkedInExternalAutofillContext();
}

function handleExternalJobAnalysis(analysis, jobUrl, applyLabel) {
  window.__trcvastianAnalysisReceived = true;

  const existing = document.getElementById("trcvastian-external-form-panel");
  if (existing) {
    existing.remove();
  }

  const localAnalysis = analysis?.localAnalysis;
  const aiAnalysis = analysis?.aiAnalysis;
  const recommended = aiAnalysis?.recommended ?? localAnalysis?.recommended;
  const score = localAnalysis?.score;
  const verdict = localAnalysis?.verdict;
  const company = analysis?.pageContext?.company || "Empresa";
  const companySummary = analysis?.pageContext?.companySummary || "";

  const root = document.createElement("div");
  root.id = "trcvastian-external-form-panel";
  root.innerHTML = `
    <div class="trcvastian-external-header">
      <div class="trcvastian-external-title">TRCVASTIAN</div>
      <button id="trcvastian-close-form" type="button" class="trcvastian-close-form">×</button>
    </div>
    <div class="trcvastian-external-content">
      <div class="trcvastian-external-job">
        <div class="trcvastian-external-job-title">${escapeHtml(company)}</div>
        ${companySummary ? `<p class="trcvastian-external-job-summary">${escapeHtml(companySummary.slice(0, 120))}</p>` : ""}
      </div>
      <div class="trcvastian-external-badges">
        <span class="trcvastian-external-score">${score ? score + "%" : "--"}</span>
        <span class="trcvastian-external-verdict ${recommended ? "trcvastian-good" : "trcvastian-warning"}">${recommended ? "✓ Vale" : "⚠ Revisa"}</span>
      </div>
      <div class="trcvastian-external-list">
        ${(aiAnalysis?.tailoredTips || localAnalysis?.suggestedActions || []).slice(0, 3).map(item => `<div class="trcvastian-external-item">→ ${escapeHtml(String(item).slice(0, 80))}</div>`).join("")}
      </div>
      <button id="trcvastian-fill-all" type="button" class="trcvastian-fill-all-btn">
        ✦ Autocompletar todo
      </button>
      <p id="trcvastian-form-status" class="trcvastian-form-status"></p>
    </div>
  `;

  root.style.cssText = `
    position: fixed;
    right: 14px;
    bottom: 80px;
    z-index: 2147483644;
    width: 240px;
    background: rgba(255,255,255,0.97);
    border-radius: 16px;
    box-shadow: 0 16px 40px rgba(7,30,39,0.18), inset 0 0 0 1px rgba(193,199,209,0.2);
    backdrop-filter: blur(16px);
    font-family: Inter, system-ui, sans-serif;
  `;

  (document.body || document.documentElement).appendChild(root);

  const fillAllBtn = root.querySelector("#trcvastian-fill-all");
  const statusEl = root.querySelector("#trcvastian-form-status");
  const closeBtn = root.querySelector("#trcvastian-close-form");

  closeBtn?.addEventListener("click", () => {
    root.remove();
  });

  fillAllBtn?.addEventListener("click", async () => {
    if (!fillAllBtn || !statusEl) return;

    fillAllBtn.disabled = true;
    fillAllBtn.textContent = "Completando...";
    statusEl.textContent = "";
    statusEl.style.color = "";

    try {
      const response = await sendRuntimeMessage({
        type: "AUTOFILL_REQUEST",
        tabUrl: window.location.href
      });

      if (!response?.success) {
        throw new Error(response?.reason || "No se pudo autocompletar.");
      }

      fillAllBtn.textContent = "✓ Completado";
      statusEl.textContent = "Revisa los campos antes de enviar";
      statusEl.style.color = "#0d6862";
    } catch (error) {
      fillAllBtn.disabled = false;
      fillAllBtn.textContent = "✦ Autocompletar todo";
      statusEl.textContent = error instanceof Error ? error.message : "Error";
      statusEl.style.color = "#c44";
    }
  });
}

async function initExternalFormAutofill() {
  if (!(await shouldShowExternalAutofillWidget())) {
    document.getElementById("trcvastian-external-form-panel")?.remove();
    return;
  }

  ensureScanWidgetStyles();

  const checkBodyExists = () => {
    if (!document.body) {
      setTimeout(checkBodyExists, 100);
      return;
    }
    initExternalFormWatcher();
  };

  checkBodyExists();
}

function initExternalFormWatcher() {
  let formMounted = false;

  const tryMountForm = () => {
    if (window.__trcvastianAnalysisReceived) return;

    const form = document.querySelector("form");
    const fillableFields = collectFillableFields();
    const hasForm = Boolean(form) || fillableFields.length >= 1;
    const existingPanel = document.getElementById("trcvastian-external-form-panel");

    if (hasForm && !existingPanel) {
      mountExternalFormPanel();
      formMounted = true;
    } else if (!hasForm && existingPanel && formMounted) {
      existingPanel.remove();
      formMounted = false;
    }
  };

  tryMountForm();

  const observer = new MutationObserver(() => {
    tryMountForm();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  window.setTimeout(tryMountForm, 1000);
  window.setTimeout(tryMountForm, 2500);
  window.setTimeout(tryMountForm, 5000);
}

function mountExternalFormPanel() {
  const existing = document.getElementById("trcvastian-external-form-panel");
  if (existing) {
    existing.remove();
  }

  const root = document.createElement("div");
  root.id = "trcvastian-external-form-panel";
  root.innerHTML = `
    <div class="trcvastian-external-header">
      <div class="trcvastian-external-title">TRCVASTIAN</div>
      <button id="trcvastian-close-form" type="button" class="trcvastian-close-form">×</button>
    </div>
    <div class="trcvastian-external-content">
      <p class="trcvastian-external-intro">Completa tu aplicación con un click</p>
      <div id="trcvastian-form-loader" class="trcvastian-form-loader hidden">
        <div class="trcvastian-spinner"></div>
        <span>Autocompletando...</span>
      </div>
      <div id="trcvastian-form-summary" class="trcvastian-form-summary">
        <div class="trcvastian-form-field">
          <span class="trcvastian-form-label">CV</span>
          <span class="trcvastian-form-value">Listo</span>
        </div>
        <div class="trcvastian-form-field">
          <span class="trcvastian-form-label">Perfil</span>
          <span class="trcvastian-form-value">Extraído</span>
        </div>
      </div>
      <button id="trcvastian-fill-all" type="button" class="trcvastian-fill-all-btn">
        ✦ Autocompletar todo
      </button>
      <p id="trcvastian-form-status" class="trcvastian-form-status"></p>
    </div>
  `;

  root.style.cssText = `
    position: fixed;
    right: 14px;
    bottom: 80px;
    z-index: 2147483644;
    width: 220px;
    background: rgba(255,255,255,0.97);
    border-radius: 16px;
    box-shadow: 0 16px 40px rgba(7,30,39,0.18), inset 0 0 0 1px rgba(193,199,209,0.2);
    backdrop-filter: blur(16px);
    font-family: Inter, system-ui, sans-serif;
  `;

  (document.body || document.documentElement).appendChild(root);

  const fillAllBtn = root.querySelector("#trcvastian-fill-all");
  const statusEl = root.querySelector("#trcvastian-form-status");
  const loader = root.querySelector("#trcvastian-form-loader");
  const closeBtn = root.querySelector("#trcvastian-close-form");

  closeBtn?.addEventListener("click", () => {
    root.remove();
  });

  fillAllBtn?.addEventListener("click", async () => {
    if (!fillAllBtn || !statusEl || !loader) return;

    fillAllBtn.disabled = true;
    fillAllBtn.textContent = "Completando...";
    loader.classList.remove("hidden");
    statusEl.textContent = "";

    try {
      const response = await sendRuntimeMessage({
        type: "AUTOFILL_REQUEST",
        tabUrl: window.location.href
      });

      if (!response?.success) {
        throw new Error(response?.reason || "No se pudo autocompletar.");
      }

      loader.classList.add("hidden");
      fillAllBtn.textContent = "✓ Completado";
      statusEl.textContent = "Revisa los campos antes de enviar";
      statusEl.style.color = "#0d6862";
    } catch (error) {
      loader.classList.add("hidden");
      fillAllBtn.disabled = false;
      fillAllBtn.textContent = "✦ Autocompletar todo";
      statusEl.textContent = error instanceof Error ? error.message : "Error";
      statusEl.style.color = "#c44";
    }
  });
}
