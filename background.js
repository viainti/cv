import "./firebase-app.js";
import "./firebase-auth.js";
import "./firebase-firestore.js";
import { DEFAULT_MODEL, DEFAULT_OPENROUTER_API_KEY } from "./config.js";
import { analyzeJobFit } from "./job-fit.js";
import { buildSearchUrlForPortal, deriveProfileFromCv, extractCvProfileSnapshot, PORTAL_CONFIG } from "./profile-search.js";

const firebaseConfig = {
  apiKey: "AIzaSyBBf12MUVkVfORdYkSVLOUMnFumEnb9gCY",
  authDomain: "cvastian-8144c.firebaseapp.com",
  projectId: "cvastian-8144c",
  storageBucket: "cvastian-8144c.firebasestorage.app",
  messagingSenderId: "293520779866",
  appId: "1:293520779866:web:7f5a7233766b78548f0663"
};

let firebaseApp = null;
let firebaseDb = null;
let batchApplyInProgress = false;
const EXTERNAL_AUTOFILL_CONTEXTS_KEY = "externalAutofillContexts";

const PLAN_CATALOG = {
  freemium: { id: "freemium", name: "Freemium", applicationQuota: 10 },
  basic: { id: "basic", name: "Plan basico", applicationQuota: 100 },
  improved: { id: "improved", name: "Plan Mejorado", applicationQuota: 250 },
  advanced: { id: "advanced", name: "Plan avanzado", applicationQuota: 500 },
  star: { id: "star", name: "Plan Estrella", applicationQuota: 500 },
  diamond: { id: "diamond", name: "Plan Diamond", applicationQuota: 500 },
  ultra: { id: "ultra", name: "Plan Ultra", applicationQuota: 500 }
};

async function initFirebase() {
  if (firebaseDb) return;
  try {
    if (!firebase?.apps?.length) {
      firebaseApp = firebase.initializeApp(firebaseConfig);
    }
    firebaseDb = firebase.firestore();
  } catch (e) {
    console.warn("Firebase init in background:", e.message);
  }
}

function getUserDoc(uid) {
  return firebaseDb.collection("users").doc(uid);
}

async function getUserPlanAccess(uid) {
  if (!uid) {
    return {
      plan: PLAN_CATALOG.freemium,
      status: "trial",
      quota: PLAN_CATALOG.freemium.applicationQuota,
      used: 0,
      remaining: PLAN_CATALOG.freemium.applicationQuota,
      blocked: false
    };
  }

  await initFirebase();
  const snapshot = firebaseDb ? await getUserDoc(uid).get().catch(() => null) : null;
  const data = snapshot?.exists ? snapshot.data() || {} : {};
  const planId = String(data.subscriptionPlan || "freemium").trim().toLowerCase();
  const plan = PLAN_CATALOG[planId] || PLAN_CATALOG.freemium;
  const status = String(data.planStatus || data.subscriptionStatus || "trial").trim().toLowerCase();
  const { applicationHistory = [] } = await chrome.storage.local.get(["applicationHistory"]);
  const used = Array.isArray(applicationHistory) ? applicationHistory.length : 0;
  const quota = Number(plan.applicationQuota || 0);
  const remaining = Math.max(quota - used, 0);
  const statusAllowed = ["trial", "active", "grace"].includes(status);
  const blocked = quota > 0 ? used >= quota || !statusAllowed : !statusAllowed;

  return {
    plan,
    status,
    quota,
    used,
    remaining,
    blocked
  };
}

async function ensureUserCanApplyByAccount() {
  const { currentUserUid = "" } = await chrome.storage.local.get(["currentUserUid"]);
  const access = await getUserPlanAccess(currentUserUid);
  if (access.blocked) {
    throw new Error(`La cuenta ${access.plan.name} con estado ${access.status} no puede continuar. Haz upgrade o reactiva la suscripcion.`);
  }
  return access;
}

function getUserCollection(uid, collectionName) {
  return getUserDoc(uid).collection(collectionName);
}

function sanitizeDocId(value, fallback = "item") {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/https?:\/\//g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || `${fallback}-${Date.now()}`;
}

function trimActivityPayload(payload = {}) {
  const next = {};
  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined || value === null || value === "") {
      continue;
    }
    next[key] = value;
  }
  return next;
}

async function saveUserActivity(uid, type, payload = {}) {
  if (!uid) {
    return null;
  }

  await initFirebase();
  if (!firebaseDb) {
    return null;
  }

  const activityEntry = {
    type: String(type || "activity"),
    ...trimActivityPayload(payload),
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  };

  return getUserCollection(uid, "activity").add(activityEntry);
}

async function mergeUserProfile(uid, data = {}) {
  if (!uid) {
    return;
  }

  await initFirebase();
  if (!firebaseDb) {
    return;
  }

  await getUserDoc(uid).set(
    {
      ...trimActivityPayload(data),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    },
    { merge: true }
  );
}

async function saveSearchToFirestore(uid, searchData) {
  if (!uid) {
    return null;
  }

  await initFirebase();
  if (!firebaseDb) {
    return null;
  }

  const docId = sanitizeDocId(searchData.id || `${searchData.portalId}-${searchData.createdAt}`, "search");
  await getUserCollection(uid, "searches").doc(docId).set(
    {
      ...searchData,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    },
    { merge: true }
  );

  return docId;
}

async function saveCvToFirestore(uid, cvData) {
  if (!uid) {
    return null;
  }

  await initFirebase();
  if (!firebaseDb) {
    return null;
  }

  const docId = sanitizeDocId(cvData.id || `${cvData.cvFileName}-${cvData.cvUpdatedAt}`, "cv");
  await getUserCollection(uid, "cvs").doc(docId).set(
    {
      ...cvData,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    },
    { merge: true }
  );

  return docId;
}

async function saveTrackerItemToFirestore(uid, jobData) {
  if (!uid) {
    return null;
  }

  await initFirebase();
  if (!firebaseDb) {
    return null;
  }

  const docId = sanitizeDocId(jobData.id || jobData.url, "tracker");
  await getUserCollection(uid, "jobTracker").doc(docId).set(
    {
      ...jobData,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    },
    { merge: true }
  );

  return docId;
}

