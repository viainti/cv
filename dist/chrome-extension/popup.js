import { extractTextFromFile } from "./cv-parser.js";
import { deriveProfileFromCv, extractCvProfileSnapshot } from "./profile-search.js";

const PLAN_CATALOG = {
  freemium: {
    id: "freemium",
    name: "Freemium",
    priceUsd: 0,
    applicationQuota: 10,
    directCompanies: 0,
    directContactsPerCompany: 0
  },
  basic: {
    id: "basic",
    name: "Plan basico",
    priceUsd: 9.9,
    applicationQuota: 100,
    directCompanies: 0,
    directContactsPerCompany: 0
  },
  improved: {
    id: "improved",
    name: "Plan Mejorado",
    priceUsd: 14.9,
    applicationQuota: 250,
    directCompanies: 0,
    directContactsPerCompany: 0
  },
  advanced: {
    id: "advanced",
    name: "Plan avanzado",
    priceUsd: 19.9,
    applicationQuota: 500,
    directCompanies: 0,
    directContactsPerCompany: 0
  },
  star: {
    id: "star",
    name: "Plan Estrella",
    priceUsd: 49.9,
    applicationQuota: 500,
    directCompanies: 10,
    directContactsPerCompany: 5
  },
  diamond: {
    id: "diamond",
    name: "Plan Diamond",
    priceUsd: 99.9,
    applicationQuota: 500,
    directCompanies: 100,
    directContactsPerCompany: 5
  },
  ultra: {
    id: "ultra",
    name: "Plan Ultra",
    priceUsd: 499.9,
    applicationQuota: 500,
    directCompanies: 1000,
    directContactsPerCompany: 5
  }
};

const PRICING_URL = "https://trcvastian.com/#pricing";

const firebaseConfig = {
  apiKey: "AIzaSyBBf12MUVkVfORdYkSVLOUMnFumEnb9gCY",
  authDomain: "cvastian-8144c.firebaseapp.com",
  projectId: "cvastian-8144c",
  storageBucket: "cvastian-8144c.firebasestorage.app",
  messagingSenderId: "293520779866",
  appId: "1:293520779866:web:7f5a7233766b78548f0663"
};

await window.__firebaseReady;