async function saveApplicationToFirestore(uid, applicationData) {
  await initFirebase();
  if (!firebaseDb || !uid) {
    console.warn("saveApplicationToFirestore: missing firebaseDb or uid", { uid: !!uid });
    return null;
  }
  try {
    const docId = sanitizeDocId(applicationData.id || `${applicationData.jobUrl}-${applicationData.createdAt}`, "application");
    const appRef = getUserCollection(uid, "applications").doc(docId);
    await appRef.set({
      ...applicationData,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      status: "applied"
    }, { merge: true });
    console.log("Application saved to Firestore:", appRef.id);
    return appRef.id;
  } catch (error) {
    console.error("Error saving application to Firestore:", error);
    return null;
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "AUTOFILL_REQUEST") {
    const tabId = message.tabId ?? sender.tab?.id;
    const tabUrl = message.tabUrl ?? sender.tab?.url;
    triggerAutofill(tabId, tabUrl)
      .then(() => sendResponse({ success: true }))
      .catch((error) => {
        console.error("Autofill error:", error);
        sendResponse({ success: false, reason: error instanceof Error ? error.message : "No se pudo autoaplicar." });
      });
    return true;
  }

  if (message?.type === "APPLICATION_FLOW_REQUEST") {
    const tabId = message.tabId ?? sender.tab?.id;
    runApplicationFlow(tabId, message.jobUrl)
      .then((result) => sendResponse({ success: true, result }))
      .catch((error) => {
        console.error("Application flow error:", error);
        sendResponse({ success: false, reason: error instanceof Error ? error.message : "No se pudo abrir el flujo de aplicación." });
      });
    return true;
  }

  if (message?.type === "BATCH_APPLY_REQUEST") {
    runBatchApplicationFlow(message.tabId ?? sender.tab?.id, message.jobs || [])
      .then((result) => sendResponse({ success: true, result }))
      .catch((error) => {
        console.error("Batch apply error:", error);
        sendResponse({ success: false, reason: error instanceof Error ? error.message : "No se pudo ejecutar el lote." });
      });
    return true;
  }

  if (message?.type === "ANALYZE_JOB_REQUEST") {
    const tabId = message.tabId ?? sender.tab?.id;
    const tabUrl = message.tabUrl ?? sender.tab?.url;
    analyzeCurrentJob(tabId, tabUrl)
      .then((result) => sendResponse({ success: true, result }))
      .catch((error) => {
        console.error("Analyze job error:", error);
        sendResponse({ success: false, reason: error instanceof Error ? error.message : "No se pudo analizar la vacante." });
      });
    return true;
  }

  if (message?.type === "OPEN_LINKEDIN_SEARCH") {
    openProfileSearch(message.tabId, message.portalId || "linkedin")
      .then((result) => sendResponse({ success: true, result }))
      .catch((error) => {
        console.error("Open LinkedIn search error:", error);
        sendResponse({ success: false, reason: error instanceof Error ? error.message : "No se pudo abrir LinkedIn Jobs." });
      });
    return true;
  }

   if (message?.type === "GET_RECOMMENDED_JOBS_FOR_TAB") {
     recommendJobsForTab(message.tabId)
       .then((result) => sendResponse({ success: true, result }))
       .catch((error) => {
         const msg = error instanceof Error ? error.message : String(error);
         if (!msg.includes("no permite conectar") && !msg.includes("Receiving end does not exist")) {
           console.error("Recommend jobs error:", error);
         }
         sendResponse({ success: false, reason: msg });
       });
     return true;
   }

  if (message?.type === "GET_PROFILE_DATA") {
    getProfileData()
      .then((result) => sendResponse({ success: true, result }))
      .catch((error) => sendResponse({ success: false, reason: error instanceof Error ? error.message : "No se pudo leer el perfil." }));
    return true;
  }

  if (message?.type === "SAVE_PROFILE_OVERRIDES") {
    saveProfileOverrides(message.profile || {})
      .then((result) => sendResponse({ success: true, result }))
      .catch((error) => sendResponse({ success: false, reason: error instanceof Error ? error.message : "No se pudo guardar el perfil." }));
    return true;
  }

  if (message?.type === "SYNC_CV_RECORD") {
    syncCvRecord(message.record || {})
      .then((result) => sendResponse({ success: true, result }))
      .catch((error) => sendResponse({ success: false, reason: error instanceof Error ? error.message : "No se pudo sincronizar el CV." }));
    return true;
  }

  if (message?.type === "GET_TRACKER_DATA") {
    getTrackerData()
      .then((result) => sendResponse({ success: true, result }))
      .catch((error) => sendResponse({ success: false, reason: error instanceof Error ? error.message : "No se pudo leer el tracker." }));
    return true;
  }

  if (message?.type === "SET_JOB_STATUS") {
    setJobStatus(message.job || {}, message.status || "saved")
      .then((result) => sendResponse({ success: true, result }))
      .catch((error) => sendResponse({ success: false, reason: error instanceof Error ? error.message : "No se pudo guardar el estado." }));
    return true;
  }

  if (message?.type === "GENERATE_APPLICATION_MATERIAL") {
    generateApplicationMaterial(message.job || {})
      .then((result) => sendResponse({ success: true, result }))
      .catch((error) => sendResponse({ success: false, reason: error instanceof Error ? error.message : "No se pudo generar material." }));
    return true;
  }

  if (message?.type === "GENERATE_FIELD_CONTENT") {
    generateFieldContent(message.field || {}, message.pageUrl || "")
      .then((result) => sendResponse({ success: true, result }))
      .catch((error) => sendResponse({ success: false, reason: error instanceof Error ? error.message : "No se pudo generar el campo." }));
    return true;
  }

  if (message?.type === "RECORD_MANUAL_SUBMISSION") {
    handleManualSubmission(message.jobUrl, message.jobTitle, message.company, message.method || "manual");
    return false;
  }

  return false;
});
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete") {
    return;
  }

  if (!tab.url || !tab.url.includes("linkedin.com/jobs/search")) {
    return;
  }

   recommendJobsForTab(tabId).catch((error) => {
     const msg = error instanceof Error ? error.message : String(error);
     if (isMissingReceiverError(error) || msg.includes("no permite conectar")) {
       return;
     }
     console.warn("Auto recommendation error:", error);
   });
});

async function openProfileSearch(tabId, portalId = "linkedin") {
  const { cvText = "", profileOverrides = {}, searchHistory = [], currentUserUid = "" } = await chrome.storage.local.get(["cvText", "profileOverrides", "searchHistory", "currentUserUid"]);
  if (!cvText.trim()) {
    throw new Error("Sube tu CV primero para generar la búsqueda.");
  }

  const profile = deriveProfileFromCv(cvText, profileOverrides);
  const searchUrl = buildSearchUrlForPortal(portalId, cvText, profileOverrides);

  const historyEntry = {
    id: `${Date.now()}-${portalId}`,
    portalId,
    portalLabel: PORTAL_CONFIG[portalId]?.label || portalId,
    searchUrl,
    role: profile.role,
    keywords: profile.keywords,
    createdAt: Date.now()
  };

  await chrome.storage.local.set({
    lastProfile: profile,
    searchHistory: [historyEntry, ...searchHistory].slice(0, 20)
  });

  if (currentUserUid) {
    await saveSearchToFirestore(currentUserUid, historyEntry);
    await mergeUserProfile(currentUserUid, {
      lastProfile: profile,
      role: profile.role || "",
      seniority: profile.seniority || "",
      preferredLocation: profile.preferredLocation || "",
      remotePreference: profile.remotePreference || "",
      skills: profile.skills || [],
      lastSearchAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    await saveUserActivity(currentUserUid, "search_opened", {
      portalId: historyEntry.portalId,
      portalLabel: historyEntry.portalLabel,
      role: historyEntry.role,
      searchUrl: historyEntry.searchUrl
    });
  }

  await chrome.tabs.update(tabId, { url: searchUrl });
  return { searchUrl, profile };
}

async function recommendJobsForTab(tabId) {
  const { cvText = "", profileOverrides = {} } = await chrome.storage.local.get(["cvText", "profileOverrides"]);
  if (!cvText.trim()) {
    throw new Error("Sube tu CV primero para obtener recomendaciones.");
  }

  const profile = deriveProfileFromCv(cvText, profileOverrides);
  const jobs = await sendMessageToTab(tabId, { type: "SCRAPE_JOB_LIST" });
  if (!jobs || !Array.isArray(jobs) || !jobs.length) {
    return { recommendations: [], topRecommendation: null };
  }

  const recommendations = jobs
    .map((job) => {
      const analysis = analyzeJobFit({
        cvText,
        jobTitle: job.title || "",
        company: job.company || "",
        location: job.location || "",
        jobText: job.description || "",
        pageUrl: job.url || ""
      });

      return {
        ...job,
        score: analysis.score,
        verdict: analysis.verdict,
        recommended: analysis.recommended,
        tier: getRecommendationTier(analysis.score),
        explanation: {
          summary: analysis.summary,
          strengths: analysis.strengths,
          gaps: analysis.gaps,
          actions: analysis.suggestedActions
        },
        easyApply: Boolean(job.easyApply),
        hidden: analysis.score < 52
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 20)
    .map((job, index) => ({
      ...job,
      topPick: index === 0 || job.score >= 82
    }));

  await sendMessageToTab(tabId, {
    type: "HIGHLIGHT_LINKEDIN_RECOMMENDATIONS",
    recommendations
  });

  await chrome.storage.local.set({
    lastRecommendedJobs: recommendations,
    lastTopRecommendation: recommendations[0] || null,
    lastProfile: profile
  });

  return {
    recommendations,
    topRecommendation: recommendations[0] || null,
    profile
  };
}

async function getProfileData() {
  const { cvText = "", profileOverrides = {}, lastProfile = null, searchHistory = [] } = await chrome.storage.local.get([
    "cvText",
    "profileOverrides",
    "lastProfile",
    "searchHistory"
  ]);

  const profile = cvText.trim() ? deriveProfileFromCv(cvText, profileOverrides) : lastProfile;
  return {
    profile,
    profileOverrides,
    searchHistory
  };
}

async function saveProfileOverrides(profile) {
  const { cvText = "", currentUserUid = "" } = await chrome.storage.local.get(["cvText", "currentUserUid"]);
  const profileOverrides = {
    role: String(profile.role || "").trim(),
    seniority: String(profile.seniority || "").trim(),
    remotePreference: String(profile.remotePreference || "").trim(),
    preferredLocation: String(profile.preferredLocation || "").trim(),
    country: String(profile.country || "").trim(),
    skills: Array.isArray(profile.skills)
      ? profile.skills.map((item) => String(item || "").trim()).filter(Boolean)
      : String(profile.skills || "")
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean)
  };

  const derivedProfile = cvText.trim() ? deriveProfileFromCv(cvText, profileOverrides) : profileOverrides;
  await chrome.storage.local.set({ profileOverrides, lastProfile: derivedProfile });

  if (currentUserUid) {
    await mergeUserProfile(currentUserUid, {
      profileOverrides,
      lastProfile: derivedProfile,
      role: derivedProfile.role || "",
      seniority: derivedProfile.seniority || "",
      preferredLocation: derivedProfile.preferredLocation || "",
      country: derivedProfile.country || "",
      remotePreference: derivedProfile.remotePreference || "",
      skills: derivedProfile.skills || [],
      lastProfileUpdateAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    await saveUserActivity(currentUserUid, "profile_updated", {
      role: derivedProfile.role || "",
      seniority: derivedProfile.seniority || "",
      preferredLocation: derivedProfile.preferredLocation || ""
    });
  }

  return derivedProfile;
}

async function getTrackerData() {
  const { jobTracker = [], searchHistory = [], lastRecommendedJobs = [], lastProfile = null, applicationHistory = [] } = await chrome.storage.local.get([
    "jobTracker",
    "searchHistory",
    "lastRecommendedJobs",
    "lastProfile",
    "applicationHistory"
  ]);

  return {
    tracker: jobTracker,
    searchHistory,
    recommendations: lastRecommendedJobs,
    profile: lastProfile,
    applicationHistory
  };
}

async function setJobStatus(job, status) {
  const { jobTracker = [], currentUserUid = "" } = await chrome.storage.local.get(["jobTracker", "currentUserUid"]);
  const normalizedJob = {
    id: job.id || job.url,
    title: job.title || "Vacante",
    company: job.company || "",
    location: job.location || "",
    url: job.url || "",
    score: job.score || null,
    easyApply: Boolean(job.easyApply),
    status,
    updatedAt: Date.now()
  };

  const nextTracker = [
    normalizedJob,
    ...jobTracker.filter((item) => String(item.id || item.url) !== String(normalizedJob.id))
  ].slice(0, 60);

  await chrome.storage.local.set({ jobTracker: nextTracker });

  if (currentUserUid) {
    await saveTrackerItemToFirestore(currentUserUid, normalizedJob);
    await saveUserActivity(currentUserUid, "job_status_changed", {
      jobTitle: normalizedJob.title,
      company: normalizedJob.company,
      status: normalizedJob.status,
      url: normalizedJob.url
    });
  }

  return nextTracker;
}

async function generateApplicationMaterial(job) {
  const { cvText = "", profileOverrides = {} } = await chrome.storage.local.get(["cvText", "profileOverrides"]);
  const profile = deriveProfileFromCv(cvText, profileOverrides);
  const analysis = analyzeJobFit({
    cvText,
    jobTitle: job.title || "",
    company: job.company || "",
    location: job.location || "",
    jobText: job.description || "",
    pageUrl: job.url || ""
  });

  const coverLetter = [
    `Hi ${job.company || "Hiring Team"},`,
    ``,
    `I'm interested in the ${job.title || profile.role} role.`,
    `My background aligns especially well with ${analysis.matchedSkills.slice(0, 3).join(", ") || profile.skills.slice(0, 3).join(", ") || profile.role}.`,
    `I can contribute quickly with hands-on experience in ${profile.skills.slice(0, 3).join(", ") || "product execution"} and a ${profile.seniority} profile focused on impact.`,
    ``,
    `Best regards`
  ].join("\n");

  const quickAnswers = [
    `Why fit: ${analysis.summary}`,
    `Top strengths: ${analysis.strengths.join(" ") || "Strong technical alignment and relevant role experience."}`,
    `Watchouts: ${analysis.gaps.join(" ") || "No major blockers detected from the current job text."}`
  ];

  return {
    coverLetter,
    quickAnswers,
    analysis
  };
}

async function triggerAutofill(tabId, tabUrl) {
  if (!tabId) {
    throw new Error("No hay pestaña activa para autocompletar.");
  }

  const allowedPage = await canAutofillOnPage(tabUrl);
  if (!allowedPage) {
    throw new Error("El autocompletado solo está permitido en LinkedIn o en formularios externos abiertos desde LinkedIn.");
  }

  await ensureUserCanApplyByAccount();

  const data = await chrome.storage.local.get([
    "cvText",
    "openrouterApiKey",
    "model",
    "extraPrompt",
    "cvFileDataUrl",
    "cvFileName",
    "cvFileType"
  ]);
  const apiKey = data.openrouterApiKey || DEFAULT_OPENROUTER_API_KEY;
  const model = data.model || DEFAULT_MODEL;

  if (!apiKey || !data.cvText) {
    throw new Error("Falta el CV en la configuración.");
  }

  const autofillProfile = buildAutofillProfile(data.cvText);

  const [{ result: pageContext }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: collectFormContext
  });

  const completion = await askOpenRouter({
    apiKey,
    model,
    cvText: data.cvText,
    extraPrompt: data.extraPrompt || "",
    pageUrl: tabUrl,
    formContext: pageContext
  });

  const parsed = safeJson(completion);
  if (!parsed?.fields || !Array.isArray(parsed.fields)) {
    throw new Error("Respuesta inválida de OpenRouter.");
  }

  return sendMessageToTab(tabId, {
    type: "AUTOFILL_FIELDS",
    fields: parsed.fields,
    cvText: data.cvText,
    autofillProfile,
    cvFileDataUrl: data.cvFileDataUrl || "",
    cvFileName: data.cvFileName || "",
    cvFileType: data.cvFileType || ""
  });
}

function normalizeAutofillContextUrl(value) {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }

  try {
    const url = new URL(text);
    url.hash = "";
    return url.toString();
  } catch {
    return stripHash(text);
  }
}

function buildExternalContextVariants(value) {
  const normalized = normalizeAutofillContextUrl(value);
  if (!normalized) {
    return [];
  }

  const variants = new Set([normalized]);
  try {
    const url = new URL(normalized);
    variants.add(`${url.origin}${url.pathname}`);
    variants.add(url.origin);
  } catch {
    // Ignore parse errors and keep the normalized URL only.
  }

  return [...variants];
}

async function registerExternalAutofillContext(url, jobUrl = "") {
  const variants = buildExternalContextVariants(url);
  if (!variants.length) {
    return;
  }

  const { [EXTERNAL_AUTOFILL_CONTEXTS_KEY]: stored = {} } = await chrome.storage.local.get([EXTERNAL_AUTOFILL_CONTEXTS_KEY]);
  const contexts = pruneExternalAutofillContexts(stored);
  const nextEntry = {
    source: "linkedin",
    sourceJobUrl: String(jobUrl || ""),
    createdAt: Date.now()
  };

  for (const variant of variants) {
    contexts[variant] = nextEntry;
  }

  await chrome.storage.local.set({ [EXTERNAL_AUTOFILL_CONTEXTS_KEY]: contexts });
}

function pruneExternalAutofillContexts(contexts = {}) {
  const now = Date.now();
  const maxAgeMs = 1000 * 60 * 60 * 6;
  const next = {};

  for (const [key, value] of Object.entries(contexts || {})) {
    if (!value || typeof value !== "object") {
      continue;
    }

    const createdAt = Number(value.createdAt || 0);
    if (!createdAt || now - createdAt > maxAgeMs) {
      continue;
    }

    next[key] = value;
  }

  return next;
}

async function canAutofillOnPage(url) {
  const text = String(url || "").trim();
  if (!text) {
    return false;
  }

  if (/linkedin\.com/i.test(text)) {
    return true;
  }

  const variants = buildExternalContextVariants(text);
  if (!variants.length) {
    return false;
  }

  const { [EXTERNAL_AUTOFILL_CONTEXTS_KEY]: stored = {} } = await chrome.storage.local.get([EXTERNAL_AUTOFILL_CONTEXTS_KEY]);
  const contexts = pruneExternalAutofillContexts(stored);
  await chrome.storage.local.set({ [EXTERNAL_AUTOFILL_CONTEXTS_KEY]: contexts });

  return variants.some((variant) => {
    const context = contexts[variant];
    return context?.source === "linkedin";
  });
}

async function runExternalAutofillFlow(tabId, initialUrl, maxSteps = 4) {
  let currentTabId = tabId;
  let currentUrl = String(initialUrl || "");
  let lastResult = null;

  for (let step = 0; step < maxSteps; step += 1) {
    const beforeUrl = currentUrl;
    lastResult = await triggerAutofill(currentTabId, currentUrl).catch(() => null);

    const autofillResult = lastResult?.result || lastResult || null;
    const actionDriven = Boolean(autofillResult?.advanced || autofillResult?.submitted || autofillResult?.autoStepCount);

    if (!actionDriven) {
      const tab = await chrome.tabs.get(currentTabId).catch(() => null);
      currentUrl = String(tab?.url || currentUrl || "");
      break;
    }

    await waitForUrlChange(currentTabId, beforeUrl, 7000).catch(() => null);
    await waitForTabComplete(currentTabId, 12000).catch(() => null);
    await delay(1200);

    const tab = await chrome.tabs.get(currentTabId).catch(() => null);
    currentUrl = String(tab?.url || currentUrl || "");
    if (!currentUrl || stripHash(currentUrl) === stripHash(beforeUrl)) {
      break;
    }
  }

  return {
    tabId: currentTabId,
    url: currentUrl,
    autofill: lastResult?.result || lastResult || null
  };
}

async function runApplicationFlow(tabId, jobUrl) {
  if (!tabId) {
    throw new Error("No hay pestaña activa.");
  }

  await ensureUserCanApplyByAccount();

  const targetUrl = String(jobUrl || "").trim();
  if (!targetUrl) {
    throw new Error("No hay vacante seleccionada.");
  }

  const tab = await chrome.tabs.get(tabId);
  const currentTabUrl = String(tab.url || "");
  const preferredUrl = resolveApplicationTargetUrl(currentTabUrl, targetUrl);

  if (stripHash(currentTabUrl) !== stripHash(preferredUrl)) {
    await chrome.tabs.update(tabId, { url: preferredUrl });
    await waitForTabComplete(tabId);
  }

  const activeTab = await chrome.tabs.get(tabId);
  const activeUrl = String(activeTab.url || "");

  if (activeUrl.includes("linkedin.com") && /\/jobs\/collections\/similar-jobs\//i.test(activeUrl) && isConcreteLinkedInJobUrl(preferredUrl)) {
    await chrome.tabs.update(tabId, { url: preferredUrl });
    await waitForTabComplete(tabId);
  }

  const settledTab = await chrome.tabs.get(tabId);
  const settledUrl = String(settledTab.url || "");

  if (settledUrl.includes("linkedin.com")) {
    const applyInfo = await sendMessageToTab(tabId, { type: "EXTRACT_APPLY_DESTINATION" });

    if (applyInfo?.externalUrl) {
      const navigation = await waitForApplyNavigation(tabId, settledUrl, 5000).catch(() => null);
      const destinationTabId = navigation?.tabId || tabId;
      const destinationUrl = navigation?.url || applyInfo.externalUrl;

      await registerExternalAutofillContext(destinationUrl, preferredUrl);

      if (!navigation?.url) {
        await chrome.tabs.update(destinationTabId, { url: applyInfo.externalUrl });
        await waitForTabComplete(destinationTabId);
      }

      const loadedDestinationTab = await chrome.tabs.get(destinationTabId).catch(() => null);
      const loadedDestinationUrl = String(loadedDestinationTab?.url || destinationUrl || "");
      await registerExternalAutofillContext(loadedDestinationUrl, preferredUrl);

      const jobAnalysis = await analyzeCurrentJob(destinationTabId, loadedDestinationUrl || destinationUrl).catch(() => null);

      await delay(1400);
      const externalFlow = await runExternalAutofillFlow(destinationTabId, loadedDestinationUrl || destinationUrl, 4).catch(() => null);
      const finalDestinationUrl = externalFlow?.url || loadedDestinationUrl || destinationUrl;
      await registerExternalAutofillContext(finalDestinationUrl, preferredUrl);

      await sendMessageToTab(destinationTabId, {
        type: "EXTERNAL_JOB_ANALYSIS",
        analysis: jobAnalysis,
        jobUrl: preferredUrl,
        applyLabel: applyInfo.applyLabel || ""
      });

      return {
        mode: "external_autofill",
        destinationUrl: finalDestinationUrl,
        jobAnalysis,
        applyLabel: applyInfo.applyLabel || "",
        submitted: Boolean(externalFlow?.autofill?.submitted)
      };
    }

    if (applyInfo?.mode === "easy_apply" || applyInfo?.mode === "internal_apply" || applyInfo?.mode === "apply_clicked") {
      const navigation = await waitForApplyNavigation(tabId, settledUrl, 3500).catch(() => null);
      const destinationTabId = navigation?.tabId || tabId;
      const destinationUrl = navigation?.url || settledUrl;

      if (navigation?.url && !String(destinationUrl).includes("linkedin.com")) {
        await registerExternalAutofillContext(destinationUrl, preferredUrl);
      }

      await delay(1400);
      const autofillResult = await triggerAutofill(destinationTabId, destinationUrl || settledUrl);
      const autofillPayload = autofillResult?.result || autofillResult || {};
      const submitted = Boolean(autofillPayload?.submitted);
      const resolvedMode = navigation?.url && !String(destinationUrl).includes("linkedin.com")
        ? "external_autofill"
        : submitted
          ? `${applyInfo.mode}_submitted`
          : applyInfo.mode;

      if (submitted) {
        await recordApplicationEvent({
          jobUrl: preferredUrl,
          destinationUrl: destinationUrl || settledUrl,
          mode: resolvedMode,
          applyLabel: applyInfo.applyLabel || ""
        });
      }

      return {
        mode: resolvedMode,
        destinationUrl: destinationUrl || settledUrl,
        applyLabel: applyInfo.applyLabel || "",
        submitted
      };
    }
  }

  const jobAnalysis = await analyzeCurrentJob(tabId, settledUrl || preferredUrl).catch(() => null);

  await sendMessageToTab(tabId, {
    type: "EXTERNAL_JOB_ANALYSIS",
    analysis: jobAnalysis,
    jobUrl: preferredUrl,
    applyLabel: ""
  });

  return {
    mode: "external_opened",
    destinationUrl: settledUrl || preferredUrl,
    jobAnalysis,
    applyLabel: "",
    submitted: false
  };
}

async function runBatchApplicationFlow(tabId, jobs) {
  if (!tabId) {
    throw new Error("No hay pestaña activa.");
  }

  await ensureUserCanApplyByAccount();

  if (batchApplyInProgress) {
    throw new Error("Ya hay un lote de postulaciones ejecutándose.");
  }

  const queue = Array.isArray(jobs)
    ? jobs
        .map((job) => ({
          id: String(job?.id || job?.url || ""),
          title: String(job?.title || "Vacante").trim(),
          company: String(job?.company || "").trim(),
          location: String(job?.location || "").trim(),
          url: String(job?.url || "").trim(),
          score: Number(job?.score || 0),
          easyApply: Boolean(job?.easyApply)
        }))
        .filter((job) => job.url && /linkedin\.com\/jobs\//i.test(job.url) && job.easyApply)
    : [];

  if (!queue.length) {
    throw new Error("No hay vacantes válidas para el lote.");
  }

  batchApplyInProgress = true;

  const results = [];

  try {
    for (const job of queue) {
      try {
        const flowResult = await runApplicationFlow(tabId, job.url);
        if (flowResult?.submitted) {
          await setJobStatus(job, "applied");
          results.push({
            jobId: job.id,
            url: job.url,
            status: "applied",
            mode: flowResult?.mode || ""
          });
        } else {
          await setJobStatus(job, "review");
          results.push({
            jobId: job.id,
            url: job.url,
            status: "skipped",
            mode: flowResult?.mode || "",
            reason: "La vacante requiere revisión manual o no pudo enviarse automáticamente."
          });
        }
      } catch (error) {
        await setJobStatus(job, "failed");
        results.push({
          jobId: job.id,
          url: job.url,
          status: "failed",
          reason: error instanceof Error ? error.message : "No se pudo postular."
        });
      }

      await delay(2200);
    }
  } finally {
    batchApplyInProgress = false;
  }

  const appliedCount = results.filter((item) => item.status === "applied").length;
  const failedCount = results.filter((item) => item.status === "failed").length;
  const skippedCount = results.filter((item) => item.status === "skipped").length;

  return {
    appliedCount,
    failedCount,
    skippedCount,
    results
  };
}

function resolveApplicationTargetUrl(currentUrl, requestedUrl) {
  const current = String(currentUrl || "").trim();
  const requested = String(requestedUrl || "").trim();

  if (isConcreteLinkedInJobUrl(current) && !isConcreteLinkedInJobUrl(requested)) {
    return current;
  }

  if (/linkedin\.com\/jobs\/collections\/similar-jobs\//i.test(requested) && isConcreteLinkedInJobUrl(current)) {
    return current;
  }

  return requested || current;
}

function isConcreteLinkedInJobUrl(value) {
  return /linkedin\.com\/jobs\/view\/\d+/i.test(String(value || ""));
}

async function analyzeCurrentJob(tabId, tabUrl) {
  if (!tabId) {
    throw new Error("No hay pestaña activa para analizar.");
  }

  const data = await chrome.storage.local.get(["cvText", "openrouterApiKey", "model", "extraPrompt"]);
  const apiKey = data.openrouterApiKey || DEFAULT_OPENROUTER_API_KEY;
  const model = data.model || DEFAULT_MODEL;

  if (!data.cvText) {
    throw new Error("Primero guarda el CV para poder analizar la vacante.");
  }

  const pageContext = await sendMessageToTab(tabId, {
    type: "SCRAPE_JOB_CONTEXT"
  });

  if (!pageContext?.description && !pageContext?.title) {
    throw new Error("No pude detectar suficiente contenido de la vacante en esta página.");
  }

  const localAnalysis = analyzeJobFit({
    cvText: data.cvText,
    jobTitle: pageContext.title || pageContext.pageTitle || "",
    company: pageContext.company || "",
    location: pageContext.location || "",
    jobText: pageContext.description || "",
    pageUrl: tabUrl || pageContext.url || ""
  });

  let aiAnalysis = null;
  try {
    aiAnalysis = await askOpenRouterForJobAnalysis({
      apiKey,
      model,
      cvText: data.cvText,
      extraPrompt: data.extraPrompt || "",
      pageContext,
      localAnalysis
    });
  } catch (error) {
    console.warn("AI analysis fallback to local only:", error);
  }

  const result = { pageContext, localAnalysis, aiAnalysis };
  await chrome.storage.local.set({ lastJobAnalysis: result, lastScannedJob: pageContext });
  return result;
}

async function askOpenRouter({ apiKey, model, cvText, extraPrompt, pageUrl, formContext }) {
  const autofillProfile = buildAutofillProfile(cvText);
  const systemPrompt = [
    "Eres un asistente que completa formularios de trabajo.",
    "Recibirás el CV del usuario, un perfil derivado y los campos del formulario actual.",
    "Tu objetivo es completar TODOS los campos razonables con datos reales o inferidos del CV.",
    "Prioriza nombre, email, teléfono, LinkedIn, portfolio, ubicación, autorización laboral, seniority, rol y respuestas breves coherentes con el CV.",
    "No inventes experiencia falsa. Si un dato no existe y no puede inferirse con seguridad, deja value vacío.",
    "Responde EXCLUSIVAMENTE JSON válido con formato:",
    '{"fields":[{"selectorHint":"","name":"","type":"","value":""}]}'
  ].join(" ");

  const userPrompt = JSON.stringify(
    {
      task: "Completar el formulario laboral usando el CV y el perfil derivado. Intenta cubrir todos los campos útiles y obligatorios con respuestas breves y profesionales. Si no hay dato fiable, deja value vacío.",
      pageUrl,
      cvText,
      autofillProfile,
      extraPrompt,
      formContext
    },
    null,
    2
  );

  const response = await postToOpenRouter({
    apiKey,
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ]
  });

  return response?.choices?.[0]?.message?.content || "";
}

async function generateFieldContent(field, pageUrl) {
  const data = await chrome.storage.local.get(["cvText", "openrouterApiKey", "model", "extraPrompt"]);
  const apiKey = data.openrouterApiKey || DEFAULT_OPENROUTER_API_KEY;
  const model = data.model || DEFAULT_MODEL;

  if (!apiKey || !data.cvText) {
    throw new Error("Falta el CV en la configuración.");
  }

  const systemPrompt = [
    "Eres un asistente que redacta una sola respuesta para un campo de formulario laboral.",
    "Debes usar el CV y el contexto del campo.",
    "Responde EXCLUSIVAMENTE JSON válido con formato:",
    '{"value":"","confidence":"high|medium|low"}'
  ].join(" ");

  const userPrompt = JSON.stringify(
    {
      task: "Genera una respuesta útil y breve para este campo. Si es input corto, responde corto. Si es textarea, responde natural y profesional.",
      pageUrl,
      cvText: data.cvText,
      extraPrompt: data.extraPrompt || "",
      field
    },
    null,
    2
  );

  const response = await postToOpenRouter({
    apiKey,
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ]
  });

  const parsed = safeJson(response?.choices?.[0]?.message?.content || "");
  if (!parsed || typeof parsed.value !== "string") {
    throw new Error("Respuesta inválida para el campo.");
  }

  return parsed;
}

async function sendMessageToTab(tabId, message, { injectIfMissing = true } = {}) {
  if (!tabId) {
    throw new Error("No hay pestaña activa disponible.");
  }

   try {
     return await chrome.tabs.sendMessage(tabId, message);
   } catch (error) {
     if (!injectIfMissing || !isMissingReceiverError(error)) {
       throw error;
     }

     const injected = await ensureContentScriptReady(tabId);
     if (!injected) {
       return null; // Cannot inject on this page
     }

     // Retry up to 3 times after injection
     for (let attempt = 1; attempt <= 3; attempt++) {
       await delay(attempt * 150);
       try {
         return await chrome.tabs.sendMessage(tabId, message);
       } catch (retryError) {
         if (attempt === 3) throw retryError;
       }
     }
   }
}

async function ensureContentScriptReady(tabId) {
  const tab = await chrome.tabs.get(tabId);
  const url = String(tab?.url || "");

  if (!canInjectContentScript(url)) {
    return false;
  }

  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["content.js"]
  });
  return true;
}