const firebase = window.firebase;
if (!firebase.apps?.length) {
  firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();
const db = firebase.firestore();

// User data references
let currentUser = null;
let userProfileRef = null;
let userCvsRef = null;
let userApplicationsRef = null;
let userSearchesRef = null;
let userActivityRef = null;

function setUserRefs(uid) {
  userProfileRef = db.collection("users").doc(uid);
  userCvsRef = db.collection("users").doc(uid).collection("cvs");
  userApplicationsRef = db.collection("users").doc(uid).collection("applications");
  userSearchesRef = db.collection("users").doc(uid).collection("searches");
  userActivityRef = db.collection("users").doc(uid).collection("activity");
}

function clearUserRefs() {
  userProfileRef = null;
  userCvsRef = null;
  userApplicationsRef = null;
  userSearchesRef = null;
  userActivityRef = null;
}

function formatFirebaseDate(value) {
  if (!value) {
    return "";
  }

  if (typeof value?.toDate === "function") {
    return value.toDate().toLocaleString();
  }

  if (typeof value?.seconds === "number") {
    return new Date(value.seconds * 1000).toLocaleString();
  }

  if (typeof value === "number") {
    return new Date(value).toLocaleString();
  }

  return "";
}

async function saveActivityToFirestore(type, payload = {}) {
  if (!currentUser || !userActivityRef) return null;
  try {
    const activityRef = await userActivityRef.add({
      type,
      ...payload,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    return activityRef.id;
  } catch (error) {
    console.error("Error saving activity to Firestore:", error);
    return null;
  }
}

async function saveCvToFirestore(cvData) {
  if (!currentUser || !userCvsRef) return null;
  try {
    const docId = String(cvData.id || `${cvData.cvFileName || "cv"}-${cvData.cvUpdatedAt || Date.now()}`)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || `cv-${Date.now()}`;
    const cvRef = userCvsRef.doc(docId);
    await cvRef.set({
      ...cvData,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    return cvRef.id;
  } catch (error) {
    console.error("Error saving CV to Firestore:", error);
    return null;
  }
}

async function saveApplicationToFirestore(applicationData) {
  if (!currentUser || !userApplicationsRef) return null;
  try {
    const appRef = await userApplicationsRef.add({
      ...applicationData,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      status: "pending"
    });
    return appRef.id;
  } catch (error) {
    console.error("Error saving application to Firestore:", error);
    return null;
  }
}

async function saveSearchToFirestore(searchData) {
  if (!currentUser || !userSearchesRef) return null;
  try {
    const searchRef = await userSearchesRef.add({
      ...searchData,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    return searchRef.id;
  } catch (error) {
    console.error("Error saving search to Firestore:", error);
    return null;
  }
}

async function loadUserProfile() {
  if (!currentUser || !userProfileRef) return null;
  try {
    const doc = await userProfileRef.get();
    return doc.exists ? doc.data() : null;
  } catch (error) {
    console.error("Error loading user profile:", error);
    return null;
  }
}

function getDefaultBillingProfile() {
  const freemiumPlan = PLAN_CATALOG.freemium;
  return {
    subscriptionPlan: freemiumPlan.id,
    subscriptionPlanName: freemiumPlan.name,
    subscriptionPriceUsd: freemiumPlan.priceUsd,
    applicationQuota: freemiumPlan.applicationQuota,
    directCompaniesQuota: freemiumPlan.directCompanies,
    directContactsPerCompany: freemiumPlan.directContactsPerCompany,
    planStatus: "trial",
    billingEnabled: false,
    registeredAt: firebase.firestore.FieldValue.serverTimestamp()
  };
}

async function ensureUserBillingProfile() {
  if (!currentUser || !userProfileRef) {
    return null;
  }

  const snapshot = await userProfileRef.get();
  const existing = snapshot.exists ? snapshot.data() || {} : {};

  if (existing.subscriptionPlan) {
    currentUserProfile = existing;
    return existing;
  }

  const defaultBilling = getDefaultBillingProfile();
  await userProfileRef.set(
    {
      email: currentUser.email || "",
      name: currentUser.displayName || "",
      ...defaultBilling,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    },
    { merge: true }
  );

  currentUserProfile = {
    email: currentUser.email || "",
    name: currentUser.displayName || "",
    ...defaultBilling
  };

  await saveActivityToFirestore("plan_initialized", {
    subscriptionPlan: defaultBilling.subscriptionPlan,
    subscriptionPlanName: defaultBilling.subscriptionPlanName
  });

  return currentUserProfile;
}

async function updateUserProfile(profileData) {
  if (!currentUser || !userProfileRef) return;
  try {
    await userProfileRef.set({
      ...profileData,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    currentUserProfile = { ...(currentUserProfile || {}), ...profileData };
    await saveActivityToFirestore("account_profile_updated", {
      name: profileData.name || "",
      location: profileData.location || ""
    });
  } catch (error) {
    console.error("Error updating user profile:", error);
  }
}

async function loadUserCvs() {
  if (!currentUser || !userCvsRef) return [];
  try {
    const snapshot = await userCvsRef.get();
    return snapshot.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .sort((a, b) => getCvUpdatedAtValue(b) - getCvUpdatedAtValue(a));
  } catch (error) {
    console.error("Error loading CVs:", error);
    return [];
  }
}

async function deleteUserCv(cvId) {
  if (!currentUser || !userCvsRef || !cvId) return false;
  try {
    await userCvsRef.doc(String(cvId)).delete();
    await saveActivityToFirestore("cv_deleted", {
      cvId: String(cvId)
    });
    return true;
  } catch (error) {
    console.error("Error deleting CV:", error);
    return false;
  }
}

async function loadUserApplications() {
  if (!currentUser || !userApplicationsRef) return [];
  try {
    const snapshot = await userApplicationsRef.orderBy("createdAt", "desc").get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error("Error loading applications:", error);
    return [];
  }
}

async function loadUserSearches() {
  if (!currentUser || !userSearchesRef) return [];
  try {
    const snapshot = await userSearchesRef.orderBy("createdAt", "desc").limit(20).get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error("Error loading searches:", error);
    return [];
  }
}

async function loadUserActivity(limit = 8) {
  if (!currentUser || !userActivityRef) return [];
  try {
    const snapshot = await userActivityRef.orderBy("createdAt", "desc").limit(limit).get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error("Error loading activity:", error);
    return [];
  }
}

async function loadLocalHistoryData() {
  const { applicationHistory = [], searchHistory = [] } = await chrome.storage.local.get([
    "applicationHistory",
    "searchHistory"
  ]);

  return {
    applicationHistory: Array.isArray(applicationHistory) ? applicationHistory : [],
    searchHistory: Array.isArray(searchHistory) ? searchHistory : []
  };
}

function normalizeApplicationRecord(item = {}) {
  return {
    id: String(item.id || item.jobUrl || item.destinationUrl || `${item.createdAt || ""}-${item.mode || ""}`),
    jobTitle: String(item.jobTitle || item.title || "Vacante").trim(),
    company: String(item.company || "").trim(),
    mode: String(item.mode || "").trim(),
    status: String(item.status || "pending").trim(),
    jobUrl: String(item.jobUrl || "").trim(),
    destinationUrl: String(item.destinationUrl || "").trim(),
    createdAt: item.createdAt || 0
  };
}

function normalizeSearchRecord(item = {}) {
  const keywords = Array.isArray(item.keywords)
    ? item.keywords
    : String(item.keywords || "")
        .split(",")
        .map((keyword) => keyword.trim())
        .filter(Boolean);

  return {
    id: String(item.id || item.searchUrl || `${item.portalId || ""}-${item.createdAt || ""}`),
    role: String(item.role || "").trim(),
    keywords,
    portalId: String(item.portalId || "linkedin").trim(),
    portalLabel: String(item.portalLabel || item.portalId || "LinkedIn").trim(),
    searchUrl: String(item.searchUrl || "").trim(),
    createdAt: item.createdAt || 0
  };
}

function getCreatedAtValue(item) {
  if (typeof item?.createdAt?.toDate === "function") {
    return item.createdAt.toDate().getTime();
  }

  if (typeof item?.createdAt?.seconds === "number") {
    return item.createdAt.seconds * 1000;
  }

  if (typeof item?.createdAt === "number") {
    return item.createdAt;
  }

  return 0;
}

function mergeUniqueBy(items, getKey) {
  const merged = [];
  const seen = new Set();

  for (const item of items) {
    const key = String(getKey(item) || "").trim();
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    merged.push(item);
  }

  return merged.sort((a, b) => getCreatedAtValue(b) - getCreatedAtValue(a));
}

async function getMergedApplications() {
  const [remoteApplications, localData] = await Promise.all([loadUserApplications(), loadLocalHistoryData()]);
  const normalizedRemote = remoteApplications.map(normalizeApplicationRecord);
  const normalizedLocal = localData.applicationHistory.map(normalizeApplicationRecord);

  return mergeUniqueBy([...normalizedRemote, ...normalizedLocal], (item) => item.jobUrl || item.destinationUrl || item.id);
}

async function getMergedSearches() {
  const [remoteSearches, localData] = await Promise.all([loadUserSearches(), loadLocalHistoryData()]);
  const normalizedRemote = remoteSearches.map(normalizeSearchRecord);
  const normalizedLocal = localData.searchHistory.map(normalizeSearchRecord);

  return mergeUniqueBy([...normalizedRemote, ...normalizedLocal], (item) => item.searchUrl || item.id);
}

async function ensurePlanCanApply() {
  const applications = await getMergedApplications();
  const usage = getPlanUsageStatus(applications.length);

  if (usage.blocked) {
    showUpgradeView();
    throw new Error(`Tu plan ${usage.plan.name} ya uso ${usage.quota} postulaciones. Haz upgrade para seguir aplicando.`);
  }

  return usage;
}

async function syncCurrentCvToFirebase(record) {
  try {
    const response = await chrome.runtime.sendMessage({
      type: "SYNC_CV_RECORD",
      record
    });

    if (!response?.success) {
      throw new Error(response?.reason || "No se pudo sincronizar el CV.");
    }
  } catch (error) {
    console.error("Error syncing CV via background:", error);
    await saveCvToFirestore({
      ...record,
      id: record.id || `${record.cvFileName || "cv"}-${record.cvUpdatedAt || Date.now()}`,
      fileName: record.cvFileName || "CV",
      storageMode: record.cvStorageMode || "local-file"
    });
    await updateUserProfile({
      lastCvName: record.cvFileName || "CV",
      lastCvUpdatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      lastProfile: record.lastProfile || null
    });
    await saveActivityToFirestore("cv_uploaded", {
      fileName: record.cvFileName || "CV",
      storageMode: record.cvStorageMode || "local-file"
    });
  }
}

async function syncLocalStateAfterLogin() {
  if (!currentUser) {
    return;
  }

  const {
    cvText = "",
    cvFileName = "",
    cvFileType = "",
    cvFileSize = 0,
    cvFileLastModified = null,
    cvFileDataUrl = "",
    cvUpdatedAt = 0,
    cvStorageMode = "",
    sessionId = "",
    lastProfile = null
  } = await chrome.storage.local.get([
    "cvText",
    "cvFileName",
    "cvFileType",
    "cvFileSize",
    "cvFileLastModified",
    "cvFileDataUrl",
    "cvUpdatedAt",
    "cvStorageMode",
    "sessionId",
    "lastProfile"
  ]);

  if (!cvText.trim()) {
    return;
  }

  await syncCurrentCvToFirebase({
    id: `${cvFileName || "cv"}-${cvUpdatedAt || Date.now()}`,
    sessionId,
    cvText,
    cvFileName,
    cvFileType,
    cvFileSize,
    cvFileLastModified,
    cvFileDataUrl,
    cvUpdatedAt: cvUpdatedAt || Date.now(),
    cvStorageMode: cvStorageMode || "local-text",
    lastProfile
  });
}

const PORTALS = [
  { id: "linkedin", label: "LinkedIn" },
  { id: "getonboard", label: "Get on Board" },
  { id: "computrabajo", label: "Computrabajo" },
  { id: "bumeran", label: "Bumeran" },
  { id: "laborum", label: "Laborum" },
  { id: "elempleo", label: "Elempleo" },
  { id: "indeed", label: "Indeed" },
  { id: "glassdoor", label: "Glassdoor" },
  { id: "wellfound", label: "Wellfound" },
  { id: "remoteok", label: "Remote OK" },
  { id: "weworkremotely", label: "We Work Remotely" },
  { id: "torre", label: "Torre" },
  { id: "jooble", label: "Jooble" }
];

const ENABLED_PORTAL_IDS = ["linkedin"];

function isOnLinkedInJobsSearch() {
  const url = String(activeTabInfo?.url || "");
  return /linkedin\.com\/jobs\/search/i.test(url);
}

function isOnLinkedInJobView() {
  const url = String(activeTabInfo?.url || "");
  return /linkedin\.com\/jobs\/view\/\d+/i.test(url);
}

function isOnLinkedInHost() {
  const url = String(activeTabInfo?.url || "");
  return /linkedin\.com/i.test(url);
}

function isConcreteLinkedInJobUrl(value) {
  return /linkedin\.com\/jobs\/view\/\d+/i.test(String(value || ""));
}

let cvTextEl;
let cvFileEl;
let introStepEl;
let introCarouselEl;
let introDotsEl;
let skipIntroBtn;
let startIntroBtn;
let cvActionBtn;
let languageFlagEl;
let authSection;
let extractCvBtn;
let continueBtn;
let backBtn;
let backToCvBtn;
let backToCvBtnInline;
let backToCvBtnTop;
let improveCvBtn;
let continueToJobsBtn;
let sourceSelectorEl;
let jobActionButtonsEl;
let cvImprovePanelEl;
let magicImproveBtn;
let backToActionsBtn;
let magicLoaderEl;
let improvedCvTextEl;
let saveImprovedCvBtn;
let downloadImprovedPdfBtn;
let saveSuccessEl;
let openSearchBtn;
let openSearchEmptyBtn;
let activePortalIconEl;
let activePortalLabelEl;
let applyBtn;
let batchApplyCountEl;
let batchApplyCountDisplayEl;
let batchApplyDropdownEl;
let batchApplyBtn;
let statusEl;
let headerEl;
let cvPreviewEl;
let cvFileNameEl;
let cvStorageHintEl;
let cvExtractionStateEl;
let cvSavedAtEl;
let cvUploadProgressEl;
let cvUploadStatusLabelEl;
let cvUploadStatusHintEl;
let sessionBadgeEl;
let cvReadyBadgeEl;
let cvStepEl;
let jobStepEl;
let jobActionStepEl;
let jobDashboardEl;
let portalTabsEl;
let sectionTabsEl;
let jobsTabEl;
let jobsEmptyStateEl;
let jobsEmptySpinnerEl;
let jobsEmptyProgressEl;
let jobsResultsPanelEl;
let jobsListContainerEl;
let trackerTabEl;
let profileTabEl;
let jobsEl;
let trackerListEl;
let historyListEl;
let bestJobTitleEl;
let bestJobMetaEl;
let bestJobLogoShellEl;
let bestJobLogoEl;
let bestJobDescriptionEl;
let bestJobScoreEl;
let jobPickLoaderEl;
let bestJobTierEl;
let bestJobEasyEl;
let bestJobReasonEl;
let bestJobCompanyEl;
let bestJobLocationEl;
let bestJobRemoteEl;
let bestJobScoreValueEl;
let bestJobScoreRingEl;
let bestJobAnalysisEl;
let jobsResultCountEl;
let coverLetterBoxEl;
let quickAnswersBoxEl;
let generateAnswersBtn;
let saveProfileBtn;
let profileRoleEl;
let profileSkillsEl;
let profileSeniorityEl;
let profileRemoteEl;
let profileName;
let profileEmail;
let profilePhone;
let profileLocation;
let profileCity;
let profileState;
let profileCountry;
let profileStats;
let profileCvDetails;
let profileActivityList;
let planRemaining;
let planUsageLabel;
let planUsageTitle;
let planProgressBar;
let planCurrentName;
let planStatusBadge;
let planStatusCopy;
let planCtaHint;
let openPricingBtn;
let closeProfileBtn;
let backFromProfileBtn;
let closeCvsBtn;
let backFromCvsBtn;
let cvsList;
let closeApplicationsBtn;
let backFromApplicationsBtn;
let applicationsList;
let closeSearchesBtn;
let backFromSearchesBtn;
let searchesList;
let upgradeView;
let closeUpgradeBtn;
let backFromUpgradeBtn;
let upgradeNowBtn;
let userMenuBtn;
let userMenuPanel;
let closeUserMenuBtn;
let menuProfileBtn;
let menuCvsBtn;
let menuApplicationsBtn;
let menuSearchesBtn;
let menuLogoutBtn;
let menuUserName;
let menuUserEmail;
let menuUserInitial;
let profileView;
let profileResumenTab;
let profileEditarTab;
let profileActividadTab;
let profileCvsList;
let cvsView;
let applicationsView;
let searchesView;
let loginBtn;
let registerBtn;
let forgotPasswordBtn;
let loginPasswordToggle;
let registerPasswordToggle;
let logoutBtn;
let userNameEl;
let userEmailEl;
let userInitialEl;
let welcomeUserName;
let carouselSection;
let carouselButtons;
let authError;
let showRegisterBtn;
let showLoginBtn;
let loginForm;
let registerForm;
let userPanel;

let activeView = "intro";
let activePortal = "linkedin";
let activeTabInfo = null;
let selectedJob = null;
let jobs = [];
let tracker = [];
let searchHistory = [];
let currentProfile = null;
let currentUserProfile = null;
let introIndex = 0;
let introInterval = null;
let currentSessionId = "";
let currentCvMeta = null;
let jobStepMode = "actions";
let activeSection = "jobs";
let actionSubstep = "actions";
let improvedCvDraft = "";
let isMagicLoading = false;
let isPickingJob = false;
let isBatchApplying = false;
let isAutoOpeningPortal = false;
let bootLoaderEl;
let bootLoaderLabelEl;

init();

async function init() {
  // Cache DOM elements
  cvTextEl = document.getElementById("cvText");
  cvFileEl = document.getElementById("cvFile");
  introStepEl = document.getElementById("introStep");
  bootLoaderEl = document.getElementById("bootLoader");
  bootLoaderLabelEl = document.getElementById("bootLoaderLabel");
  skipIntroBtn = document.getElementById("skipIntroBtn");
  startIntroBtn = document.getElementById("startIntroBtn");
  cvActionBtn = document.getElementById("cvAction");
  languageFlagEl = document.getElementById("languageFlag");
  authSection = document.getElementById("authSection");
  extractCvBtn = document.getElementById("extractCv");
  continueBtn = document.getElementById("continueBtn");
  backBtn = document.getElementById("backBtn");
  backToCvBtn = document.getElementById("backToCvBtn");
  backToCvBtnInline = document.getElementById("backToCvBtnInline");
  backToCvBtnTop = document.getElementById("backToCvBtnTop");
  improveCvBtn = document.getElementById("improveCvBtn");
  continueToJobsBtn = document.getElementById("continueToJobsBtn");
  sourceSelectorEl = document.getElementById("sourceSelector");
  jobActionButtonsEl = document.getElementById("jobActionButtons");
  cvImprovePanelEl = document.getElementById("cvImprovePanel");
  magicImproveBtn = document.getElementById("magicImproveBtn");
  backToActionsBtn = document.getElementById("backToActionsBtn");
  magicLoaderEl = document.getElementById("magicLoader");
  improvedCvTextEl = document.getElementById("improvedCvText");
  saveImprovedCvBtn = document.getElementById("saveImprovedCvBtn");
  downloadImprovedPdfBtn = document.getElementById("downloadImprovedPdfBtn");
  saveSuccessEl = document.getElementById("saveSuccess");
  openSearchBtn = document.getElementById("openSearchBtn");
  openSearchEmptyBtn = document.getElementById("openSearchEmptyBtn");
  activePortalIconEl = document.getElementById("activePortalIcon");
  activePortalLabelEl = document.getElementById("activePortalLabel");
  applyBtn = document.getElementById("applyJob");
  batchApplyCountEl = document.getElementById("batchApplyCount");
  batchApplyCountDisplayEl = document.getElementById("batchApplyCountDisplay");
  batchApplyDropdownEl = document.getElementById("batchApplyDropdown");
  batchApplyBtn = document.getElementById("batchApplyJobs");
  statusEl = document.getElementById("status");
  headerEl = document.getElementById("appHeader");
  cvPreviewEl = document.getElementById("cvPreview");
  cvFileNameEl = document.getElementById("cvFileName");
  cvStorageHintEl = document.getElementById("cvStorageHint");
  cvExtractionStateEl = document.getElementById("cvExtractionState");
  cvSavedAtEl = document.getElementById("cvSavedAt");
  cvUploadProgressEl = document.getElementById("cvUploadProgress");
  cvUploadStatusLabelEl = document.getElementById("cvUploadStatusLabel");
  cvUploadStatusHintEl = document.getElementById("cvUploadStatusHint");
  sessionBadgeEl = document.getElementById("sessionBadge");
  cvReadyBadgeEl = document.getElementById("cvReadyBadge");
  cvStepEl = document.getElementById("cvStep");
  jobStepEl = document.getElementById("jobStep");
  jobActionStepEl = document.getElementById("jobActionStep");
  jobDashboardEl = document.getElementById("jobDashboard");
  portalTabsEl = document.getElementById("portalTabs");
  sectionTabsEl = document.getElementById("sectionTabs");
  jobsTabEl = document.getElementById("jobsTab");
  jobsEmptyStateEl = document.getElementById("jobsEmptyState");
  jobsEmptySpinnerEl = document.getElementById("jobsEmptySpinner");
  jobsEmptyProgressEl = document.getElementById("jobsEmptyProgress");
  jobsResultsPanelEl = document.getElementById("jobsResultsPanel");
  jobsListContainerEl = document.getElementById("jobsListContainer");
  trackerTabEl = document.getElementById("trackerTab");
  profileTabEl = document.getElementById("profileTab");
  jobsEl = document.getElementById("jobsList");
  trackerListEl = document.getElementById("trackerList");
  historyListEl = document.getElementById("historyList");
  bestJobTitleEl = document.getElementById("bestJobTitle");
  bestJobMetaEl = document.getElementById("bestJobMeta");
  bestJobLogoShellEl = document.getElementById("bestJobLogoShell");
  bestJobLogoEl = document.getElementById("bestJobLogo");
  bestJobDescriptionEl = document.getElementById("bestJobDescription");
  bestJobScoreEl = document.getElementById("bestJobScore");
  jobPickLoaderEl = document.getElementById("jobPickLoader");
  bestJobTierEl = document.getElementById("bestJobTier");
  bestJobEasyEl = document.getElementById("bestJobEasy");
  bestJobReasonEl = document.getElementById("bestJobReason");
  bestJobCompanyEl = document.getElementById("bestJobCompany");
  bestJobLocationEl = document.getElementById("bestJobLocation");
  bestJobRemoteEl = document.getElementById("bestJobRemote");
  bestJobScoreValueEl = document.getElementById("bestJobScoreValue");
  bestJobScoreRingEl = document.getElementById("bestJobScoreRing");
  bestJobAnalysisEl = document.getElementById("bestJobAnalysis");
  jobsResultCountEl = document.getElementById("jobsResultCount");
  coverLetterBoxEl = document.getElementById("coverLetterBox");
  quickAnswersBoxEl = document.getElementById("quickAnswersBox");
  quickAnswersBoxEl = document.getElementById("quickAnswersBox");
  generateAnswersBtn = document.getElementById("generateAnswersBtn");
  saveProfileBtn = document.getElementById("saveProfileBtn");
  profileRoleEl = document.getElementById("profileRole");
  profileSkillsEl = document.getElementById("profileSkills");
  profileSeniorityEl = document.getElementById("profileSeniority");
  profileRemoteEl = document.getElementById("profileRemote");
   profileName = document.getElementById("profileName");
  profileEmail = document.getElementById("profileEmail");
  profilePhone = document.getElementById("profilePhone");
  profileLocation = document.getElementById("profileLocation");
  profileCity = document.getElementById("profileCity");
  profileState = document.getElementById("profileState");
  profileCountry = document.getElementById("profileCountry");
  profileStats = document.getElementById("profileStats");
  profileCvDetails = document.getElementById("profileCvDetails");
  profileActivityList = document.getElementById("profileActivityList");
  planRemaining = document.getElementById("planRemaining");
  planUsageLabel = document.getElementById("planUsageLabel");
  planUsageTitle = document.getElementById("planUsageTitle");
  planProgressBar = document.getElementById("planProgressBar");
  planCurrentName = document.getElementById("planCurrentName");
  planStatusBadge = document.getElementById("planStatusBadge");
  planStatusCopy = document.getElementById("planStatusCopy");
  planCtaHint = document.getElementById("planCtaHint");
  openPricingBtn = document.getElementById("openPricingBtn");
  closeProfileBtn = document.getElementById("closeProfileBtn");
  backFromProfileBtn = document.getElementById("backFromProfileBtn");
  closeCvsBtn = document.getElementById("closeCvsBtn");
  backFromCvsBtn = document.getElementById("backFromCvsBtn");
  cvsList = document.getElementById("cvsList");
  closeApplicationsBtn = document.getElementById("closeApplicationsBtn");
  backFromApplicationsBtn = document.getElementById("backFromApplicationsBtn");
  applicationsList = document.getElementById("applicationsList");
  closeSearchesBtn = document.getElementById("closeSearchesBtn");
  backFromSearchesBtn = document.getElementById("backFromSearchesBtn");
  searchesList = document.getElementById("searchesList");
  upgradeView = document.getElementById("upgradeView");
  closeUpgradeBtn = document.getElementById("closeUpgradeBtn");
  backFromUpgradeBtn = document.getElementById("backFromUpgradeBtn");
  upgradeNowBtn = document.getElementById("upgradeNowBtn");
  userMenuBtn = document.getElementById("userMenuBtn");
  userMenuPanel = document.getElementById("userMenuPanel");
  closeUserMenuBtn = document.getElementById("closeUserMenuBtn");
  menuProfileBtn = document.getElementById("menuProfileBtn");
  menuCvsBtn = document.getElementById("menuCvsBtn");
  menuApplicationsBtn = document.getElementById("menuApplicationsBtn");
  menuSearchesBtn = document.getElementById("menuSearchesBtn");
  menuLogoutBtn = document.getElementById("menuLogoutBtn");
  menuUserName = document.getElementById("menuUserName");
  menuUserEmail = document.getElementById("menuUserEmail");
  menuUserInitial = document.getElementById("menuUserInitial");
  profileView = document.getElementById("profileView");
  profileResumenTab = document.getElementById("profileResumenTab");
  profileEditarTab = document.getElementById("profileEditarTab");
  profileActividadTab = document.getElementById("profileActividadTab");
  profileActivityList = document.getElementById("profileActivityList");
  profileCvsList = document.getElementById("profileCvsList");
  cvsView = document.getElementById("cvsView");
  applicationsView = document.getElementById("applicationsView");
  searchesView = document.getElementById("searchesView");
  loginBtn = document.getElementById("loginBtn");
  registerBtn = document.getElementById("registerBtn");
  forgotPasswordBtn = document.getElementById("forgotPasswordBtn");
  loginPasswordToggle = document.getElementById("loginPasswordToggle");
  registerPasswordToggle = document.getElementById("registerPasswordToggle");
  logoutBtn = document.getElementById("logoutBtn");
  userNameEl = document.getElementById("userName");
  userEmailEl = document.getElementById("userEmail");
  userInitialEl = document.getElementById("userInitial");
  loginForm = document.getElementById("loginForm");
  registerForm = document.getElementById("registerForm");
  userPanel = document.getElementById("userPanel");
  carouselSection = document.getElementById("carouselSection");
  authError = document.getElementById("authError");
  showRegisterBtn = document.getElementById("showRegisterBtn");
  showLoginBtn = document.getElementById("showLoginBtn");

  const {
    cvText = "",
    cvFileName = "",
    cvUpdatedAt = 0,
    cvStorageMode = "",
    popupViewState = null
  } = await chrome.storage.local.get([
    "cvText",
    "cvFileName",
    "cvUpdatedAt",
    "cvStorageMode",
    "popupViewState"
  ]);
  cvTextEl.value = cvText;
  currentSessionId = (await ensureSessionId());
  currentCvMeta = {
    fileName: cvFileName,
    updatedAt: cvUpdatedAt,
    storageMode: cvStorageMode
  };

  bindEvents();
  renderLanguageFlag();
  renderCvState();
  renderPortalSelection();
  renderPortalHeader();
  await syncActiveTabInfo();
  const { sessionId = "" } = await chrome.storage.local.get(["sessionId"]);
  currentSessionId = sessionId || currentSessionId;
  showLoadingState();
  
  hideAllViews();
  
  auth.onAuthStateChanged(async (user) => {
    if (user) {
      currentUser = user;
      setUserRefs(user.uid);
      await chrome.storage.local.set({ currentUserUid: user.uid });
      
      hideAllViews();
      profileView?.classList.add("hidden");
      
      updateHeaderForUser(user);
      resolveInitialState({ hasCv: Boolean(String(cvTextEl.value || "").trim()) });
      renderView();
      hideAuthLoading();

      await ensureUserBillingProfile();
      await syncLocalStateAfterLogin();
      await restoreLatestCvState();

      const latestCvText = String((await chrome.storage.local.get(["cvText"])).cvText || cvTextEl.value || "").trim();
      const hasCv = Boolean(latestCvText);
      if (latestCvText && cvTextEl.value !== latestCvText) {
        cvTextEl.value = latestCvText;
      }
      renderCvState();
      
      hideAllViews();
      profileView?.classList.add("hidden");
      
      resolveInitialState({ hasCv });
      renderView();

      await chrome.storage.local.set({
        trcvastianUser: {
          email: user.email || "",
          uid: user.uid,
          name: user.displayName || ""
        }
      });
      await persistViewState();
      await resumeFlowAfterOpen();
    } else {
      hideAllViews();
      profileView?.classList.add("hidden");
      headerEl?.classList.add("hidden");
      authSection?.classList.remove("hidden");
      carouselSection?.classList.add("hidden");
      showLogin();
      activeView = "intro";
      currentUser = null;
      currentUserProfile = null;
      clearUserRefs();
      await chrome.storage.local.set({ currentUserUid: null });
      renderView();
      hideAuthLoading();
    }
    
    setupAutoRefreshOnLinkedIn();
    await refreshDashboard();
  });
}

function hideAllViews() {
  introStepEl?.classList.add("hidden");
  cvStepEl?.classList.add("hidden");
  jobStepEl?.classList.add("hidden");
  profileView?.classList.add("hidden");
  userMenuPanel?.classList.add("hidden");
  cvsView?.classList.add("hidden");
  applicationsView?.classList.add("hidden");
  searchesView?.classList.add("hidden");
  upgradeView?.classList.add("hidden");
}

function showLoadingState() {
  bootLoaderEl?.classList.remove("hidden");
  document.body.classList.add("overflow-hidden");
  if (bootLoaderLabelEl) {
    bootLoaderLabelEl.textContent = "Conectando...";
  }
}

function hideAuthLoading() {
  bootLoaderEl?.classList.add("hidden");
  document.body.classList.remove("overflow-hidden");
  if (bootLoaderLabelEl) {
    bootLoaderLabelEl.textContent = "Conectando...";
  }
}

async function performLogout() {
  bootLoaderEl?.classList.remove("hidden");
  document.body.classList.add("overflow-hidden");
  if (bootLoaderLabelEl) {
    bootLoaderLabelEl.textContent = "Cerrando sesión...";
  }

  try {
    await auth.signOut();
    clearUserRefs();
    currentUser = null;
    currentUserProfile = null;
    headerEl?.classList.add("hidden");
    userMenuBtn?.classList.add("hidden");
    await chrome.storage.local.remove("trcvastianUser");
    await chrome.storage.local.set({ currentUserUid: null });
    showLogin();
  } finally {
    hideAuthLoading();
  }
}

function updateHeaderForUser(user) {
  if (!user) {
    headerEl?.classList.add("hidden");
    return;
  }

  headerEl?.classList.remove("hidden");
  authSection?.classList.add("hidden");
  carouselSection?.classList.add("hidden");

  const headerUserName = document.getElementById("headerUserName");
  const headerUserInitial = document.getElementById("headerUserInitial");
  
  if (headerUserName) {
    headerUserName.textContent = user.displayName || user.email?.split("@")[0] || "Usuario";
  }
  if (headerUserInitial) {
    const name = user.displayName || user.email?.split("@")[0] || "U";
    headerUserInitial.textContent = name.charAt(0).toUpperCase();
  }

  const welcomeNameEl = document.getElementById("welcomeUserName");
  if (welcomeNameEl && user.displayName) {
    welcomeNameEl.textContent = user.displayName.split(" ")[0];
  }
}

function bindEvents() {
  cvActionBtn.addEventListener("click", () => cvFileEl.click());
  extractCvBtn.addEventListener("click", () => cvFileEl.click());

  cvFileEl.addEventListener("change", async () => {
    const file = cvFileEl.files?.[0];
    if (!file) return;

    try {
      setCvUploadState({
        visible: true,
        label: "Cargando CV...",
        hint: "Guardando archivo y preparando extracción."
      });
      setStatus("Extrayendo CV...");
      const extractedText = await extractTextFromFile(file);
      setCvUploadState({
        visible: true,
        label: "Procesando CV...",
        hint: "Analizando contenido y actualizando tu perfil."
      });
      const sessionId = await ensureSessionId();
      const fileDataUrl = await encodeFileAsDataUrl(file);
      const profile = deriveProfileFromCv(extractedText);
      const updatedAt = Date.now();
      cvTextEl.value = extractedText;
      currentSessionId = sessionId;
      currentProfile = profile;
      currentCvMeta = {
        fileName: file.name,
        updatedAt,
        storageMode: "local-file"
      };
      await persistCvRecord({
        sessionId,
        cvText: extractedText,
        cvFileName: file.name,
        cvFileType: file.type || inferMimeTypeFromName(file.name),
        cvFileSize: file.size,
        cvFileLastModified: file.lastModified || null,
        cvFileDataUrl: fileDataUrl,
        cvUpdatedAt: updatedAt,
        lastProfile: profile
      });
      renderCvState();
      await refreshDashboard();
      setStatus("CV listo.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "No se pudo leer el CV.");
    } finally {
      setCvUploadState({ visible: false });
    }
  });

  const cvDropZone = document.getElementById("cvDropZone");
  if (cvDropZone) {
    cvDropZone.addEventListener("dragover", (e) => {
      e.preventDefault();
      cvDropZone.classList.add("dragover");
    });

    cvDropZone.addEventListener("dragleave", () => {
      cvDropZone.classList.remove("dragover");
    });

    cvDropZone.addEventListener("drop", async (e) => {
      e.preventDefault();
      cvDropZone.classList.remove("dragover");
      const file = e.dataTransfer?.files?.[0];
      if (!file) return;
      cvFileEl.files = e.dataTransfer.files;
      cvFileEl.dispatchEvent(new Event("change"));
    });

    cvDropZone.addEventListener("click", () => cvFileEl.click());
  }

  skipIntroBtn.addEventListener("click", async () => {
    await closeIntro();
  });

  startIntroBtn.addEventListener("click", async () => {
    await closeIntro();
  });

  if (introDotsEl) {
    for (const dot of introDotsEl.querySelectorAll("[data-dot]")) {
      dot.addEventListener("click", () => {
        const next = Number(dot.getAttribute("data-dot") || 0);
        introIndex = Number.isFinite(next) ? Math.max(0, Math.min(2, next)) : 0;
        renderIntroCarousel();
        restartIntroAutoplay();
      });
    }
  }

  continueBtn.addEventListener("click", async () => {
    if (!cvTextEl.value.trim()) {
      setStatus("Sube tu CV primero.");
      return;
    }

    activeView = "jobs";

    if (isOnLinkedInJobsSearch()) {
      jobStepMode = "dashboard";
    } else {
      jobStepMode = "actions";
    }

    renderView();
    await persistViewState();
    await refreshDashboard();
  });

  backBtn.addEventListener("click", async () => {
    activeView = "cv";
    jobStepMode = "actions";
    renderView();
    await persistViewState();
    setStatus("CV listo.");
  });

  backToCvBtn.addEventListener("click", async () => {
    activeView = "cv";
    jobStepMode = "actions";
    actionSubstep = "actions";
    renderView();
    await persistViewState();
    setStatus("CV listo.");
  });

  if (backToCvBtnTop) {
    backToCvBtnTop.addEventListener("click", async () => {
      activeView = "cv";
      jobStepMode = "actions";
      actionSubstep = "actions";
      renderView();
      await persistViewState();
      setStatus("CV listo.");
    });
  }

  if (backToCvBtnInline) {
    backToCvBtnInline.addEventListener("click", async () => {
      activeView = "cv";
      jobStepMode = "actions";
      actionSubstep = "actions";
      renderView();
      await persistViewState();
      setStatus("CV listo.");
    });
  }

  if (sourceSelectorEl) {
    for (const button of sourceSelectorEl.querySelectorAll("[data-portal-source]")) {
      button.addEventListener("click", async () => {
        const nextPortal = String(button.getAttribute("data-portal-source") || "");
        if (!PORTALS.some((portal) => portal.id === nextPortal) || !ENABLED_PORTAL_IDS.includes(nextPortal)) {
          return;
        }

        activePortal = nextPortal;
        selectedJob = null;
        renderPortalSelection();
        renderPortalHeader();
        renderRecommendations();
        renderTracker();
        renderHistory();
        await persistViewState();
        setStatus(`${portalLabel(activePortal)} seleccionado.`);
      });
    }
  }

  if (improveCvBtn) {
    improveCvBtn.addEventListener("click", async () => {
      if (!cvTextEl.value.trim()) {
        setStatus("Sube tu CV primero.");
        return;
      }

      actionSubstep = "improve-cv";
      renderImproveCvPanel();
      await persistViewState();
      setStatus("CV analizado. Revisa detalles y mejoras.");
    });
  }

  if (continueToJobsBtn) {
    continueToJobsBtn.addEventListener("click", async () => {
      activePortal = "linkedin";
      jobStepMode = "dashboard";
      actionSubstep = "actions";
      renderView();
      await persistViewState();

      if (isOnLinkedInJobsSearch()) {
        await syncActiveTabInfo();
        await refreshDashboard();
        setStatus("Vacantes de LinkedIn cargadas.");
        return;
      }

      await autoOpenActivePortal();
    });
  }


  if (backToActionsBtn) {
    backToActionsBtn.addEventListener("click", async () => {
      actionSubstep = "actions";
      renderImproveCvPanel();
      await persistViewState();
      setStatus("Vuelve al flujo de búsqueda.");
    });
  }

  if (magicImproveBtn) {
    magicImproveBtn.addEventListener("click", async () => {
      actionSubstep = "improve-cv";
      isMagicLoading = true;
      renderImproveCvPanel();
      setStatus("Mejorando CV...");

      await new Promise((resolve) => setTimeout(resolve, 900));

      renderImproveCvPanel({ regenerate: true });
      isMagicLoading = false;
      renderImproveCvPanel();
      await persistViewState();
      setStatus("CV mejorado listo para guardar o descargar.");
    });
  }

  if (saveImprovedCvBtn) {
    saveImprovedCvBtn.addEventListener("click", async () => {
      const nextCvText = String(improvedCvTextEl?.value || "").trim();
      if (!nextCvText) {
        setStatus("Primero genera o edita el CV mejorado.");
        return;
      }

      const profile = deriveProfileFromCv(nextCvText);
      const updatedAt = Date.now();
      cvTextEl.value = nextCvText;
      improvedCvDraft = nextCvText;
      currentProfile = profile;
      currentCvMeta = {
        fileName: (currentCvMeta?.fileName || "cv-mejorado.txt").replace(/\.[a-z0-9]+$/i, "") + "-mejorado.txt",
        updatedAt,
        storageMode: "local-text"
      };

      await chrome.storage.local.set({
        cvText: nextCvText,
        cvUpdatedAt: updatedAt,
        cvFileName: currentCvMeta.fileName,
        cvStorageMode: "local-text",
        lastProfile: profile
      });
      await syncCurrentCvToFirebase({
        id: `${currentCvMeta.fileName}-${updatedAt}`,
        sessionId: currentSessionId,
        cvText: nextCvText,
        cvFileName: currentCvMeta.fileName,
        cvFileType: "text/plain",
        cvFileSize: nextCvText.length,
        cvFileLastModified: updatedAt,
        cvFileDataUrl: "",
        cvUpdatedAt: updatedAt,
        cvStorageMode: "local-text",
        lastProfile: profile
      });

      renderCvState();
      renderImproveCvPanel();
      await persistViewState();
      showSaveSuccess();
      setStatus("CV guardado y reemplazado correctamente.");
    });
  }

  if (downloadImprovedPdfBtn) {
    downloadImprovedPdfBtn.addEventListener("click", async () => {
      const nextCvText = String(improvedCvTextEl?.value || "").trim();
      if (!nextCvText) {
        setStatus("No hay contenido para descargar.");
        return;
      }

      downloadCvAsPdf(nextCvText, currentCvMeta?.fileName || "cv-mejorado");
      setStatus("PDF descargado.");
    });
  }

  const handleOpenSearch = async () => {
    if (!activeTabInfo?.id) {
      setStatus("No hay pestaña activa.");
      return;
    }

    try {
      setStatus(`Abriendo ${portalLabel(activePortal)}...`);
      const response = await chrome.runtime.sendMessage({
        type: "OPEN_LINKEDIN_SEARCH",
        tabId: activeTabInfo.id,
        portalId: activePortal
      });

      if (!response?.success) {
        throw new Error(response?.reason || "No se pudo abrir el portal.");
      }

      currentProfile = response.result?.profile || currentProfile;
      fillProfileForm(currentProfile);
      setStatus(`${portalLabel(activePortal)} abierto. Esperando resultados...`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "No se pudo abrir el portal.");
    }
  };

  openSearchBtn.addEventListener("click", handleOpenSearch);
  if (openSearchEmptyBtn) {
    openSearchEmptyBtn.addEventListener("click", handleOpenSearch);
  }

  applyBtn.addEventListener("click", async () => {
    const currentApplications = await getMergedApplications();
    const currentUsage = getPlanUsageStatus(currentApplications.length);
    if (currentUsage.blocked) {
      showUpgradeView();
      await openPricingPage();
      return;
    }

    if (!activeTabInfo?.id) {
      setStatus("No hay pestaña activa.");
      return;
    }

    const currentViewJobUrl = isConcreteLinkedInJobUrl(activeTabInfo?.url) ? String(activeTabInfo.url) : "";
    const applicationUrl = currentViewJobUrl || selectedJob?.url || "";

    if (!applicationUrl) {
      setStatus("Abre un portal y espera recomendaciones.");
      return;
    }

    try {
      await ensurePlanCanApply();
      
      const steps = [
        { status: "Analizando vacante...", delay: 400 },
        { status: "Detectando formulario...", delay: 600 },
        { status: "Completando campos...", delay: 800 },
        { status: "Validando datos...", delay: 400 },
        { status: "Preparando aplicación...", delay: 300 }
      ];
      
      for (const step of steps) {
        setStatus(step.status);
        await new Promise(r => setTimeout(r, step.delay));
      }
      
      const response = await chrome.runtime.sendMessage({
        type: "APPLICATION_FLOW_REQUEST",
        tabId: activeTabInfo.id,
        jobUrl: applicationUrl
      });

      if (!response?.success) {
        throw new Error(response?.reason || "No se pudo postular.");
      }

      const mode = response.result?.mode || "";
      const submitted = Boolean(response.result?.submitted);
      const validationErrors = Number(response.result?.validationErrors || 0);
      const filledFields = Array.isArray(response.result?.filled) ? response.result.filled.length : 0;
      const score = response.result?.score?.ratio || 0;

      setStatus(`✓ Completado: ${filledFields} campos, ${score}% listo${validationErrors ? `, ${validationErrors} errores` : ""}`);
      
      if (submitted) {
        await saveJobStatus("applied");
        setStatus("✅ Solicitud enviada automáticamente!");
      } else if (mode === "external_autofill") {
        await saveJobStatus("review");
        setStatus("✅ Formulario externo completado. Revisa y envía.");
      } else if (mode === "easy_apply" || mode === "internal_apply") {
        await saveJobStatus("review");
        setStatus("✅ Apply abierto y campos completados. Revisa y envía.");
      } else {
        await saveJobStatus("review");
        setStatus("✅ Formulario completado. Revisa y envía.");
      }
    } catch (error) {
      setStatus("❌ " + (error instanceof Error ? error.message : "No se pudo postular."));
    }
  });

  if (batchApplyDropdownEl && batchApplyCountEl && batchApplyCountDisplayEl) {
    batchApplyDropdownEl.addEventListener("click", () => {
      batchApplyCountEl.click();
    });
    batchApplyCountEl.addEventListener("change", () => {
      const value = batchApplyCountEl.value;
      batchApplyCountDisplayEl.textContent = `${value} vacante${value !== '1' ? 's' : ''}`;
    });
  }

  if (batchApplyBtn) {
    batchApplyBtn.addEventListener("click", async () => {
      const currentApplications = await getMergedApplications();
      const currentUsage = getPlanUsageStatus(currentApplications.length);
      if (currentUsage.blocked) {
        showUpgradeView();
        await openPricingPage();
        return;
      }

      if (isBatchApplying) {
        setStatus("Ya hay un lote de postulaciones en curso.");
        return;
      }

      if (!activeTabInfo?.id) {
        setStatus("No hay pestaña activa.");
        return;
      }

      const requestedCount = Math.max(1, Number(batchApplyCountEl?.value || 3));
      const batchJobs = buildAutoApplyQueue(jobs, requestedCount, selectedJob);

      if (!batchJobs.length) {
        setStatus("No encontré vacantes Easy Apply para lanzar el modo automático.");
        return;
      }

      try {
        const usage = await ensurePlanCanApply();
        const availableSlots = Math.max(usage.remaining, 0);
        const cappedBatchJobs = batchJobs.slice(0, availableSlots);

        if (!cappedBatchJobs.length) {
          throw new Error(`Tu plan ${usage.plan.name} no tiene postulaciones disponibles ahora mismo.`);
        }

        isBatchApplying = true;
        renderRecommendations();
        setStatus(`🚀 Iniciando lote con ${cappedBatchJobs.length} vacantes...`);

        const batchStatusUpdates = [
          { progress: 0.1, status: "Preparando lote..." },
          { progress: 0.2, status: "Analizando vacantes..." },
          { progress: 0.4, status: "Completando formularios..." },
          { progress: 0.6, status: "Validando aplicaciones..." },
          { progress: 0.8, status: "Finalizando..." }
        ];

        let statusIndex = 0;
        const statusInterval = setInterval(() => {
          if (statusIndex < batchStatusUpdates.length) {
            setStatus(batchStatusUpdates[statusIndex].status);
            statusIndex++;
          }
        }, 1500);

        const response = await chrome.runtime.sendMessage({
          type: "BATCH_APPLY_REQUEST",
          tabId: activeTabInfo.id,
          jobs: cappedBatchJobs
        });

        clearInterval(statusInterval);

        if (!response?.success) {
          throw new Error(response?.reason || "No se pudo ejecutar el lote.");
        }

        const applied = Number(response.result?.appliedCount || 0);
        const failed = Number(response.result?.failedCount || 0);
        const skipped = Number(response.result?.skippedCount || 0);

        await refreshDashboard();
        setStatus(`✅ Lote finalizado! Aplicadas: ${applied}, fallidas: ${failed}, omitidas: ${skipped}.`);
      } catch (error) {
        setStatus("❌ " + (error instanceof Error ? error.message : "No se pudo ejecutar el lote."));
      } finally {
        isBatchApplying = false;
        renderRecommendations();
      }
    });
  }

  if (generateAnswersBtn) {
    generateAnswersBtn.addEventListener("click", async () => {
      if (!selectedJob) {
        setStatus("Selecciona una vacante primero.");
        return;
      }

      try {
        const response = await chrome.runtime.sendMessage({
          type: "GENERATE_APPLICATION_MATERIAL",
          job: selectedJob
        });

        if (!response?.success) {
          throw new Error(response?.reason || "No se pudo generar material.");
        }

        if (coverLetterBoxEl) coverLetterBoxEl.value = response.result.coverLetter || "";
        if (quickAnswersBoxEl) quickAnswersBoxEl.value = (response.result.quickAnswers || []).join("\n\n");
        setStatus("Material generado.");
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "No se pudo generar material.");
      }
    });
  }

  if (saveProfileBtn && profileRoleEl && profileSkillsEl && profileSeniorityEl && profileLocation && profileRemoteEl) {
    saveProfileBtn.addEventListener("click", async () => {
      try {
        const response = await chrome.runtime.sendMessage({
          type: "SAVE_PROFILE_OVERRIDES",
          profile: {
            role: profileRoleEl.value,
            skills: profileSkillsEl.value,
            seniority: profileSeniorityEl.value,
            preferredLocation: profileLocation.value,
            city: profileCity?.value || "",
            state: profileState?.value || "",
            country: profileCountry?.value || "",
            remotePreference: profileRemoteEl.value
          }
        });

        if (!response?.success) {
          throw new Error(response?.reason || "No se pudo guardar el perfil.");
        }

        currentProfile = response.result;
        fillProfileForm(currentProfile);
        setStatus("Perfil guardado.");
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "No se pudo guardar el perfil.");
      }
    });
  }

  for (const tabBtn of document.querySelectorAll("[data-profile-tab]")) {
    tabBtn.addEventListener("click", () => {
      const tabName = tabBtn.getAttribute("data-profile-tab");
      switchProfileTab(tabName);
    });
  }
}

function switchProfileTab(tabName) {
  const tabs = ["resumen", "editar", "actividad"];
  
  for (const tab of tabs) {
    const content = document.getElementById(`profile${tab.charAt(0).toUpperCase() + tab.slice(1)}Tab`);
    if (content) {
      content.classList.toggle("hidden", tab !== tabName);
    }
  }
  
  for (const btn of document.querySelectorAll("[data-profile-tab]")) {
    const isActive = btn.getAttribute("data-profile-tab") === tabName;
    if (isActive) {
      btn.classList.remove("text-[#4d6570]", "hover:text-[#071e27]");
      btn.classList.add("bg-[#0f5d86]", "text-white");
    } else {
      btn.classList.remove("bg-[#0f5d86]", "text-white");
      btn.classList.add("text-[#4d6570]", "hover:text-[#071e27]");
    }
  }
}

async function refreshDashboard() {
  if (!cvTextEl.value.trim()) return;
  await syncActiveTabInfo();
  await Promise.all([loadProfileData(), loadRecommendations(), loadTrackerData()]);
}

function getCvUpdatedAtValue(item = {}) {
  if (typeof item?.cvUpdatedAt === "number") {
    return item.cvUpdatedAt;
  }

  if (typeof item?.updatedAt?.toDate === "function") {
    return item.updatedAt.toDate().getTime();
  }

  if (typeof item?.updatedAt?.seconds === "number") {
    return item.updatedAt.seconds * 1000;
  }

  if (typeof item?.createdAt?.toDate === "function") {
    return item.createdAt.toDate().getTime();
  }

  if (typeof item?.createdAt?.seconds === "number") {
    return item.createdAt.seconds * 1000;
  }

  return 0;
}

async function restoreLatestCvState() {
  const localData = await chrome.storage.local.get([
    "cvText",
    "cvFileName",
    "cvFileType",
    "cvFileSize",
    "cvFileLastModified",
    "cvFileDataUrl",
    "cvUpdatedAt",
    "cvStorageMode",
    "lastProfile"
  ]);

  const localUpdatedAt = Number(localData.cvUpdatedAt || 0);
  const remoteCvs = await loadUserCvs();
  const latestRemoteCv = remoteCvs[0] || null;
  const remoteUpdatedAt = getCvUpdatedAtValue(latestRemoteCv || {});
  const shouldUseRemote = Boolean(
    latestRemoteCv?.cvText &&
    (!localData.cvText || remoteUpdatedAt >= localUpdatedAt)
  );

  if (!shouldUseRemote) {
    if (localData.cvText) {
      cvTextEl.value = String(localData.cvText || "");
      currentCvMeta = {
        fileName: localData.cvFileName || currentCvMeta?.fileName || "CV",
        updatedAt: localUpdatedAt || currentCvMeta?.updatedAt || 0,
        storageMode: localData.cvStorageMode || currentCvMeta?.storageMode || "local-file"
      };
      currentProfile = localData.lastProfile || currentProfile;
    }
    return;
  }

  const nextProfile = latestRemoteCv.profile || localData.lastProfile || null;
  cvTextEl.value = String(latestRemoteCv.cvText || "");
  currentCvMeta = {
    fileName: latestRemoteCv.cvFileName || latestRemoteCv.fileName || "CV",
    updatedAt: remoteUpdatedAt || Date.now(),
    storageMode: latestRemoteCv.storageMode || "local-file"
  };
  currentProfile = nextProfile;

  await chrome.storage.local.set({
    cvText: cvTextEl.value,
    cvFileName: currentCvMeta.fileName,
    cvFileType: latestRemoteCv.cvFileType || "",
    cvFileSize: latestRemoteCv.cvFileSize || 0,
    cvFileLastModified: latestRemoteCv.cvFileLastModified || null,
    cvFileDataUrl: latestRemoteCv.cvFileDataUrl || "",
    cvUpdatedAt: currentCvMeta.updatedAt,
    cvStorageMode: currentCvMeta.storageMode,
    lastProfile: nextProfile
  });
}

async function loadProfileData() {
  const response = await chrome.runtime.sendMessage({ type: "GET_PROFILE_DATA" });
  if (!response?.success) return;

  currentProfile = response.result.profile || null;
  searchHistory = response.result.searchHistory || [];
  fillProfileForm(currentProfile);
  renderHistory();
}

async function loadRecommendations() {
  if (!activeTabInfo?.id || !cvTextEl.value.trim()) return;

  try {
    const response = await chrome.runtime.sendMessage({
      type: "GET_RECOMMENDED_JOBS_FOR_TAB",
      tabId: activeTabInfo.id
    });

    if (!response?.success) {
      jobs = [];
      selectedJob = null;
      renderRecommendations();
      return;
    }

    currentProfile = response.result?.profile || currentProfile;
    jobs = (response.result?.recommendations || [])
      .filter((job) => matchesPortal(job.url, activePortal))
      .sort((a, b) => {
        const scoreDiff = Number(b?.score || 0) - Number(a?.score || 0);
        if (scoreDiff !== 0) return scoreDiff;
        if (Boolean(b?.easyApply) !== Boolean(a?.easyApply)) {
          return Number(Boolean(b?.easyApply)) - Number(Boolean(a?.easyApply));
        }
        return String(a?.title || "").localeCompare(String(b?.title || ""));
      })
      .slice(0, 20);
    selectedJob = jobs[0] || null;
    fillProfileForm(currentProfile);
    renderRecommendations();
  } catch {
    jobs = [];
    selectedJob = null;
    renderRecommendations();
  }
}

async function loadTrackerData() {
  const response = await chrome.runtime.sendMessage({ type: "GET_TRACKER_DATA" });
  if (!response?.success) return;

  tracker = response.result.tracker || [];
  searchHistory = response.result.searchHistory || searchHistory;
  currentProfile = response.result.profile || currentProfile;
  renderTracker();
  renderHistory();
}

async function saveJobStatus(status) {
  if (!selectedJob) {
    setStatus("Selecciona una vacante primero.");
    return;
  }

  const response = await chrome.runtime.sendMessage({
    type: "SET_JOB_STATUS",
    job: selectedJob,
    status
  });

  if (!response?.success) {
    setStatus(response?.reason || "No se pudo guardar el estado.");
    return;
  }

  tracker = response.result || [];
  renderTracker();
  setStatus(`Estado guardado: ${status}.`);
}

function renderCvState() {
  const hasCv = Boolean(cvTextEl.value.trim());
  const preview = cvTextEl.value.trim();

  if (cvActionBtn) {
    cvActionBtn.textContent = hasCv ? "Replace CV" : "Upload CV";
  }
  if (cvReadyBadgeEl) {
    cvReadyBadgeEl.classList.toggle("hidden", !hasCv);
  }
  continueBtn.disabled = !hasCv;
  continueBtn.classList.toggle("cv-continue-btn-disabled", !hasCv);
  if (cvFileNameEl) {
    cvFileNameEl.textContent = hasCv ? currentCvMeta?.fileName || "CV guardado" : "Selecciona tu CV";
    cvFileNameEl.classList.toggle("hidden", !hasCv);
  }
  if (cvStorageHintEl) {
    cvStorageHintEl.textContent = hasCv
      ? currentCvMeta?.storageMode === "local-text"
        ? "Texto guardado."
        : "Guardado localmente."
      : "PDF, DOCX, TXT, MD";
  }
  if (cvExtractionStateEl) cvExtractionStateEl.textContent = hasCv ? "Listo" : "Pendiente";
  const extractionBar = document.getElementById("cvExtractionBar");
  const extractionHint = document.getElementById("cvExtractionHint");
  if (extractionBar) extractionBar.style.width = hasCv ? "100%" : "0%";
  if (extractionHint) extractionHint.textContent = hasCv ? "Completado" : "Aún no iniciado";
  if (cvPreviewEl) cvPreviewEl.textContent = preview ? `${preview.slice(0, 38)}${preview.length > 38 ? "..." : ""}` : "Aún no hay texto cargado.";
  const previewHint = document.getElementById("cvPreviewHint");
  if (previewHint) previewHint.textContent = hasCv ? "CV cargado y listo." : "Tu CV aparecerá aquí después de la extracción.";
  if (cvSavedAtEl) {
    cvSavedAtEl.textContent = hasCv && currentCvMeta?.updatedAt
      ? `Guardado ${formatSavedAt(currentCvMeta.updatedAt)}`
      : "Nada guardado todavía.";
  }
  if (sessionBadgeEl) sessionBadgeEl.textContent = currentSessionId ? shortSessionId(currentSessionId) : "---";
}

function renderView() {
  const showIntro = activeView === "intro";
  const showCv = activeView === "cv";
  const showJobs = activeView === "jobs";
  const showResultsScroll = showJobs && jobStepMode === "dashboard";
  const showImproveScroll = showJobs && jobStepMode === "actions" && actionSubstep === "improve-cv";

  introStepEl.classList.toggle("hidden", !showIntro);
  cvStepEl.classList.toggle("hidden", !showCv);
  jobStepEl.classList.toggle("hidden", !showJobs);
  userMenuPanel?.classList.add("hidden");
  profileView?.classList.add("hidden");
  cvsView?.classList.add("hidden");
  applicationsView?.classList.add("hidden");
  searchesView?.classList.add("hidden");
  upgradeView?.classList.add("hidden");
  if (jobActionStepEl && jobDashboardEl) {
    jobActionStepEl.classList.toggle("hidden", !showJobs || jobStepMode !== "actions");
    jobDashboardEl.classList.toggle("hidden", !showJobs || jobStepMode !== "dashboard");
  }
  document.body.classList.toggle("results-scroll-mode", showResultsScroll);
  document.body.classList.toggle("cv-improve-scroll-mode", showImproveScroll);

  if (showJobs && jobStepMode === "actions") {
    renderImproveCvPanel();
  }

  renderPortalSelection();
  renderPortalHeader();

  if (jobActionStepEl) {
    jobActionStepEl.classList.toggle("improve-scroll-active", showJobs && jobStepMode === "actions" && actionSubstep === "improve-cv");
  }

  if (backToCvBtn) {
    backToCvBtn.classList.toggle("hidden", showJobs && jobStepMode === "actions" && actionSubstep === "improve-cv");
  }

  if (showIntro) {
    setStatus("Conoce cómo funciona TRCVASTIAN.");
    return;
  }

  clearInterval(introInterval);
}

function renderIntroCarousel() {
  const slides = introCarouselEl ? Array.from(introCarouselEl.querySelectorAll(".intro-slide")) : [];
  const dots = introDotsEl ? Array.from(introDotsEl.querySelectorAll(".intro-dot")) : [];

  for (const slide of slides) {
    const index = Number(slide.getAttribute("data-slide") || -1);
    slide.classList.toggle("active", index === introIndex);
  }

  for (const dot of dots) {
    const index = Number(dot.getAttribute("data-dot") || -1);
    dot.classList.toggle("active", index === introIndex);
  }
}

function renderLanguageFlag() {
  if (!languageFlagEl) return;

  const locale = (chrome.i18n?.getUILanguage?.() || navigator.language || "es").toLowerCase();
  const isSpanish = locale.startsWith("es");
  languageFlagEl.textContent = isSpanish ? "🇪🇸 ES" : "🇺🇸 EN";
  languageFlagEl.setAttribute("aria-label", isSpanish ? "Idioma español" : "English language");
}

function renderPortalSelection() {
  if (!sourceSelectorEl) return;

  for (const button of sourceSelectorEl.querySelectorAll("[data-portal-source]")) {
    const portalId = String(button.getAttribute("data-portal-source") || "");
    const isEnabled = ENABLED_PORTAL_IDS.includes(portalId);
    button.disabled = !isEnabled;
    button.classList.toggle("source-card-disabled", !isEnabled);
    button.classList.toggle("source-card-active", portalId === activePortal);
  }

  if (continueToJobsBtn) {
    const textNode = continueToJobsBtn.querySelector("span:first-child");
    if (textNode) {
      textNode.textContent = "Iniciar búsqueda con IA";
    }
  }
}

function renderPortalHeader() {
  if (activePortalLabelEl) {
    activePortalLabelEl.textContent = portalLabel(activePortal);
  }

  if (openSearchBtn) {
    const textNode = openSearchBtn.querySelector("span:last-child");
    if (textNode) {
      textNode.textContent = activePortal === "linkedin" ? "Buscar" : `Abrir ${portalLabel(activePortal)}`;
    }
  }

  if (openSearchEmptyBtn) {
    const textNode = openSearchEmptyBtn.querySelector("span:last-child");
    if (textNode) {
      textNode.textContent = activePortal === "linkedin" ? "Buscar" : `Abrir ${portalLabel(activePortal)}`;
    }
  }

  if (!activePortalIconEl) return;

  activePortalIconEl.className = activePortal === "linkedin" ? "brand-icon linkedin-brand" : "brand-icon";
  activePortalIconEl.innerHTML = portalIconMarkup(activePortal);
}

async function ensureSessionId() {
  const { sessionId = "" } = await chrome.storage.local.get(["sessionId"]);
  if (sessionId) {
    return sessionId;
  }

  const nextSessionId = globalThis.crypto?.randomUUID?.() || `session-${Date.now()}`;
  await chrome.storage.local.set({ sessionId: nextSessionId });
  return nextSessionId;
}

async function syncActiveTabInfo() {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    activeTabInfo = tabs?.[0] || null;
  } catch {
    activeTabInfo = null;
  }
  return activeTabInfo;
}

async function encodeFileAsDataUrl(file) {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(new Error("No se pudo guardar el archivo localmente."));
    reader.readAsDataURL(file);
  });
}

async function persistCvRecord(record) {
  try {
    await chrome.storage.local.set({
      ...record,
      cvStorageMode: "local-file"
    });
    if (currentCvMeta) {
      currentCvMeta.storageMode = "local-file";
    }
  } catch {
    await chrome.storage.local.set({
      sessionId: record.sessionId,
      cvText: record.cvText,
      cvFileName: record.cvFileName,
      cvFileType: record.cvFileType,
      cvFileSize: record.cvFileSize,
      cvFileLastModified: record.cvFileLastModified,
      cvUpdatedAt: record.cvUpdatedAt,
      lastProfile: record.lastProfile,
      cvStorageMode: "local-text"
    });
    if (currentCvMeta) {
      currentCvMeta.storageMode = "local-text";
    }
  }

  await syncCurrentCvToFirebase({
    ...record,
    cvStorageMode: currentCvMeta?.storageMode || "local-file"
  });
}

function setCvUploadState({ visible, label = "", hint = "" }) {
  if (!cvUploadProgressEl) {
    return;
  }

  cvUploadProgressEl.classList.toggle("hidden", !visible);

  if (cvUploadStatusLabelEl && label) {
    cvUploadStatusLabelEl.textContent = label;
  }

  if (cvUploadStatusHintEl && hint) {
    cvUploadStatusHintEl.textContent = hint;
  }

  if (extractCvBtn) {
    extractCvBtn.disabled = visible;
    extractCvBtn.classList.toggle("opacity-60", visible);
    extractCvBtn.classList.toggle("pointer-events-none", visible);
  }
}

function shortSessionId(value) {
  return String(value || "").slice(0, 8).toUpperCase();
}

function formatSavedAt(timestamp) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    }).format(new Date(timestamp));
  } catch {
    return "recientemente";
  }
}

function inferMimeTypeFromName(fileName) {
  const extension = String(fileName || "").split(".").pop()?.toLowerCase() || "";
  if (extension === "pdf") return "application/pdf";
  if (extension === "docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (extension === "txt") return "text/plain";
  if (extension === "md") return "text/markdown";
  return "application/octet-stream";
}

function startIntroAutoplay() {
  clearInterval(introInterval);

  if (activeView !== "intro") {
    return;
  }

  introInterval = setInterval(() => {
    introIndex = (introIndex + 1) % 3;
    renderIntroCarousel();
  }, 2600);
}

function restartIntroAutoplay() {
  startIntroAutoplay();
}

async function closeIntro() {
  clearInterval(introInterval);
  await chrome.storage.local.set({ introSeenVersion: 1 });
  carouselSection.classList.add("hidden");
  updateHeaderForUser(currentUser);
  activeView = "cv";
  renderView();
  await persistViewState();
  setStatus("Sube tu CV primero.");
}

async function readIntroSeen() {
  const { introSeenVersion = 0 } = await chrome.storage.local.get(["introSeenVersion"]);
  const INTRO_VERSION = 1;
  return Number(introSeenVersion) >= INTRO_VERSION;
}

function renderImproveCvPanel(options = {}) {
  if (!jobActionButtonsEl || !cvImprovePanelEl || !improvedCvTextEl) {
    return;
  }

  const showImprove = actionSubstep === "improve-cv";
  jobActionButtonsEl.classList.toggle("hidden", showImprove);
  cvImprovePanelEl.classList.toggle("hidden", !showImprove);

  if (!showImprove) {
    return;
  }

  if (magicLoaderEl) {
    magicLoaderEl.classList.toggle("hidden", !isMagicLoading);
  }

  if (magicImproveBtn) {
    magicImproveBtn.disabled = isMagicLoading;
    magicImproveBtn.classList.toggle("opacity-60", isMagicLoading);
  }

  if (options.regenerate) {
    const cvText = String(cvTextEl.value || "").trim();
    const profile = deriveProfileFromCv(cvText);
    const sections = buildCvSections(cvText);
    const improvements = buildCvImprovements({ cvText, profile, sections, regenerate: true });
    improvedCvDraft = buildImprovedCvDraft({ originalCv: cvText, profile, improvements, regenerate: true });
  }

  if (!improvedCvDraft) {
    const cvText = String(cvTextEl.value || "").trim();
    const profile = deriveProfileFromCv(cvText);
    const sections = buildCvSections(cvText);
    const improvements = buildCvImprovements({ cvText, profile, sections, regenerate: false });
    improvedCvDraft = buildImprovedCvDraft({ originalCv: cvText, profile, improvements, regenerate: false });
  }

  const keepUserEdits = String(improvedCvTextEl.value || "").trim();
  improvedCvTextEl.value = keepUserEdits && !options.regenerate ? keepUserEdits : improvedCvDraft;
}

function buildCvSections(cvText) {
  const normalized = String(cvText || "").toLowerCase();
  const detected = [];

  if (/experien|experience|trabaj|work/.test(normalized)) detected.push("Experiencia");
  if (/skill|habilidad|stack|tecnolog/.test(normalized)) detected.push("Skills");
  if (/education|educaci|universidad|bootcamp/.test(normalized)) detected.push("Educación");
  if (/project|proyecto|portfolio/.test(normalized)) detected.push("Proyectos");
  if (/certif|curso|course/.test(normalized)) detected.push("Certificaciones");

  if (!detected.length) {
    detected.push("Perfil general");
  }

  return { detected };
}

function buildCvImprovements({ cvText, profile, sections, regenerate }) {
  const base = [];
  const role = profile.role || "tu rol objetivo";
  const topSkills = (profile.skills || []).slice(0, 3);
  const skillsLine = topSkills.length ? topSkills.join(", ") : "stack principal";

  base.push({
    title: "Titular profesional",
    before: "Perfil con descripción genérica.",
    after: `Frontend directo para recruiters: \"${role} | ${skillsLine}\".`
  });

  base.push({
    title: "Logros medibles",
    before: "Experiencia listada sin impacto numérico.",
    after: "Agregar 2-3 métricas por rol (ej. +25% conversión, -30% tiempos)."
  });

  base.push({
    title: "Sección skills",
    before: "Skills mezcladas sin prioridad.",
    after: `Ordenar por relevancia para LinkedIn: ${skillsLine}.`
  });

  if (!sections.detected.includes("Proyectos")) {
    base.push({
      title: "Proyectos clave",
      before: "No hay proyectos visibles.",
      after: "Incluir 2 proyectos con contexto, stack y resultado de negocio."
    });
  }

  if (!/english|ingles|b2|c1|c2/.test(String(cvText || "").toLowerCase())) {
    base.push({
      title: "Idioma",
      before: "No se comunica nivel de inglés.",
      after: "Añadir nivel de inglés y contexto de uso profesional."
    });
  }

  if (regenerate) {
    base.push({
      title: "Versión ATS",
      before: "Formato posiblemente no optimizado para ATS.",
      after: "Crear versión ATS: texto limpio, títulos claros y keywords del rol objetivo."
    });
  }

  return base.slice(0, 6);
}

function buildImprovedCvDraft({ originalCv, profile, improvements, regenerate }) {
  const role = profile.role || "Software Engineer";
  const skills = (profile.skills || []).slice(0, 8);
  const seniority = profile.seniority || "mid";
  const location = profile.preferredLocation || "Remote";
  const mode = profile.remotePreference || "remote";

  const strongSummary = [
    `${role} ${seniority} con experiencia construyendo productos web de alto impacto.`,
    `Especializado en ${skills.slice(0, 4).join(", ") || "tecnologías modernas"}, con foco en resultados medibles y calidad de entrega.`,
    `Disponible para trabajo ${mode} en ${location}.`
  ].join(" ");

  const actionLines = improvements.map((item) => `- ${item.after}`).join("\n");
  const baseExperience = extractTopLinesByKeyword(originalCv, /(experience|experiencia|work|trabaj)/i, 4);
  const baseProjects = extractTopLinesByKeyword(originalCv, /(project|proyecto|portfolio)/i, 3);

  return [
    role.toUpperCase(),
    "",
    "RESUMEN PROFESIONAL",
    strongSummary,
    "",
    "SKILLS CLAVE",
    skills.length ? skills.join(" | ") : "JavaScript | TypeScript | React | APIs | Git",
    "",
    "EXPERIENCIA DESTACADA",
    baseExperience || "- Define 2-3 experiencias con logros cuantificables (impacto %, ahorro, velocidad).",
    "",
    "PROYECTOS",
    baseProjects || "- Incluye 2 proyectos con contexto, stack y resultado de negocio.",
    "",
    "MEJORAS APLICADAS",
    actionLines || "- CV optimizado para claridad y mejor match en LinkedIn.",
    "",
    regenerate ? "NOTA: Versión regenerada con varita mágica." : "NOTA: Versión optimizada desde tu CV actual."
  ].join("\n");
}

function extractTopLinesByKeyword(text, pattern, limit) {
  const lines = String(text || "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  const matched = lines.filter((line) => pattern.test(line));
  const source = matched.length ? matched : lines;

  return source.slice(0, limit).map((line) => `- ${line}`).join("\n");
}

function downloadCvAsPdf(content, filenameBase) {
  const safeBase = String(filenameBase || "cv-mejorado")
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[^a-z0-9-_]+/gi, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase() || "cv-mejorado";

  const pdfBytes = buildSimplePdf(content);
  const blob = new Blob([pdfBytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${safeBase}.pdf`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
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
    streamLines.push("(CV Mejorado) Tj");
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

function renderRecommendations() {
  const hasJobs = jobs.length > 0;
  const localApplicationCount = Array.isArray(tracker) ? tracker.filter((item) => String(item.status || "").trim() === "applied").length : 0;
  const usage = getPlanUsageStatus(localApplicationCount);

  if (jobsEmptyStateEl && jobsResultsPanelEl) {
    jobsEmptyStateEl.classList.toggle("hidden", hasJobs);
    jobsResultsPanelEl.classList.toggle("hidden", !hasJobs);
  }

  const emptyState = getEmptyStateDetails();
  const emptyCopy = emptyState.copy;
  const emptyTitleEl = jobsEmptyStateEl?.querySelector("p.title-display");
  const emptyDescriptionEl = jobsEmptyStateEl?.querySelector("p.label-ui");
  if (emptyTitleEl) {
    emptyTitleEl.textContent = emptyState.title;
  }
  if (emptyDescriptionEl) {
    emptyDescriptionEl.textContent = emptyCopy;
  }
  if (jobsEmptySpinnerEl) {
    jobsEmptySpinnerEl.classList.toggle("hidden", emptyState.mode === "linkedin-searching");
  }
  if (jobsEmptyProgressEl) {
    jobsEmptyProgressEl.classList.toggle("hidden", emptyState.mode !== "linkedin-searching");
  }
  if (jobsListContainerEl) {
    jobsListContainerEl.classList.toggle("hidden", !hasJobs);
  }

  if (jobsResultCountEl) {
    jobsResultCountEl.textContent = `${jobs.length} resultado${jobs.length !== 1 ? "s" : ""}`;
  }

  if (selectedJob || hasJobs) {
    const bestJob = selectedJob || jobs[0];
    selectedJob = bestJob;
  }

  if (!selectedJob) {
    bestJobTitleEl.textContent = "Aún no hay una vacante seleccionada";
    if (bestJobCompanyEl) bestJobCompanyEl.textContent = "Abre LinkedIn Jobs";
    if (bestJobLocationEl) bestJobLocationEl.textContent = "Veremos las mejores opciones aquí";
    if (bestJobDescriptionEl) {
      bestJobDescriptionEl.textContent = "Cuando carguen resultados, te mostraremos la mejor opción primero.";
    }
    if (bestJobLogoShellEl && bestJobLogoEl) {
      bestJobLogoShellEl.classList.add("hidden");
      bestJobLogoEl.removeAttribute("src");
    }
    if (bestJobScoreValueEl) bestJobScoreValueEl.textContent = "--";
    if (bestJobScoreRingEl) {
      const circumference = 2 * Math.PI * 42;
      bestJobScoreRingEl.style.strokeDashoffset = circumference;
    }
    if (bestJobAnalysisEl) {
      bestJobAnalysisEl.innerHTML = `
        <div class="job-analysis-item">
          <svg viewBox="0 0 24 24" fill="none" class="w-4 h-4">
            <circle cx="12" cy="12" r="10" fill="#94a3b8"/>
            <path d="M8 12h8" stroke="white" stroke-width="2" stroke-linecap="round"/>
          </svg>
          <span>Esperando resultados de LinkedIn</span>
        </div>
      `;
    }
    bestJobTierEl.innerHTML = '<span>•</span><span>Sin selección</span>';
    bestJobTierEl.className = "job-tier-badge";
    applyBtn.disabled = true;
    applyBtn.classList.add("opacity-50", "pointer-events-none");
    if (batchApplyBtn) {
      batchApplyBtn.disabled = true;
      batchApplyBtn.classList.add("opacity-50", "pointer-events-none");
    }
    if (jobsEl) jobsEl.innerHTML = "";
    return;
  }

  bestJobTitleEl.textContent = selectedJob.title || "Vacante";
  if (bestJobCompanyEl) bestJobCompanyEl.textContent = selectedJob.company || "";
  if (bestJobLocationEl) bestJobLocationEl.textContent = selectedJob.location || "";
  if (bestJobDescriptionEl) {
    bestJobDescriptionEl.textContent = trimUiText(
      selectedJob.description || selectedJob.explanation?.summary || shortJobReason(selectedJob),
      180
    );
  }
  if (bestJobLogoShellEl && bestJobLogoEl) {
    const logoUrl = String(selectedJob.companyLogoUrl || "").trim();
    if (logoUrl) {
      bestJobLogoEl.src = logoUrl;
      bestJobLogoShellEl.classList.remove("hidden");
    } else {
      bestJobLogoShellEl.classList.add("hidden");
      bestJobLogoEl.removeAttribute("src");
    }
  }
  const score = selectedJob.score || 0;
  if (bestJobScoreValueEl) bestJobScoreValueEl.textContent = `${score}%`;
  if (bestJobScoreRingEl) {
    const circumference = 2 * Math.PI * 42;
    const offset = circumference - (score / 100) * circumference;
    bestJobScoreRingEl.style.strokeDashoffset = offset;
  }

  if (jobPickLoaderEl) {
    jobPickLoaderEl.classList.toggle("hidden", !isPickingJob);
  }
  
  const tierLabels = { top: "Top Match", good: "Good Fit", medium: "Medium", weak: "Weak" };
  const tierEmojis = { top: "🔥", good: "✨", medium: "•", weak: "•" };
  bestJobTierEl.innerHTML = `<span>${tierEmojis[selectedJob.tier] || "•"}</span><span>${tierLabels[selectedJob.tier] || "Sin nivel"}</span>`;
  bestJobTierEl.className = `job-tier-badge ${selectedJob.tier === "top" ? "job-tier-badge-top" : ""}`;

  if (bestJobAnalysisEl) {
    bestJobAnalysisEl.innerHTML = `
      <div class="job-analysis-item">
        <svg viewBox="0 0 24 24" fill="none" class="w-4 h-4">
          <circle cx="12" cy="12" r="10" fill="#22c55e"/>
          <path d="M8 12l3 3 5-5" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <span>${shortJobReason(selectedJob)}</span>
      </div>
    `;
  }

  const applyDisabled = !selectedJob.url || isPickingJob;
  applyBtn.disabled = applyDisabled;
  applyBtn.classList.toggle("opacity-50", applyDisabled);
  applyBtn.classList.toggle("pointer-events-none", applyDisabled);

  if (batchApplyBtn) {
    const requestedCount = Math.max(1, Number(batchApplyCountEl?.value || 3));
    const eligibleBatchJobs = buildAutoApplyQueue(jobs, requestedCount, selectedJob);
    const batchDisabled = isPickingJob || isBatchApplying || (!eligibleBatchJobs.length && !usage.blocked);
    batchApplyBtn.classList.remove("hidden");
    batchApplyBtn.disabled = batchDisabled;
    batchApplyBtn.classList.toggle("opacity-50", batchDisabled);
    batchApplyBtn.classList.toggle("pointer-events-none", batchDisabled);
  }

  if (!jobsEl) {
    return;
  }

  jobsEl.innerHTML = jobs
    .slice(0, 20)
    .map((job, index) => {
      const isSelected = selectedJob?.id === job.id;
      const score = Number(job.score || 0);
      return `
        <button type="button" data-job-id="${escapeHtml(job.id)}" class="job-item ${isSelected ? "job-item-active" : ""}">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <span class="text-[11px] font-semibold ${isSelected ? "job-meta-active" : "job-meta"}">#${index + 1}</span>
                <span class="title-display truncate text-[14px] font-semibold">${escapeHtml(job.title || "Vacante")}</span>
              </div>
              <div class="mt-1 text-[11px] ${isSelected ? "job-meta-active" : "job-meta"}">
                ${escapeHtml([job.company, job.location].filter(Boolean).join(" · ") || "Sin empresa")}
              </div>
              <div class="mt-2 text-[11px] ${isSelected ? "job-meta-active" : "job-meta"}">
                ${escapeHtml(job.easyApply ? "Easy Apply" : "Postulación externa")}
              </div>
            </div>
            <div class="shrink-0 text-right">
              <div class="text-[13px] font-semibold ${isSelected ? "job-meta-active" : ""}">${score}%</div>
              <div class="mt-2 inline-flex gap-2">
                <span type="button" data-open-job-id="${escapeHtml(job.id)}" class="job-inline-btn ${isSelected ? "job-inline-btn-active" : ""}">Ver</span>
                <span type="button" data-apply-job-id="${escapeHtml(job.id)}" class="job-inline-btn job-inline-btn-primary">Postular</span>
              </div>
            </div>
          </div>
        </button>
      `;
    })
    .join("");

  for (const button of jobsEl.querySelectorAll("[data-job-id]")) {
    button.addEventListener("click", async () => {
      const jobId = button.getAttribute("data-job-id");
      const manualPick = jobs.find((job) => job.id === jobId) || null;
      if (!manualPick) return;

      isPickingJob = true;
      if (jobPickLoaderEl) jobPickLoaderEl.classList.remove("hidden");
      setStatus("Seleccionando vacante...");

      await new Promise((resolve) => setTimeout(resolve, 250));

      selectedJob = manualPick;
      isPickingJob = false;
      if (jobPickLoaderEl) jobPickLoaderEl.classList.add("hidden");
      renderRecommendations();
      setStatus("Vacante lista.");
    });
  }

  for (const button of jobsEl.querySelectorAll("[data-open-job-id]")) {
    button.addEventListener("click", async (event) => {
      event.stopPropagation();
      const jobId = button.getAttribute("data-open-job-id");
      const job = jobs.find((item) => item.id === jobId);
      if (!job?.url || !activeTabInfo?.id) return;

      selectedJob = job;
      renderRecommendations();
      activeTabInfo = await chrome.tabs.update(activeTabInfo.id, { url: job.url });
      setStatus("Vacante abierta.");
    });
  }

  for (const button of jobsEl.querySelectorAll("[data-apply-job-id]")) {
    button.addEventListener("click", async (event) => {
      event.stopPropagation();
      const jobId = button.getAttribute("data-apply-job-id");
      const job = jobs.find((item) => item.id === jobId);
      if (!job) return;

      selectedJob = job;
      renderRecommendations();
      applyBtn.click();
    });
  }
}

function buildAutoApplyQueue(jobList = [], requestedCount = 1, preferredJob = null) {
  const easyApplyJobs = (Array.isArray(jobList) ? jobList : [])
    .filter((job) => matchesPortal(job.url, "linkedin"))
    .filter((job) => Boolean(job.easyApply));

  const strongMatches = easyApplyJobs.filter((job) => Number(job.score || 0) >= 68);
  const pool = strongMatches.length ? strongMatches : easyApplyJobs;
  const ordered = [];
  const seen = new Set();

  const addJob = (job) => {
    if (!job) {
      return;
    }
    const key = String(job.id || job.url || "");
    if (!key || seen.has(key)) {
      return;
    }
    seen.add(key);
    ordered.push(job);
  };

  if (preferredJob && matchesPortal(preferredJob.url, "linkedin") && preferredJob.easyApply) {
    addJob(preferredJob);
  }

  for (const job of pool) {
    addJob(job);
  }

  return ordered.slice(0, Math.max(1, requestedCount));
}

function matchPillClass(tier) {
  if (tier === "top") return "match-pill-top";
  if (tier === "good") return "match-pill-good";
  if (tier === "medium") return "match-pill-medium";
  return "match-pill-low";
}

function renderTracker() {
  if (!trackerListEl) return;
  const trackerJobs = tracker.filter((job) => matchesPortal(job.url, activePortal));
  trackerListEl.innerHTML = trackerJobs.length
    ? trackerJobs
        .map(
          (job) => `
          <div class="paper-card">
            <div class="flex items-start justify-between gap-3">
              <div>
                <div class="title-display text-sm font-semibold text-[#071e27]">${escapeHtml(job.title || "Vacante")}</div>
                <div class="mt-1 text-xs text-[#4d6570]">${escapeHtml([job.company, job.location].filter(Boolean).join(" · "))}</div>
              </div>
              <div class="pulse-badge">${escapeHtml(job.status || "saved")}</div>
            </div>
          </div>
        `
        )
        .join("")
    : '<div class="paper-card"><p class="label-ui text-xs">Aún no guardaste vacantes.</p></div>';
}

function renderHistory() {
  if (!historyListEl) return;
  const filtered = searchHistory.filter((item) => item.portalId === activePortal).slice(0, 6);
  historyListEl.innerHTML = filtered.length
    ? filtered
        .map(
          (item) => `
          <div class="paper-card p-3">
            <div class="title-display text-sm font-semibold text-[#071e27]">${escapeHtml(item.role || "Búsqueda")}</div>
            <div class="mt-1 text-xs text-[#4d6570]">${escapeHtml((item.keywords || []).join(", "))}</div>
          </div>
        `
        )
        .join("")
    : '<div class="paper-card p-3"><p class="label-ui text-xs">Sin historial para este portal.</p></div>';
}

function fillProfileForm(profile) {
  if (!profile || !profileRoleEl) return;
  profileRoleEl.value = profile.role || "";
  profileSkillsEl.value = Array.isArray(profile.skills) ? profile.skills.join(", ") : "";
  profileSeniorityEl.value = profile.seniority || "";
  profileLocation.value = profile.preferredLocation || profile.location || "";
  profileRemoteEl.value = profile.remotePreference || "";
  if (profileCity) {
    profileCity.value = profile.city || "";
  }
  if (profileState) {
    profileState.value = profile.state || profile.province || "";
  }
  if (profileCountry) {
    profileCountry.value = profile.country || "";
  }
}

async function loadCvSnapshot() {
  const { cvText = "", profileOverrides = {} } = await chrome.storage.local.get(["cvText", "profileOverrides"]);
  if (!String(cvText || "").trim()) {
    return null;
  }

  return extractCvProfileSnapshot(cvText, profileOverrides);
}

function mergeProfileSources(profile = null, cvSnapshot = null) {
  return {
    ...(cvSnapshot || {}),
    ...(profile || {}),
    name: String(profile?.name || cvSnapshot?.fullName || "").trim(),
    fullName: String(cvSnapshot?.fullName || profile?.name || "").trim(),
    email: String(cvSnapshot?.email || currentUser?.email || "").trim(),
    phone: String(profile?.phone || cvSnapshot?.phone || "").trim(),
    location: String(profile?.preferredLocation || profile?.location || cvSnapshot?.location || cvSnapshot?.preferredLocation || "").trim(),
    city: String(profile?.city || cvSnapshot?.city || "").trim(),
    state: String(profile?.state || cvSnapshot?.state || cvSnapshot?.province || "").trim(),
    country: String(profile?.country || cvSnapshot?.country || "").trim(),
    role: String(cvSnapshot?.role || profile?.role || "").trim(),
    seniority: String(cvSnapshot?.seniority || profile?.seniority || "").trim(),
    remotePreference: String(profile?.remotePreference || cvSnapshot?.remotePreference || "").trim(),
    preferredLocation: String(profile?.preferredLocation || cvSnapshot?.preferredLocation || cvSnapshot?.location || profile?.location || "").trim(),
    skills: Array.isArray(profile?.skills) ? profile.skills : (Array.isArray(cvSnapshot?.skills) ? cvSnapshot.skills : [])
  };
}

function renderProfileCvDetails(cvSnapshot, mergedProfile) {
  if (!profileCvDetails) return;

  if (!cvSnapshot) {
    profileCvDetails.innerHTML = '<p class="text-sm text-[#4d6570] text-center py-2">Sube un CV para ver todos los campos extraídos aquí.</p>';
    return;
  }

  const identityItems = [
    { label: "Nombre", value: mergedProfile.fullName || mergedProfile.name },
    { label: "Email", value: mergedProfile.email },
    { label: "Teléfono", value: mergedProfile.phone },
    { label: "País", value: mergedProfile.country },
    { label: "Ubicación", value: mergedProfile.location },
    { label: "Ciudad", value: cvSnapshot.city },
    { label: "Rol", value: cvSnapshot.role },
    { label: "Seniority", value: cvSnapshot.seniority },
    { label: "Remoto", value: cvSnapshot.remotePreference },
    { label: "LinkedIn", value: cvSnapshot.linkedin },
    { label: "GitHub", value: cvSnapshot.github },
    { label: "Portfolio", value: cvSnapshot.portfolio || cvSnapshot.website }
  ].filter((item) => String(item.value || "").trim());

  const sections = [
    buildCvDetailSection("Identidad", identityItems),
    buildCvDetailSection("Skills", (cvSnapshot.skills || []).map((value) => ({ label: "Skill", value })), { pills: true }),
    buildCvDetailSection("Educación", (cvSnapshot.education || []).map((value) => ({ label: "Item", value }))),
    buildCvDetailSection("Experiencia", (cvSnapshot.experience || []).map((value) => ({ label: "Item", value }))),
    buildCvDetailSection("Certificaciones", (cvSnapshot.certifications || []).map((value) => ({ label: "Item", value }))),
    buildCvDetailSection("Idiomas", (cvSnapshot.languages || []).map((value) => ({ label: "Item", value }))),
    cvSnapshot.summary
      ? `
        <div class="rounded-2xl bg-[#f7fbfe] px-3 py-3 shadow-[inset_0_0_0_1px_rgba(193,199,209,0.18)]">
          <p class="label-ui text-[10px] uppercase tracking-[0.18em] text-[#6b7f88]">Resumen</p>
          <p class="mt-2 text-[12px] leading-5 text-[#213842]">${escapeHtml(cvSnapshot.summary)}</p>
        </div>
      `
      : ""
  ].filter(Boolean);

  profileCvDetails.innerHTML = sections.join("");
}

function buildCvDetailSection(title, items, options = {}) {
  const rows = Array.isArray(items) ? items.filter((item) => String(item?.value || "").trim()) : [];
  if (!rows.length) {
    return "";
  }

  if (options.pills) {
    return `
      <div class="rounded-2xl bg-[#f7fbfe] px-3 py-3 shadow-[inset_0_0_0_1px_rgba(193,199,209,0.18)]">
        <p class="label-ui text-[10px] uppercase tracking-[0.18em] text-[#6b7f88]">${escapeHtml(title)}</p>
        <div class="mt-2 flex flex-wrap gap-2">
          ${rows.map((item) => `<span class="soft-pill">${escapeHtml(item.value)}</span>`).join("")}
        </div>
      </div>
    `;
  }

  return `
    <div class="rounded-2xl bg-[#f7fbfe] px-3 py-3 shadow-[inset_0_0_0_1px_rgba(193,199,209,0.18)]">
      <p class="label-ui text-[10px] uppercase tracking-[0.18em] text-[#6b7f88]">${escapeHtml(title)}</p>
      <div class="mt-2 space-y-2">
        ${rows.map((item) => `
          <div class="rounded-xl bg-white px-3 py-2 shadow-[inset_0_0_0_1px_rgba(193,199,209,0.14)]">
            ${item.label !== "Item" ? `<p class="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#78909b]">${escapeHtml(item.label)}</p>` : ""}
            <p class="text-[12px] leading-5 text-[#213842]">${escapeHtml(item.value)}</p>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

function portalLabel(portalId) {
  return PORTALS.find((portal) => portal.id === portalId)?.label || portalId;
}

function matchesPortal(url, portalId) {
  const value = String(url || "");
  if (!value) return portalId === "linkedin";
  if (portalId === "linkedin") return value.includes("linkedin.com");
  if (portalId === "getonboard") return value.includes("getonbrd.com") || value.includes("getonboard");
  if (portalId === "computrabajo") return value.includes("computrabajo.");
  if (portalId === "bumeran") return value.includes("bumeran.");
  if (portalId === "laborum") return value.includes("laborum.");
  if (portalId === "elempleo") return value.includes("elempleo.");
  if (portalId === "indeed") return value.includes("indeed.");
  if (portalId === "glassdoor") return value.includes("glassdoor.");
  if (portalId === "wellfound") return value.includes("wellfound.");
  if (portalId === "remoteok") return value.includes("remoteok.com");
  if (portalId === "weworkremotely") return value.includes("weworkremotely.com");
  if (portalId === "torre") return value.includes("torre.ai");
  if (portalId === "jooble") return value.includes("jooble.");
  return true;
}

function setStatus(message) {
  const normalized = String(message || "");
  if (/ya uso \d+ postulaciones|no tiene postulaciones disponibles/i.test(normalized)) {
    statusEl.textContent = `${normalized} Revisa tus planes para seguir este mes.`;
    return;
  }
  if (/Pago esta pendiente|suscripcion fue cancelada|plan expiro/i.test(normalized)) {
    statusEl.textContent = `${normalized} Puedes resolverlo desde pricing.`;
    return;
  }
  statusEl.textContent = normalized;
}

function showSaveSuccess() {
  if (!saveSuccessEl) return;
  saveSuccessEl.classList.remove("hidden");
  setTimeout(() => {
    saveSuccessEl.classList.add("hidden");
  }, 1800);
}

function restoreViewState(savedState, { hasCv }) {
  if (!savedState || typeof savedState !== "object") {
    return;
  }

  const nextView = String(savedState.activeView || "");
  const nextMode = String(savedState.jobStepMode || "");
  const nextPortal = String(savedState.activePortal || "");
  const nextSection = String(savedState.activeSection || "");

  if (nextView === "jobs" && hasCv) {
    activeView = "jobs";
  } else if (nextView === "cv") {
    activeView = "cv";
  }

  if (nextMode === "actions" || nextMode === "dashboard") {
    jobStepMode = nextMode;
  }

  if (PORTALS.some((portal) => portal.id === nextPortal)) {
    activePortal = nextPortal;
  }

  if (!ENABLED_PORTAL_IDS.includes(activePortal)) {
    activePortal = "linkedin";
  }

  if (nextSection === "jobs" || nextSection === "tracker" || nextSection === "profile") {
    activeSection = nextSection;
  }

  actionSubstep = "actions";
}

function resolveInitialState({ hasCv }) {
  if (!hasCv) {
    activeView = "cv";
    jobStepMode = "actions";
    return;
  }

  if (isOnLinkedInJobsSearch()) {
    activeView = "jobs";
    jobStepMode = "dashboard";
    return;
  }

  if (isOnLinkedInHost()) {
    activeView = "jobs";
    jobStepMode = "dashboard";
    return;
  }

  activeView = "jobs";
  jobStepMode = "actions";
}

async function resumeFlowAfterOpen() {
  if (!currentUser) {
    return;
  }

  await syncActiveTabInfo();

  if (activeView !== "jobs") {
    return;
  }

  if (jobStepMode === "actions") {
    setStatus(`Retomando ${portalLabel(activePortal)}.`);
    return;
  }

  const currentUrl = String(activeTabInfo?.url || "");
  const isPortalReady = matchesPortal(currentUrl, activePortal);

  if (isOnLinkedInJobsSearch()) {
    jobStepMode = "dashboard";
    await refreshDashboard();
    return;
  }

  if (!isPortalReady) {
    jobStepMode = "actions";
    renderView();
    await persistViewState();
    setStatus(`Selecciona ${portalLabel(activePortal)} para continuar.`);
    return;
  }

  await refreshDashboard();
}

async function persistViewState() {
  await chrome.storage.local.set({
    popupViewState: {
      activeView,
      jobStepMode,
      activePortal,
      activeSection,
      actionSubstep,
      updatedAt: Date.now()
    }
  });
}

async function autoOpenActivePortal() {
  if (isAutoOpeningPortal || !currentUser) {
    return;
  }

  if (!ENABLED_PORTAL_IDS.includes(activePortal)) {
    activePortal = "linkedin";
  }

  await syncActiveTabInfo();
  if (!activeTabInfo?.id) {
    setStatus("No encontré una pestaña activa para abrir el portal.");
    return;
  }

  const currentUrl = String(activeTabInfo?.url || "");

  if (activePortal === "linkedin" && isOnLinkedInJobsSearch()) {
    await refreshDashboard();
    setStatus("Ya estás en LinkedIn Jobs. Cargando resultados...");
    return;
  }

  if (activePortal === "linkedin" && isOnLinkedInHost()) {
    await refreshDashboard();
    setStatus("LinkedIn detectado. Navega a Jobs para ver resultados.");
    return;
  }

  try {
    isAutoOpeningPortal = true;
    setStatus(`Abriendo ${portalLabel(activePortal)} automáticamente...`);
    const response = await chrome.runtime.sendMessage({
      type: "OPEN_LINKEDIN_SEARCH",
      tabId: activeTabInfo.id,
      portalId: activePortal
    });

    if (!response?.success) {
      throw new Error(response?.reason || "No se pudo abrir el portal.");
    }

    await syncActiveTabInfo();
    currentProfile = response.result?.profile || currentProfile;
    fillProfileForm(currentProfile);
    await refreshDashboard();
    setStatus(`${portalLabel(activePortal)} abierto. Retomando tu flujo.`);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "No se pudo abrir el portal.");
  } finally {
    isAutoOpeningPortal = false;
  }
}

function setupAutoRefreshOnLinkedIn() {
  if (activePortal !== "linkedin") {
    return;
  }

  const onTabUpdated = async (tabId, changeInfo, tab) => {
    if (!activeTabInfo?.id || tabId !== activeTabInfo.id) {
      return;
    }

    if (changeInfo.status !== "complete") {
      return;
    }

    const url = String(tab?.url || "");
    if (!url.includes("linkedin.com/jobs")) {
      return;
    }

    activeTabInfo = tab;

    if (activeView === "jobs") {
      if (isOnLinkedInJobsSearch() && jobStepMode !== "dashboard") {
        jobStepMode = "dashboard";
        renderView();
        await persistViewState();
      }

      await refreshDashboard();
      await persistViewState();
      setStatus("Resultados actualizados en LinkedIn.");
    }
  };

  chrome.tabs.onUpdated.addListener(onTabUpdated);
}

function emptyStateCopy() {
  return getEmptyStateDetails().copy;
}

function getEmptyStateDetails() {
  const url = String(activeTabInfo?.url || "");

  if (activePortal === "linkedin" && url.includes("linkedin.com") && !/linkedin\.com\/jobs\/(search|view)/.test(url)) {
    return {
      mode: "linkedin-searching",
      title: "Buscando vacantes",
      copy: "Ve a Jobs en LinkedIn y encontraremos ofertas para ti."
    };
  }

  if (activePortal === "linkedin") {
    return {
      mode: "waiting",
      title: "Esperando búsqueda",
      copy: "Abre LinkedIn o entra a un job para cargar resultados."
    };
  }

  return {
    mode: "waiting",
    title: "Esperando búsqueda",
    copy: `Abre ${portalLabel(activePortal)} para empezar.`
  };
}

function portalIconMarkup(portalId) {
  if (portalId === "linkedin") {
    return `
      <svg viewBox="0 0 24 24" fill="none">
        <rect x="2" y="2" width="20" height="20" rx="5" fill="#0A66C2"></rect>
        <path d="M8.06 10.03H5.65V18.1H8.06V10.03Z" fill="white"></path>
        <path d="M6.85 6.12C6.08 6.12 5.46 6.74 5.46 7.5C5.46 8.26 6.08 8.88 6.85 8.88C7.61 8.88 8.23 8.26 8.23 7.5C8.23 6.74 7.61 6.12 6.85 6.12Z" fill="white"></path>
        <path d="M18.54 13.33C18.54 10.86 17.22 9.71 15.46 9.71C14.04 9.71 13.4 10.49 13.05 11.03V10.03H10.74C10.77 10.69 10.74 18.1 10.74 18.1H13.05V13.59C13.05 13.35 13.07 13.11 13.14 12.94C13.33 12.45 13.77 11.95 14.5 11.95C15.46 11.95 15.84 12.68 15.84 13.75V18.1H18.15V13.33H18.54Z" fill="white"></path>
      </svg>
    `;
  }

  if (portalId === "getonboard") return `<span class="source-brand source-brand-getonboard"><span class="source-favicon">go</span><span class="source-logotype">GOB</span></span>`;
  if (portalId === "computrabajo") return `<span class="source-brand source-brand-computrabajo"><span class="source-favicon">cb</span><span class="source-logotype">CT</span></span>`;
  if (portalId === "bumeran") return `<span class="source-brand source-brand-bumeran"><span class="source-favicon">b</span><span class="source-logotype">BUM</span></span>`;
  if (portalId === "laborum") return `<span class="source-brand source-brand-laborum"><span class="source-favicon">lb</span><span class="source-logotype">LAB</span></span>`;
  if (portalId === "elempleo") return `<span class="source-brand source-brand-elempleo"><span class="source-favicon">e</span><span class="source-logotype">EMP</span></span>`;
  if (portalId === "indeed") return `<span class="source-brand source-brand-indeed"><span class="source-favicon">i</span><span class="source-logotype">ID</span></span>`;
  if (portalId === "glassdoor") return `<span class="source-brand source-brand-glassdoor"><span class="source-favicon">g</span><span class="source-logotype">GD</span></span>`;
  if (portalId === "wellfound") return `<span class="source-brand source-brand-wellfound"><span class="source-favicon">w</span><span class="source-logotype">WF</span></span>`;
  if (portalId === "remoteok") return `<span class="source-brand source-brand-remoteok"><span class="source-favicon">ok</span><span class="source-logotype">ROK</span></span>`;
  if (portalId === "weworkremotely") return `<span class="source-brand source-brand-weworkremotely"><span class="source-favicon">ww</span><span class="source-logotype">WWR</span></span>`;
  if (portalId === "torre") return `<span class="source-brand source-brand-torre"><span class="source-favicon">t</span><span class="source-logotype">TOR</span></span>`;
  if (portalId === "jooble") return `<span class="source-brand source-brand-jooble"><span class="source-favicon">j</span><span class="source-logotype">JBL</span></span>`;
  return `<span class="source-card-mark">${escapeHtml(portalLabel(portalId).slice(0, 2).toUpperCase())}</span>`;
}

function buildShortLinkedInAnalysis(job) {
  const tierText = job?.tier === "top" ? "alto" : job?.tier === "good" ? "bueno" : job?.tier === "medium" ? "medio" : "bajo";
  const scoreText = job?.score ? `${job.score}%` : "--";
  const company = String(job?.company || "empresa").trim();
  return `Análisis corto: ${company}, match ${scoreText}, ajuste ${tierText}.`;
}

function shortJobReason(job) {
  if (!job) {
    return "Selecciona una vacante para ver el ajuste.";
  }

  if (job.tier === "top") {
    return "Buen match. Abre la vacante y postula.";
  }

  if (job.tier === "good") {
    return "Ajuste bueno. Vale la pena revisar y postular.";
  }

  if (job.tier === "medium") {
    return "Ajuste medio. Revisa requisitos antes de postular.";
  }

  return "Ajuste bajo. Postula solo si te interesa mucho.";
}

function compactUrl(value) {
  return String(value || "").replace(/^https?:\/\//, "").slice(0, 42);
}

function trimUiText(value, maxLength) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) {
    return "";
  }
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength - 1)}…`;
}

function stripHash(value) {
  return String(value || "").split("#")[0];
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function describeActivity(item) {
  const type = String(item?.type || "");
  const jobTitle = item?.jobTitle || item?.role || item?.fileName || "Actividad";

  if (type === "cv_uploaded") {
    return `CV sincronizado: ${jobTitle}`;
  }
  if (type === "profile_updated" || type === "account_profile_updated") {
    return `Perfil actualizado${item?.role ? ` para ${item.role}` : ""}`;
  }
  if (type === "search_opened") {
    return `Búsqueda abierta en ${item?.portalLabel || item?.portalId || "portal"}${item?.role ? `: ${item.role}` : ""}`;
  }
  if (type === "application_recorded" || type === "manual_application_recorded") {
    return `Postulación registrada: ${item?.jobTitle || "Vacante"}${item?.company ? ` en ${item.company}` : ""}`;
  }
  if (type === "job_status_changed") {
    return `Estado actualizado: ${item?.jobTitle || "Vacante"} (${item?.status || "guardado"})`;
  }

  return String(jobTitle);
}

// Firebase Auth

function showAuthError(msg) {
  console.error("TRCVASTIAN Auth Error:", msg);
  if (!authError) {
    setStatus(msg);
    return;
  }
  authError.textContent = msg;
  authError.classList.remove("hidden");
  setTimeout(() => authError.classList.add("hidden"), 4000);
}

function showLogin() {
  console.log("TRCVASTIAN: Showing login form");
  hideAuthLoading();
  headerEl?.classList.add("hidden");
  authSection?.classList.remove("hidden");
  carouselSection?.classList.add("hidden");
  loginForm?.classList.remove("hidden");
  registerForm?.classList.add("hidden");
  userPanel?.classList.add("hidden");
}

function showRegister() {
  console.log("TRCVASTIAN: Showing register form");
  hideAuthLoading();
  headerEl?.classList.add("hidden");
  authSection?.classList.remove("hidden");
  carouselSection?.classList.add("hidden");
  loginForm?.classList.add("hidden");
  registerForm?.classList.remove("hidden");
  userPanel?.classList.add("hidden");
}

function showUserPanel(user) {
  hideAuthLoading();
  loginForm?.classList.add("hidden");
  registerForm?.classList.add("hidden");
  userPanel?.classList.remove("hidden");
  if (userNameEl) userNameEl.textContent = user.displayName || "Usuario";
  if (userEmailEl) userEmailEl.textContent = user.email || "";
  if (userInitialEl) userInitialEl.textContent = (user.displayName || user.email || "U")[0].toUpperCase();
}

function bindPasswordToggle(toggle, input) {
  if (!toggle || !input) {
    return;
  }

  toggle.addEventListener("click", () => {
    const nextType = input.type === "password" ? "text" : "password";
    input.type = nextType;
    toggle.setAttribute("aria-label", nextType === "password" ? "Mostrar contraseña" : "Ocultar contraseña");
  });
}

function showCarousel() {
  if (currentUser) {
    updateHeaderForUser(currentUser);
  }
  carouselSection?.classList.remove("hidden");
  authSection?.classList.add("hidden");
  
  const welcomeNameEl = document.getElementById("welcomeUserName");
  if (welcomeNameEl && currentUser?.displayName) {
    welcomeNameEl.textContent = currentUser.displayName.split(" ")[0];
  }
}

showRegisterBtn?.addEventListener("click", () => {
  console.log("TRCVASTIAN: Register button clicked");
  showRegister();
});
showLoginBtn?.addEventListener("click", () => {
  console.log("TRCVASTIAN: Login button clicked");
  showLogin();
});
forgotPasswordBtn?.addEventListener("click", () => {
  showAuthError("Recuperación de contraseña disponible próximamente. Por ahora crea una cuenta nueva o reactívala desde soporte.");
});
bindPasswordToggle(loginPasswordToggle, document.getElementById("loginPassword"));
bindPasswordToggle(registerPasswordToggle, document.getElementById("registerPassword"));

loginBtn?.addEventListener("click", async () => {
  console.log("TRCVASTIAN: Login submit clicked");
  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;
  if (!email || !password) {
    showAuthError("Completa email y contraseña");
    return;
  }
  loginBtn.disabled = true;
  loginBtn.textContent = "Cargando...";
  try {
    console.log("TRCVASTIAN: Signing in with", email);
    const userCredential = await auth.signInWithEmailAndPassword(email, password);
    console.log("TRCVASTIAN: Signed in", userCredential.user);
    currentUser = userCredential.user;
    setUserRefs(userCredential.user.uid);
    showUserPanel(userCredential.user);
    updateHeaderForUser(userCredential.user);
    await chrome.storage.local.set({ trcvastianUser: { email: userCredential.user.email, uid: userCredential.user.uid } });
  } catch (error) {
    console.error("TRCVASTIAN: Login error", error);
    showAuthError(error.message || "Error al iniciar sesión");
  }
  loginBtn.disabled = false;
  loginBtn.textContent = "Entrar";
});

registerBtn?.addEventListener("click", async () => {
  console.log("TRCVASTIAN: Register submit clicked");
  const name = document.getElementById("registerName").value.trim();
  const email = document.getElementById("registerEmail").value.trim();
  const password = document.getElementById("registerPassword").value;
  if (!name || !email || !password) {
    showAuthError("Completa todos los campos");
    return;
  }
  if (password.length < 6) {
    showAuthError("La contraseña debe tener al menos 6 caracteres");
    return;
  }
  registerBtn.disabled = true;
  registerBtn.textContent = "Cargando...";
  try {
    console.log("TRCVASTIAN: Creating account with", email, name);
    const userCredential = await auth.createUserWithEmailAndPassword(email, password);
    console.log("TRCVASTIAN: Account created", userCredential.user);
    await userCredential.user.updateProfile({ displayName: name });
    currentUser = userCredential.user;
    setUserRefs(userCredential.user.uid);
    showUserPanel(userCredential.user);
    updateHeaderForUser(userCredential.user);
    await chrome.storage.local.set({ trcvastianUser: { email: userCredential.user.email, uid: userCredential.user.uid, name } });
  } catch (error) {
    console.error("TRCVASTIAN: Register error", error);
    showAuthError(error.message || "Error al crear cuenta");
  }
  registerBtn.disabled = false;
  registerBtn.textContent = "Crear cuenta";
});

logoutBtn?.addEventListener("click", async () => {
  await performLogout();
});





function getCurrentPlanConfig() {
  const planId = String(currentUserProfile?.subscriptionPlan || "freemium").trim().toLowerCase();
  return PLAN_CATALOG[planId] || PLAN_CATALOG.freemium;
}

function getRecommendedUpgradePlan(planId) {
  if (planId === "freemium") return PLAN_CATALOG.basic;
  if (planId === "basic") return PLAN_CATALOG.improved;
  if (planId === "improved") return PLAN_CATALOG.advanced;
  if (planId === "advanced") return PLAN_CATALOG.star;
  if (planId === "star") return PLAN_CATALOG.diamond;
  if (planId === "diamond") return PLAN_CATALOG.ultra;
  return PLAN_CATALOG.ultra;
}

function getPlanUsageStatus(applicationCount) {
  const plan = getCurrentPlanConfig();
  const quota = Number(plan.applicationQuota || 0);
  const used = Math.max(0, Number(applicationCount || 0));
  const remaining = Math.max(quota - used, 0);
  const status = String(currentUserProfile?.planStatus || currentUserProfile?.subscriptionStatus || "trial").trim().toLowerCase();
  const statusAllowed = ["trial", "active", "grace"].includes(status);
  const blocked = quota > 0 ? used >= quota || !statusAllowed : !statusAllowed;

  return {
    plan,
    status,
    quota,
    used,
    remaining,
    blocked,
    usagePercent: quota > 0 ? Math.min((used / quota) * 100, 100) : 0
  };
}

async function openPricingPage() {
  try {
    await chrome.tabs.create({ url: PRICING_URL });
  } catch {
    window.open(PRICING_URL, "_blank");
  }
}

function showView(view) {
  introStepEl.classList.add("hidden");
  cvStepEl.classList.add("hidden");
  jobStepEl.classList.add("hidden");
  userMenuPanel.classList.add("hidden");
  profileView.classList.add("hidden");
  cvsView.classList.add("hidden");
  applicationsView.classList.add("hidden");
  searchesView.classList.add("hidden");
  if (upgradeView) {
    upgradeView.classList.add("hidden");
  }
  if (view) view.classList.remove("hidden");
}

function showUserMenu() {
  showView(userMenuPanel);
  if (currentUser) {
    menuUserName.textContent = currentUser.displayName || "Usuario";
    menuUserEmail.textContent = currentUser.email || "";
    menuUserInitial.textContent = (currentUser.displayName || currentUser.email || "U")[0].toUpperCase();
  }
}

function showUpgradeView() {
  showView(upgradeView);
  const plan = getCurrentPlanConfig();
  const nextPlan = getRecommendedUpgradePlan(plan.id);
  if (upgradeNowBtn) {
    upgradeNowBtn.textContent = nextPlan
      ? `Subir a ${nextPlan.name} en TRCVASTIAN`
      : "Ir a pagar en TRCVASTIAN";
  }
}

function showProfile() {
  showView(profileView);
  if (currentUser) {
    profileEmail.value = currentUser.email || "";
    Promise.all([
      loadUserProfile(),
      loadUserCvs(),
      getMergedApplications(),
      getMergedSearches(),
      loadUserActivity(6),
      loadCvSnapshot()
    ]).then(([profile, cvs, applications, searches, activity, cvSnapshot]) => {
      const mergedProfile = mergeProfileSources(profile, cvSnapshot);

      if (profile) {
        currentUserProfile = profile;
      }

      fillProfileForm(mergedProfile);
      profileName.value = mergedProfile.name || mergedProfile.fullName || "";
      profileEmail.value = mergedProfile.email || currentUser.email || "";
      profilePhone.value = mergedProfile.phone || "";
      profileLocation.value = mergedProfile.location || "";
      if (profileCity) {
        profileCity.value = mergedProfile.city || "";
      }
      if (profileState) {
        profileState.value = mergedProfile.state || "";
      }
      if (profileCountry) {
        profileCountry.value = mergedProfile.country || "";
      }
      renderProfileCvDetails(cvSnapshot, mergedProfile);

      if (profileStats) {
        profileStats.innerHTML = [
          { label: "CVs", value: cvs.length },
          { label: "Postulaciones", value: applications.length },
          { label: "Búsquedas", value: searches.length }
        ]
          .map((item) => `
            <div class="rounded-[18px] bg-[#f7fbfe] px-3 py-3 text-center shadow-[inset_0_0_0_1px_rgba(193,199,209,0.18)]">
              <p class="title-display text-[18px] font-semibold text-[#071e27]">${item.value}</p>
              <p class="text-[11px] text-[#4d6570]">${item.label}</p>
            </div>
          `)
          .join("");
      }

      renderBillingCard(applications.length);

      if (profileActivityList) {
        profileActivityList.innerHTML = activity.length
          ? activity
              .map((item) => `
                <div class="rounded-xl border border-[#dceaf2] bg-white px-3 py-2">
                  <p class="text-[12px] font-semibold text-[#071e27]">${escapeHtml(describeActivity(item))}</p>
                  <p class="mt-1 text-[11px] text-[#4d6570]">${escapeHtml(formatFirebaseDate(item.createdAt) || "Hace un momento")}</p>
                </div>
              `)
              .join("")
          : '<p class="text-sm text-[#4d6570] text-center py-2">Tu actividad aparecerá aquí cuando uses el perfil.</p>';
      }

      if (profileCvsList) {
        profileCvsList.innerHTML = cvs.length
          ? cvs
              .slice(0, 5)
              .map((cv) => `
                <div class="rounded-xl border border-[#dceaf2] bg-white px-3 py-2 flex items-center justify-between">
                  <div>
                    <p class="text-[12px] font-semibold text-[#071e27]">${escapeHtml(cv.fileName || "CV")}</p>
                    <p class="text-[11px] text-[#4d6570]">${formatSavedAt(getCvUpdatedAtValue(cv))}</p>
                  </div>
                  <span class="text-[10px] px-2 py-1 rounded-full bg-[#f0f5f8] text-[#4d6570]">${cv.storageMode === "local-file" ? "PDF/DOCX" : "TXT"}</span>
                </div>
              `)
              .join("")
          : '<p class="text-sm text-[#4d6570] text-center py-2">Sin CVs subidos.</p>';
      }

      switchProfileTab("resumen");
    });
  }
}

function renderBillingCard(applicationCount) {
  const usage = getPlanUsageStatus(applicationCount);
  const { plan, status, quota, used, remaining, usagePercent } = usage;
  const nextPlan = getRecommendedUpgradePlan(plan.id);

  if (planRemaining) {
    planRemaining.textContent = String(remaining);
  }

  if (planCurrentName) {
    planCurrentName.textContent = plan.name;
  }

  if (planStatusBadge) {
    planStatusBadge.textContent =
      status === "active" ? "Suscripcion activa" :
      status === "grace" ? "Periodo de gracia" :
      status === "past_due" ? "Pago pendiente" :
      status === "canceled" ? "Suscripcion cancelada" :
      status === "expired" ? "Plan expirado" :
      "Trial activo";
  }

  if (planStatusCopy) {
    planStatusCopy.textContent =
      status === "active"
        ? `Tu cuenta esta activa en ${plan.name}. Puedes seguir postulando mientras tengas cupo disponible este mes.`
      : status === "grace"
        ? `Tu cuenta esta en periodo de gracia. Puedes continuar por ahora, pero conviene regularizar el pago pronto.`
      : status === "past_due"
        ? `Tu pago esta pendiente. Regulariza la suscripcion para volver a usar las postulaciones automáticas.`
      : status === "canceled"
        ? `Tu suscripcion fue cancelada. Puedes volver a activarla desde pricing para recuperar acceso.`
      : status === "expired"
        ? `Tu plan expiro. Haz upgrade o reactiva la cuenta para seguir usando el producto.`
      : "Todo usuario nuevo entra en trial Freemium. Cuando se acaban las postulaciones del plan, el usuario debe hacer upgrade.";
  }

  if (planUsageTitle) {
    planUsageTitle.textContent = status === "trial" ? "Uso del trial" : "Uso de este mes";
  }

  if (planUsageLabel) {
    planUsageLabel.textContent = `${Math.min(used, quota)} / ${quota} usadas este mes`;
  }

  if (planProgressBar) {
    planProgressBar.style.width = `${usagePercent}%`;
  }

  if (planCtaHint) {
    planCtaHint.textContent = usage.blocked
      ? `Tu cuenta llego al limite actual. Siguiente recomendacion: ${nextPlan.name} por USD ${nextPlan.priceUsd}.`
      : nextPlan && plan.id !== "ultra"
        ? `Si necesitas mas volumen, la siguiente mejor opcion es ${nextPlan.name} por USD ${nextPlan.priceUsd}.`
        : "Tu plan actual cubre el mayor nivel disponible en esta extension.";
  }

  if (openPricingBtn) {
    openPricingBtn.textContent = usage.blocked
      ? `Upgrade a ${nextPlan.name}`
      : status === "past_due" || status === "canceled" || status === "expired"
        ? "Reactivar suscripcion"
        : "Ver planes y pagar";
  }
}

async function showCvs() {
  showView(cvsView);
  const cvs = await loadUserCvs();
  if (cvs.length === 0) {
    cvsList.innerHTML = '<p class="text-sm text-[#4d6570] text-center py-4">No tienes CVs guardados aún.</p>';
  } else {
    cvsList.innerHTML = cvs.map(cv => `
      <div class="paper-card p-3">
        <div class="flex items-center justify-between">
          <div>
            <p class="title-display text-[14px] font-semibold text-[#071e27]">${escapeHtml(cv.fileName || "CV")}</p>
            <p class="text-xs text-[#4d6570]">${escapeHtml(formatFirebaseDate(cv.updatedAt || cv.createdAt) || "Fecha no disponible")}</p>
          </div>
          <div class="flex items-center gap-2">
            <span class="soft-pill">${cv.storageMode || "local"}</span>
            <button
              type="button"
              class="cv-delete-btn inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#fff1f1] text-[#c44] transition hover:bg-[#ffe3e3]"
              data-cv-id="${escapeHtml(cv.id || "")}"
              data-cv-name="${escapeHtml(cv.fileName || "CV")}"
              title="Eliminar CV"
              aria-label="Eliminar CV"
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M3 6h18"/>
                <path d="M8 6V4h8v2"/>
                <path d="M19 6l-1 14H6L5 6"/>
                <path d="M10 11v6"/>
                <path d="M14 11v6"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
    `).join("");

    cvsList.querySelectorAll(".cv-delete-btn").forEach((button) => {
      button.addEventListener("click", async () => {
        const cvId = button.getAttribute("data-cv-id") || "";
        const cvName = button.getAttribute("data-cv-name") || "este CV";
        if (!cvId) {
          setStatus("No se pudo identificar el CV.");
          return;
        }

        const confirmed = window.confirm(`¿Eliminar ${cvName} de Mis CVs?`);
        if (!confirmed) {
          return;
        }

        button.setAttribute("disabled", "true");

        const deleted = await deleteUserCv(cvId);
        if (!deleted) {
          button.removeAttribute("disabled");
          setStatus("No se pudo eliminar el CV.");
          return;
        }

        setStatus("CV eliminado.");
        await showCvs();
      });
    });
  }
}

async function showApplications() {
  showView(applicationsView);
  const apps = await getMergedApplications();
  if (apps.length === 0) {
    applicationsList.innerHTML = '<p class="text-sm text-[#4d6570] text-center py-4">No tienes postulaciones guardadas.</p>';
  } else {
    applicationsList.innerHTML = apps.map(app => `
      <div class="paper-card p-3">
        <div class="flex items-center justify-between">
          <div>
            <p class="title-display text-[14px] font-semibold text-[#071e27]">${escapeHtml(app.jobTitle || "Vacante")}</p>
            <p class="text-xs text-[#4d6570]">${escapeHtml([app.company || "", app.mode || "", formatFirebaseDate(app.createdAt)].filter(Boolean).join(" · "))}</p>
          </div>
          <div class="flex items-center gap-2">
            <span class="soft-pill">${app.status || "pending"}</span>
            ${/^https?:/i.test(String(app.destinationUrl || app.jobUrl || "").trim()) ? `
              <button
                type="button"
                class="application-open-btn inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#eef6fb] text-[#0f5d86] transition hover:bg-[#ddeef8]"
                data-url="${escapeHtml(app.destinationUrl || app.jobUrl || "")}"
                title="Ver postulación"
                aria-label="Ver postulación"
              >
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M14 3h7v7"/>
                  <path d="M10 14 21 3"/>
                  <path d="M21 14v7h-7"/>
                  <path d="M3 10V3h7"/>
                  <path d="M3 21l7-7"/>
                </svg>
              </button>
            ` : ""}
          </div>
        </div>
      </div>
    `).join("");

    applicationsList.querySelectorAll(".application-open-btn").forEach((button) => {
      button.addEventListener("click", async () => {
        const url = button.getAttribute("data-url") || "";
        if (!/^https?:/i.test(url)) {
          setStatus("No encontré una URL válida para esta postulación.");
          return;
        }

        try {
          await chrome.tabs.create({ url });
        } catch (error) {
          console.error("Error opening application URL:", error);
          setStatus("No se pudo abrir la URL de la postulación.");
        }
      });
    });
  }
}

async function showSearches() {
  showView(searchesView);
  const searches = await getMergedSearches();
  if (searches.length === 0) {
    searchesList.innerHTML = '<p class="text-sm text-[#4d6570] text-center py-4">No tienes búsquedas guardadas.</p>';
  } else {
    searchesList.innerHTML = searches.map(search => `
      <div class="paper-card p-3">
        <p class="title-display text-[14px] font-semibold text-[#071e27]">${escapeHtml(search.role || search.keywords?.join(", ") || "Búsqueda")}</p>
        <p class="text-xs text-[#4d6570]">${escapeHtml([search.portalLabel || search.portalId || "LinkedIn", formatFirebaseDate(search.createdAt)].filter(Boolean).join(" · "))}</p>
      </div>
    `).join("");
  }
}

// Menu button events
userMenuBtn?.addEventListener("click", showUserMenu);
closeUserMenuBtn?.addEventListener("click", () => { renderView(); });
menuProfileBtn?.addEventListener("click", showProfile);
menuCvsBtn?.addEventListener("click", showCvs);
menuApplicationsBtn?.addEventListener("click", showApplications);
menuSearchesBtn?.addEventListener("click", showSearches);
openPricingBtn?.addEventListener("click", openPricingPage);
upgradeNowBtn?.addEventListener("click", openPricingPage);
closeUpgradeBtn?.addEventListener("click", showUserMenu);
backFromUpgradeBtn?.addEventListener("click", showUserMenu);
menuLogoutBtn?.addEventListener("click", async () => {
  await performLogout();
});

// Close buttons
closeProfileBtn?.addEventListener("click", showUserMenu);
backFromProfileBtn?.addEventListener("click", showUserMenu);
closeCvsBtn?.addEventListener("click", showUserMenu);
backFromCvsBtn?.addEventListener("click", showUserMenu);
closeApplicationsBtn?.addEventListener("click", showUserMenu);
backFromApplicationsBtn?.addEventListener("click", showUserMenu);
closeSearchesBtn?.addEventListener("click", showUserMenu);
backFromSearchesBtn?.addEventListener("click", showUserMenu);

// Save profile
saveProfileBtn?.addEventListener("click", async () => {
  const profileData = {
    name: profileName.value.trim(),
    phone: profilePhone.value.trim(),
    location: profileLocation.value.trim(),
    country: profileCountry?.value.trim() || ""
  };
  await updateUserProfile(profileData);
  saveProfileBtn.textContent = "✓ Guardado";
  setTimeout(() => saveProfileBtn.textContent = "Guardar perfil", 2000);
});