function canInjectContentScript(url) {
  if (!url) {
    return false;
  }

  return !/^(chrome|chrome-extension|devtools|edge|about):/i.test(url);
}

function isMissingReceiverError(error) {
  const message = error instanceof Error ? error.message : String(error || "");
  return message.includes("Receiving end does not exist") || message.includes("Could not establish connection");
}

async function askOpenRouterForJobAnalysis({ apiKey, model, cvText, extraPrompt, pageContext, localAnalysis }) {
  const systemPrompt = [
    "Eres un analista de match entre CV y vacantes.",
    "Debes devolver EXCLUSIVAMENTE JSON válido con el formato:",
    '{"summary":"","strengths":[],"gaps":[],"tailoredTips":[],"recommended":true}'
  ].join(" ");

  const userPrompt = JSON.stringify(
    {
      task: "Analiza si conviene aplicar a esta vacante y da recomendaciones accionables.",
      cvText,
      extraPrompt,
      localAnalysis,
      job: {
        title: pageContext.title,
        company: pageContext.company,
        location: pageContext.location,
        description: pageContext.description,
        url: pageContext.url
      }
    },
    null,
    2
  );

  const response = await postToOpenRouter({
    apiKey,
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ]
  });

  return safeJson(response?.choices?.[0]?.message?.content || "");
}

async function postToOpenRouter({ apiKey, model, messages }) {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      response_format: { type: "json_object" },
      messages
    })
  });

  if (!response.ok) {
    throw new Error(`OpenRouter status ${response.status}`);
  }

  return response.json();
}

function safeJson(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function getRecommendationTier(score) {
  if (score >= 82) return "top";
  if (score >= 68) return "good";
  if (score >= 52) return "medium";
  return "weak";
}

function buildAutofillProfile(cvText) {
  return extractCvProfileSnapshot(cvText, {});
}

function collectFormContext() {
  const inputs = Array.from(document.querySelectorAll("input, textarea, select"));

  return inputs
    .filter((el) => {
      const tag = el.tagName.toLowerCase();
      if (tag === "input") {
        const type = (el.getAttribute("type") || "text").toLowerCase();
        return !["hidden", "submit", "button", "reset", "image"].includes(type);
      }
      return true;
    })
    .map((el) => {
      const label =
        (el.labels && el.labels[0] && el.labels[0].innerText) ||
        el.getAttribute("aria-label") ||
        el.getAttribute("placeholder") ||
        "";

      return {
        name: el.getAttribute("name") || "",
        id: el.id || "",
        type: (el.getAttribute("type") || el.tagName).toLowerCase(),
        label: label.trim(),
        placeholder: (el.getAttribute("placeholder") || "").trim(),
        required: el.required || false,
        options:
          el.tagName.toLowerCase() === "select"
            ? Array.from(el.options || [])
                .map((option) => option.textContent.trim())
                .filter(Boolean)
                .slice(0, 12)
            : [],
        selectorHint: buildSelectorHint(el)
      };
    });

  function buildSelectorHint(el) {
    if (el.id) return `#${el.id}`;
    const name = el.getAttribute("name");
    if (name) return `[name="${name}"]`;
    return el.tagName.toLowerCase();
  }
}

function stripHash(value) {
  return String(value || "").split("#")[0];
}

function delay(timeout) {
  return new Promise((resolve) => setTimeout(resolve, timeout));
}

function waitForTabComplete(tabId, timeout = 30000) {
  return new Promise((resolve, reject) => {
    let finished = false;
    const timer = setTimeout(() => {
      if (finished) return;
      finished = true;
      chrome.tabs.onUpdated.removeListener(handleUpdate);
      reject(new Error("La página tardó demasiado en cargar."));
    }, timeout);

    function handleUpdate(updatedTabId, changeInfo) {
      if (updatedTabId !== tabId || changeInfo.status !== "complete" || finished) {
        return;
      }

      finished = true;
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(handleUpdate);
      resolve();
    }

    chrome.tabs.onUpdated.addListener(handleUpdate);
  });
}

function waitForUrlChange(tabId, previousUrl, timeout = 5000) {
  return new Promise((resolve, reject) => {
    let finished = false;
    const timer = setTimeout(() => {
      if (finished) return;
      finished = true;
      chrome.tabs.onUpdated.removeListener(handleUpdate);
      reject(new Error("No hubo cambio de URL."));
    }, timeout);

    function handleUpdate(updatedTabId, changeInfo, tab) {
      if (updatedTabId !== tabId || finished) {
        return;
      }

      const nextUrl = String(changeInfo.url || tab?.url || "");
      if (!nextUrl || stripHash(nextUrl) === stripHash(previousUrl)) {
        return;
      }

      finished = true;
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(handleUpdate);
      resolve(true);
    }

    chrome.tabs.onUpdated.addListener(handleUpdate);
  });
}

function waitForApplyNavigation(sourceTabId, previousUrl, timeout = 5000) {
  return new Promise((resolve, reject) => {
    let finished = false;
    let createdTabId = null;
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("No hubo navegación de apply."));
    }, timeout);

    function cleanup() {
      if (finished) {
        return;
      }
      finished = true;
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(handleUpdated);
      chrome.tabs.onCreated.removeListener(handleCreated);
    }

    function resolveWith(tabId, url) {
      cleanup();
      resolve({ tabId, url });
    }

    function handleUpdated(updatedTabId, changeInfo, tab) {
      if (finished) {
        return;
      }

      const nextUrl = String(changeInfo.url || tab?.url || "");
      if (!nextUrl) {
        return;
      }

      if (updatedTabId === sourceTabId && stripHash(nextUrl) !== stripHash(previousUrl)) {
        resolveWith(updatedTabId, nextUrl);
        return;
      }

      if (createdTabId && updatedTabId === createdTabId && changeInfo.status === "complete") {
        resolveWith(updatedTabId, nextUrl);
      }
    }

    function handleCreated(tab) {
      if (finished || tab.openerTabId !== sourceTabId) {
        return;
      }

      createdTabId = tab.id;
      const nextUrl = String(tab.pendingUrl || tab.url || "");
      if (nextUrl) {
        resolveWith(tab.id, nextUrl);
      }
    }

    chrome.tabs.onUpdated.addListener(handleUpdated);
    chrome.tabs.onCreated.addListener(handleCreated);
  });
}

async function recordApplicationEvent({ jobUrl, destinationUrl, mode, applyLabel }) {
  const { applicationHistory = [], jobTracker = [], lastScannedJob = null, lastJobAnalysis = null, currentUserUid = "" } = await chrome.storage.local.get([
    "applicationHistory",
    "jobTracker",
    "lastScannedJob",
    "lastJobAnalysis",
    "currentUserUid"
  ]);
  const entry = {
    id: `${Date.now()}-${mode}`,
    jobUrl: String(jobUrl || ""),
    destinationUrl: String(destinationUrl || ""),
    mode: String(mode || ""),
    applyLabel: String(applyLabel || ""),
    createdAt: Date.now()
  };

  const scanned = lastScannedJob?.url === jobUrl ? lastScannedJob : lastJobAnalysis?.pageContext?.url === jobUrl ? lastJobAnalysis.pageContext : null;
  const trackedJob = {
    id: String(jobUrl || destinationUrl || entry.id),
    title: scanned?.title || "Vacante aplicada",
    company: scanned?.company || "",
    location: scanned?.location || "",
    url: String(jobUrl || destinationUrl || ""),
    score: lastJobAnalysis?.localAnalysis?.score || null,
    easyApply: /easy apply/i.test(String(applyLabel || scanned?.applyLabel || "")),
    status: "applied",
    updatedAt: Date.now()
  };

  await chrome.storage.local.set({
    applicationHistory: [entry, ...applicationHistory].slice(0, 80),
    jobTracker: [trackedJob, ...jobTracker.filter((item) => String(item.id || item.url) !== trackedJob.id)].slice(0, 80)
  });

  if (currentUserUid) {
    const firestoreData = {
      id: entry.id,
      jobUrl: String(jobUrl || ""),
      destinationUrl: String(destinationUrl || ""),
      jobTitle: scanned?.title || "Vacante aplicada",
      company: scanned?.company || "",
      location: scanned?.location || "",
      mode: String(mode || ""),
      applyLabel: String(applyLabel || ""),
      score: lastJobAnalysis?.localAnalysis?.score || null,
      status: "applied",
      createdAt: Date.now()
    };
    await saveApplicationToFirestore(currentUserUid, firestoreData);
    await saveTrackerItemToFirestore(currentUserUid, trackedJob);
    await mergeUserProfile(currentUserUid, {
      lastApplicationAt: firebase.firestore.FieldValue.serverTimestamp(),
      lastAppliedRole: firestoreData.jobTitle,
      lastAppliedCompany: firestoreData.company
    });
    await saveUserActivity(currentUserUid, "application_recorded", {
      jobTitle: firestoreData.jobTitle,
      company: firestoreData.company,
      mode: firestoreData.mode,
      status: firestoreData.status,
      destinationUrl: firestoreData.destinationUrl
    });
  }
}

async function handleManualSubmission(jobUrl, jobTitle, company, method) {
  const { jobTracker = [], applicationHistory = [], currentUserUid = "" } = await chrome.storage.local.get([
    "jobTracker",
    "applicationHistory",
    "currentUserUid"
  ]);

  const entry = {
    id: `${Date.now()}-${method}`,
    jobUrl: String(jobUrl || ""),
    destinationUrl: String(jobUrl || ""),
    jobTitle: String(jobTitle || "Vacante"),
    company: String(company || ""),
    mode: String(method || "manual"),
    status: "applied",
    createdAt: Date.now()
  };

  const trackedJob = {
    id: String(jobUrl || entry.id),
    title: jobTitle || "Vacante aplicada",
    company: company || "",
    location: "",
    url: jobUrl || "",
    score: null,
    easyApply: false,
    status: "applied",
    updatedAt: Date.now()
  };

  await chrome.storage.local.set({
    applicationHistory: [entry, ...applicationHistory].slice(0, 80),
    jobTracker: [trackedJob, ...jobTracker.filter((item) => String(item.id || item.url) !== trackedJob.id)].slice(0, 80)
  });

  if (currentUserUid) {
    const firestoreData = {
      id: entry.id,
      jobUrl: String(jobUrl || ""),
      destinationUrl: String(jobUrl || ""),
      jobTitle: String(jobTitle || "Vacante"),
      company: String(company || ""),
      location: "",
      mode: String(method || "manual"),
      applyLabel: "",
      score: null,
      status: "applied",
      createdAt: Date.now()
    };
    await saveApplicationToFirestore(currentUserUid, firestoreData);
    await saveTrackerItemToFirestore(currentUserUid, trackedJob);
    await mergeUserProfile(currentUserUid, {
      lastApplicationAt: firebase.firestore.FieldValue.serverTimestamp(),
      lastAppliedRole: firestoreData.jobTitle,
      lastAppliedCompany: firestoreData.company
    });
    await saveUserActivity(currentUserUid, "manual_application_recorded", {
      jobTitle: firestoreData.jobTitle,
      company: firestoreData.company,
      mode: firestoreData.mode
    });
    console.log("Manual submission saved to Firestore:", jobTitle);
  }
}

async function syncCvRecord(record) {
  const {
    currentUserUid = "",
    profileOverrides = {}
  } = await chrome.storage.local.get(["currentUserUid", "profileOverrides"]);

  if (!currentUserUid) {
    return { synced: false, reason: "no-user" };
  }

  const cvText = String(record.cvText || "").trim();
  const derivedProfile = record.lastProfile || (cvText ? deriveProfileFromCv(cvText, profileOverrides) : null);
  const cvPayload = {
    id: record.id || `${record.cvFileName || "cv"}-${record.cvUpdatedAt || Date.now()}`,
    sessionId: record.sessionId || "",
    fileName: record.cvFileName || "CV",
    cvFileName: record.cvFileName || "CV",
    cvFileType: record.cvFileType || "",
    cvFileSize: record.cvFileSize || 0,
    cvFileLastModified: record.cvFileLastModified || null,
    cvFileDataUrl: record.cvFileDataUrl || "",
    cvText,
    cvUpdatedAt: record.cvUpdatedAt || Date.now(),
    storageMode: record.cvStorageMode || "local-file",
    profile: derivedProfile || null
  };

  const cvId = await saveCvToFirestore(currentUserUid, cvPayload);
  await mergeUserProfile(currentUserUid, {
    lastCvId: cvId,
    lastCvName: cvPayload.cvFileName,
    lastCvUpdatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    lastProfile: derivedProfile || null,
    role: derivedProfile?.role || "",
    seniority: derivedProfile?.seniority || "",
    preferredLocation: derivedProfile?.preferredLocation || "",
    remotePreference: derivedProfile?.remotePreference || "",
    skills: derivedProfile?.skills || []
  });
  await saveUserActivity(currentUserUid, "cv_uploaded", {
    cvId,
    fileName: cvPayload.cvFileName,
    storageMode: cvPayload.storageMode
  });

  return { synced: true, cvId };
}

initFirebase().catch(() => null);
