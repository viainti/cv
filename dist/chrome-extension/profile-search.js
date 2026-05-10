const ROLE_PRIORITIES = [
  { label: "Frontend Developer", patterns: ["frontend", "front-end", "react", "next.js", "vue", "ui engineer"] },
  { label: "Full Stack Developer", patterns: ["full stack", "fullstack", "frontend", "backend", "node.js"] },
  { label: "Backend Developer", patterns: ["backend", "back-end", "api", "node.js", "python", "java"] },
  { label: "Product Designer", patterns: ["product design", "ui/ux", "ux", "figma", "designer"] },
  { label: "Product Manager", patterns: ["product manager", "product owner", "growth"] },
  { label: "Data Analyst", patterns: ["data analyst", "analytics", "sql", "bi"] },
  { label: "DevOps Engineer", patterns: ["devops", "platform", "sre", "aws", "kubernetes"] },
  { label: "CEO/Founder", patterns: ["ceo", "founder", "entrepreneur", "director"] },
  { label: "Blockchain Developer", patterns: ["blockchain", "cryptocurrency", "web3", "solidity", "defi", "crypto"] },
  { label: "AI/ML Engineer", patterns: ["machine learning", "artificial intelligence", "ai", "ml", "deep learning", "neural"] }
];

const SKILL_PRIORITIES = ["react", "typescript", "javascript", "next.js", "node.js", "python", "sql", "aws", "docker", "graphql", "tailwind", "blockchain", "machine learning", "artificial intelligence", "solidity", "web3"];
const LOCATION_PRIORITIES = ["remote", "zurich", "switzerland", "madrid", "barcelona", "london", "berlin", "amsterdam", "mexico", "bogota", "buenos aires", "miami", "new york"];

export const DEFAULT_PROFILE_OVERRIDES = {
  fullName: "",
  firstName: "",
  lastName: "",
  email: "",
  phoneCountryCode: "",
  phoneCountryLabel: "",
  location: "",
  preferredLocation: "",
  city: "",
  state: "",
  country: "",
  role: "",
  skills: [],
  seniority: "",
  remotePreference: ""
};

const COUNTRY_HINTS = [
  { label: "Switzerland", aliases: ["switzerland", "schweiz", "suisse", "svizzera"] },
  { label: "Spain", aliases: ["spain", "espana", "españa"] },
  { label: "Germany", aliases: ["germany", "deutschland"] },
  { label: "France", aliases: ["france"] },
  { label: "Italy", aliases: ["italy", "italia"] },
  { label: "United Kingdom", aliases: ["united kingdom", "uk", "england", "great britain"] },
  { label: "Netherlands", aliases: ["netherlands", "holland", "nederland"] },
  { label: "United States", aliases: ["united states", "usa", "u.s.a", "america"] },
  { label: "Canada", aliases: ["canada"] },
  { label: "Mexico", aliases: ["mexico", "méxico"] },
  { label: "Colombia", aliases: ["colombia"] },
  { label: "Argentina", aliases: ["argentina"] },
  { label: "Chile", aliases: ["chile"] },
  { label: "Peru", aliases: ["peru", "perú"] },
  { label: "Brazil", aliases: ["brazil", "brasil"] },
  { label: "Uruguay", aliases: ["uruguay"] }
];

export const PORTAL_CONFIG = {
  linkedin: { label: "LinkedIn", baseUrl: "https://www.linkedin.com/jobs/search/" },
  getonboard: { label: "Get on Board", baseUrl: "https://www.getonbrd.com/jobs" },
  computrabajo: { label: "Computrabajo", baseUrl: "https://www.computrabajo.com/search-jobs" },
  bumeran: { label: "Bumeran", baseUrl: "https://www.bumeran.com" },
  laborum: { label: "Laborum", baseUrl: "https://www.laborum.cl" },
  elempleo: { label: "Elempleo", baseUrl: "https://www.elempleo.com/co/ofertas-empleo/" },
  indeed: { label: "Indeed", baseUrl: "https://www.indeed.com/jobs" },
  glassdoor: { label: "Glassdoor", baseUrl: "https://www.glassdoor.com/Job/jobs.htm" },
  wellfound: { label: "Wellfound", baseUrl: "https://wellfound.com/jobs" },
  remoteok: { label: "Remote OK", baseUrl: "https://remoteok.com/remote-dev-jobs" },
  weworkremotely: { label: "We Work Remotely", baseUrl: "https://weworkremotely.com/remote-jobs/search" },
  torre: { label: "Torre", baseUrl: "https://torre.ai/jobs" },
  jooble: { label: "Jooble", baseUrl: "https://jooble.org/SearchResult" }
};

export function deriveProfileFromCv(cvText, overrides = {}) {
  const normalized = normalizeText(cvText);
  const lines = splitCvLines(cvText);
  const identity = extractIdentity(lines, cvText);
  const locationDetails = inferLocationDetails(lines, normalized);
  
  const mergedOverrides = {
    ...DEFAULT_PROFILE_OVERRIDES,
    ...overrides
  };
  
  const inferred = {
    role: inferRole(normalized),
    skills: inferSkills(normalized),
    seniority: inferSeniority(normalized),
    remotePreference: inferRemotePreference(normalized),
    preferredLocation: locationDetails.location || inferLocation(normalized),
    country: locationDetails.country || "",
    city: locationDetails.city || "",
    fullName: identity.fullName,
    firstName: identity.firstName,
    lastName: identity.lastName,
    email: identity.email,
    phone: identity.phone,
    linkedin: identity.linkedin,
    github: identity.github,
    portfolio: identity.portfolio,
    website: identity.portfolio,
    keywords: []
  };

  const profile = {
    ...inferred,
    ...cleanOverrides(mergedOverrides, inferred)
  };

  profile.keywords = uniqueCompact([profile.role, profile.seniority, ...profile.skills]).filter(Boolean);
  return profile;
}

export function extractCvProfileSnapshot(cvText, overrides = {}) {
  const text = String(cvText || "");
  const lines = splitCvLines(text);
  const profile = deriveProfileFromCv(text, overrides);
  const identity = extractIdentity(lines, text);
  const locationDetails = inferLocationDetails(lines, normalizeText(text));
  const nationality = inferNationality(text, locationDetails.country);

  return {
    ...profile,
    fullName: identity.fullName || profile.fullName || "",
    firstName: identity.firstName || profile.firstName || "",
    lastName: identity.lastName || profile.lastName || "",
    email: identity.email || profile.email || "",
    phone: identity.phone || profile.phone || "",
    linkedin: identity.linkedin || profile.linkedin || "",
    github: identity.github || profile.github || "",
    portfolio: identity.portfolio || profile.portfolio || "",
    website: identity.portfolio || profile.website || "",
    location: profile.preferredLocation || locationDetails.location || "",
    city: locationDetails.city || profile.city || "",
    state: locationDetails.state || profile.state || "",
    country: locationDetails.country || profile.country || "",
    nationality: nationality || profile.nationality || "",
    education: extractSectionLines(lines, /(education|educacion|educación|university|universidad|college|bootcamp|master|bachelor|degree)/i, 6),
    experience: extractSectionLines(lines, /(experience|experiencia|employment|work history|career|trabajo|empresa)/i, 8),
    certifications: extractSectionLines(lines, /(certification|certificacion|certificación|certificate)/i, 4),
    languages: extractSectionLines(lines, /(languages|idiomas|language)/i, 4),
    summary: extractSummary(lines, identity.fullName),
    cvSnippet: lines.slice(0, 8).join(" ").slice(0, 420)
  };
}

function inferNationality(cvText, country) {
  const normalized = normalizeText(cvText);
  
  const nationalityPatterns = [
    { pattern: /nationality[:\s]+(\w+)/i, extract: 1 },
    { pattern: /citizenship[:\s]+(\w+)/i, extract: 1 },
    { pattern: /c[:\s]*(\w+)\s*citizen/i, extract: 1 },
    { pattern: /peruan[oa]|peruvian/i, nationality: "Peruvian" },
    { pattern: /colombian[oa]?|colombian/i, nationality: "Colombian" },
    { pattern: /swiss|suizo|suiza/i, nationality: "Swiss" },
    { pattern: /spanish|español|española/i, nationality: "Spanish" },
    { pattern: /german|alemán|alemana/i, nationality: "German" },
    { pattern: /french|francés|francesa/i, nationality: "French" },
    { pattern: /italian|italiano|italiana/i, nationality: "Italian" },
    { pattern: /argentin[oa]|argentine/i, nationality: "Argentinian" },
    { pattern: /chilen[oa]|chilean/i, nationality: "Chilean" },
    { pattern: /mexican[oa]?|mexican/i, nationality: "Mexican" },
    { pattern: /brazilian|brasileño|brasileira/i, nationality: "Brazilian" },
    { pattern: /ecuadorian|ecuatoriano|ecuatoriana/i, nationality: "Ecuadorian" },
    { pattern: /venezuelan|venezolano|venezolana/i, nationality: "Venezuelan" },
    { pattern: /bolivian|boliviano|boliviana/i, nationality: "Bolivian" },
    { pattern: /uruguayan|uruguayo|uruguaya/i, nationality: "Uruguayan" },
    { pattern: /paraguayan|paraguayo|paraguaya/i, nationality: "Paraguayan" },
    { pattern: /american|estadounidense/i, nationality: "American" },
    { pattern: /canadian|canadiense/i, nationality: "Canadian" },
    { pattern: /british|británico|británica/i, nationality: "British" },
    { pattern: /portuguese|portugués|portuguesa/i, nationality: "Portuguese" },
    { pattern: /dutch|neerlandés|holandés/i, nationality: "Dutch" },
    { pattern: /polish|polaco|polaca/i, nationality: "Polish" },
    { pattern: /romanian|rumano|rumana/i, nationality: "Romanian" },
    { pattern: /indian|indio|india/i, nationality: "Indian" },
    { pattern: /chinese|chino|china/i, nationality: "Chinese" },
    { pattern: /japanese|japonés|japonesa/i, nationality: "Japanese" },
    { pattern: /korean|coreano|coreana/i, nationality: "Korean" },
    { pattern: /australian|australiano|australiana/i, nationality: "Australian" }
  ];

  for (const { pattern, nationality } of nationalityPatterns) {
    if (pattern.test(normalized)) {
      const match = cvText.match(pattern);
      if (nationality) return nationality;
      if (match && match[1]) return match[1].trim();
    }
  }

  return country || "";
}

export function buildSearchUrlForPortal(portalId, cvText, overrides = {}) {
  const profile = deriveProfileFromCv(cvText, overrides);

  if (portalId === "linkedin") {
    return buildLinkedInSearchUrl(profile);
  }

  if (portalId === "getonboard") {
    return `${PORTAL_CONFIG.getonboard.baseUrl}?search=${encodeURIComponent(
      [profile.role, ...profile.skills.slice(0, 2)].filter(Boolean).join(" ")
    )}`;
  }

  if (portalId === "computrabajo") {
    const params = new URLSearchParams();
    params.set("q", [profile.role, ...profile.skills.slice(0, 2)].filter(Boolean).join(" "));
    return `${PORTAL_CONFIG.computrabajo.baseUrl}?${params.toString()}`;
  }

  if (portalId === "bumeran") {
    return `${PORTAL_CONFIG.bumeran.baseUrl}/empleos-busqueda-${slugifySearch(profile)}.html`;
  }

  if (portalId === "laborum") {
    return `${PORTAL_CONFIG.laborum.baseUrl}/empleos-busqueda-${slugifySearch(profile)}.html`;
  }

  if (portalId === "elempleo") {
    return `${PORTAL_CONFIG.elempleo.baseUrl}?palabrasclave=${encodeURIComponent(
      [profile.role, ...profile.skills.slice(0, 2)].filter(Boolean).join(" ")
    )}`;
  }

  if (portalId === "indeed") {
    const params = new URLSearchParams();
    params.set("q", [profile.role, ...profile.skills.slice(0, 2)].filter(Boolean).join(" "));
    if (profile.preferredLocation && profile.preferredLocation !== "remote") {
      params.set("l", profile.preferredLocation);
    }
    return `${PORTAL_CONFIG.indeed.baseUrl}?${params.toString()}`;
  }

  if (portalId === "glassdoor") {
    const params = new URLSearchParams();
    params.set("sc.keyword", [profile.role, ...profile.skills.slice(0, 2)].filter(Boolean).join(" "));
    return `${PORTAL_CONFIG.glassdoor.baseUrl}?${params.toString()}`;
  }

  if (portalId === "remoteok") {
    const keywords = uniqueCompact([profile.role, ...profile.skills.slice(0, 2)])
      .join(" ")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    return `${PORTAL_CONFIG.remoteok.baseUrl}/${keywords || "developer"}`;
  }

  if (portalId === "weworkremotely") {
    const params = new URLSearchParams();
    params.set("term", [profile.role, ...profile.skills.slice(0, 2)].filter(Boolean).join(" "));
    return `${PORTAL_CONFIG.weworkremotely.baseUrl}?${params.toString()}`;
  }

  if (portalId === "torre") {
    const params = new URLSearchParams();
    params.set("query", [profile.role, ...profile.skills.slice(0, 2)].filter(Boolean).join(" "));
    return `${PORTAL_CONFIG.torre.baseUrl}?${params.toString()}`;
  }

  if (portalId === "jooble") {
    const params = new URLSearchParams();
    params.set("keywords", [profile.role, ...profile.skills.slice(0, 2)].filter(Boolean).join(" "));
    if (profile.preferredLocation && profile.preferredLocation !== "remote") {
      params.set("location", profile.preferredLocation);
    }
    return `${PORTAL_CONFIG.jooble.baseUrl}?${params.toString()}`;
  }

  const params = new URLSearchParams();
  params.set("query", [profile.role, ...profile.skills.slice(0, 2)].filter(Boolean).join(" "));
  return `${PORTAL_CONFIG.wellfound.baseUrl}?${params.toString()}`;
}

function slugifySearch(profile) {
  return uniqueCompact([profile.role, ...profile.skills.slice(0, 2)])
    .join(" ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function buildLinkedInSearchUrl(profileOrCvText, overrides = {}) {
  const profile = typeof profileOrCvText === "string" ? deriveProfileFromCv(profileOrCvText, overrides) : profileOrCvText;
  const params = new URLSearchParams();
  
  const swissCities = ["zurich", "zürich", "geneva", "genève", "basel", "basle", "bern", "lausanne", "winterthur", "lucerne", "lugano", "st. gallen", "zug"];
  
  let targetLocation = "";
  const rawLocation = String(profile.location || profile.preferredLocation || "").trim();
  const rawCity = String(profile.city || "").trim();
  const rawCountry = String(profile.country || "").trim();
  
  const normalizedLocation = normalizeText(rawLocation);
  const normalizedCity = normalizeText(rawCity);
  const isSwissProfile = swissCities.some(city => normalizedLocation.includes(city)) || 
                          swissCities.some(city => normalizedCity.includes(city)) ||
                          normalizeText(rawCountry).includes("switzerland") ||
                          normalizeText(rawCountry).includes("schweiz");
  
  if (isSwissProfile) {
    targetLocation = rawCity || extractCityFromLocation(rawLocation) || "Switzerland";
  } else {
    targetLocation = String(profile.preferredLocation || profile.location || profile.country || profile.city || "").trim();
  }

  params.set("keywords", uniqueCompact([profile.role, ...profile.skills.slice(0, 3)]).join(" "));
  params.set("origin", "JOBS_HOME_JYMBII");

  if (targetLocation && normalizeText(targetLocation) !== "remote") {
    params.set("location", targetLocation);
  }

  if (profile.remotePreference === "remote") {
    params.set("f_WT", "2");
  }

  if (profile.seniority === "junior") {
    params.set("f_E", "2");
  } else if (profile.seniority === "mid") {
    params.set("f_E", "3");
  } else if (["senior", "lead"].includes(profile.seniority)) {
    params.set("f_E", "4");
  }

  return `${PORTAL_CONFIG.linkedin.baseUrl}?${params.toString()}`;
}

function extractCityFromLocation(location) {
  const text = String(location || "").trim();
  if (!text) return "";
  
  const parts = text.split(/[,\-–]+/).map(p => p.trim()).filter(Boolean);
  if (parts.length >= 1) {
    return parts[0];
  }
  
  const swissCities = ["Zurich", "Zürich", "Geneva", "Genève", "Basel", "Basle", "Bern", "Lausanne", "Winterthur", "Lucerne", "Lugano", "St. Gallen", "Zug"];
  const normalized = text.toLowerCase();
  for (const city of swissCities) {
    if (normalized.includes(city.toLowerCase())) {
      return city;
    }
  }
  
  return "";
}

function inferRole(text) {
  const best = ROLE_PRIORITIES.map((entry) => ({
    label: entry.label,
    score: entry.patterns.reduce((acc, pattern) => acc + (text.includes(pattern) ? 1 : 0), 0)
  })).sort((a, b) => b.score - a.score)[0];

  return best?.score ? best.label : "Software Engineer";
}

function inferSkills(text) {
  return SKILL_PRIORITIES.filter((skill) => text.includes(skill)).slice(0, 5);
}

function inferRemotePreference(text) {
  if (text.includes("remote") || text.includes("remoto")) return "remote";
  if (text.includes("hybrid") || text.includes("hibrido") || text.includes("hybrid")) return "hybrid";
  return "onsite";
}

function inferLocation(text) {
  const found = LOCATION_PRIORITIES.find((item) => item !== "remote" && text.includes(item));
  return found || "";
}

function inferSeniority(text) {
  if (text.includes("staff") || text.includes("principal")) return "lead";
  if (text.includes("lead") || text.includes("manager")) return "lead";
  if (text.includes("senior") || text.includes("sr.")) return "senior";
  if (text.includes("mid") || text.includes("semi senior")) return "mid";
  if (text.includes("junior") || text.includes("jr.") || text.includes("intern")) return "junior";
  return "mid";
}

function cleanOverrides(overrides, inferred) {
  const cleaned = {};

  cleaned.role = String(overrides.role || inferred.role || "").trim();
  cleaned.seniority = String(overrides.seniority || inferred.seniority || "").trim();
  cleaned.remotePreference = String(overrides.remotePreference || inferred.remotePreference || "").trim();
  cleaned.preferredLocation = String(overrides.preferredLocation || inferred.preferredLocation || "").trim();
  cleaned.country = String(overrides.country || inferred.country || "").trim();
  cleaned.city = String(overrides.city || inferred.city || "").trim();
  cleaned.fullName = String(overrides.fullName || inferred.fullName || "").trim();
  cleaned.firstName = String(overrides.firstName || inferred.firstName || "").trim();
  cleaned.lastName = String(overrides.lastName || inferred.lastName || "").trim();
  cleaned.email = String(overrides.email || inferred.email || "").trim();
  cleaned.phone = String(overrides.phone || inferred.phone || "").trim();
  cleaned.linkedin = String(overrides.linkedin || inferred.linkedin || "").trim();
  cleaned.github = String(overrides.github || inferred.github || "").trim();
  cleaned.portfolio = String(overrides.portfolio || inferred.portfolio || "").trim();
  cleaned.website = String(overrides.website || inferred.website || inferred.portfolio || "").trim();

  const skillSource = Array.isArray(overrides.skills) ? overrides.skills : inferred.skills;
  cleaned.skills = uniqueCompact(skillSource);
  return cleaned;
}

function splitCvLines(value) {
  return String(value || "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function extractIdentity(lines, cvText) {
  const email = extractPattern(cvText, /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  const linkedin = extractPattern(cvText, /https?:\/\/(?:www\.)?linkedin\.com\/[^\s)]+/i);
  const github = extractPattern(cvText, /https?:\/\/(?:www\.)?github\.com\/[^\s)]+/i);
  const portfolio = extractPattern(cvText, /https?:\/\/(?!(?:www\.)?linkedin\.com)(?!(?:www\.)?github\.com)[^\s)]+/i);
  const phone = normalizePhone(extractPattern(cvText, /(?:\+\d{1,3}[\s-]?)?(?:\(?\d{2,4}\)?[\s-]?){2,5}\d{2,4}/));
  const fullName = extractFullName(lines, email);
  const parts = fullName.split(/\s+/).filter(Boolean);

  return {
    email,
    linkedin,
    github,
    portfolio,
    phone,
    fullName,
    firstName: parts[0] || "",
    lastName: parts.slice(1).join(" ")
  };
}

function inferLocationDetails(lines, normalizedText) {
  const locationLine = findLocationLine(lines);
  const location = locationLine || inferLocation(normalizedText);
  const country = inferCountry(locationLine || normalizedText);
  const city = inferCity(locationLine);
  const state = inferState(locationLine, city, country);

  return {
    location: location || "",
    country: country || "",
    city: city || "",
    state: state || ""
  };
}

function findLocationLine(lines) {
  for (const line of lines.slice(0, 16)) {
    if (line.length > 90 || /@|http|linkedin|github/i.test(line)) {
      continue;
    }

    if (/,/.test(line) || /\bremote\b/i.test(line) || COUNTRY_HINTS.some((item) => item.aliases.some((alias) => normalizeText(line).includes(normalizeText(alias))))) {
      return line;
    }
  }

  return "";
}

function inferCountry(value) {
  const normalized = normalizeText(value);
  const found = COUNTRY_HINTS.find((item) => item.aliases.some((alias) => normalized.includes(normalizeText(alias))));
  return found?.label || "";
}

function inferCity(locationLine) {
  const text = String(locationLine || "").trim();
  if (!text) {
    return "";
  }

  const swissCities = ["Zurich", "Zürich", "Geneva", "Genève", "Basel", "Basle", "Bern", "Lausanne", "Winterthur", "Lucerne", "Luzern", "Lugano", "St. Gallen", "Zug", "Biel", "Thun", "Schaffhausen"];
  
  const normalized = normalizeText(text);
  for (const city of swissCities) {
    if (normalized.includes(normalizeText(city))) {
      return city;
    }
  }

  const parts = text
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return parts[0] || "";
}

function inferState(locationLine, city, country) {
  const text = String(locationLine || "").trim();
  if (!text) {
    return "";
  }

  const normalizedText = normalizeText(text);
  const normalizedCity = normalizeText(city || "");
  const normalizedCountry = normalizeText(country || "");
  
  const swissCantons = [
    { city: "zurich", canton: "Zurich" },
    { city: "zürich", canton: "Zurich" },
    { city: "geneva", canton: "Geneva" },
    { city: "genève", canton: "Geneva" },
    { city: "basel", canton: "Basel-Stadt" },
    { city: "basle", canton: "Basel-Stadt" },
    { city: "bern", canton: "Bern" },
    { city: "lausanne", canton: "Vaud" },
    { city: "winterthur", canton: "Zurich" },
    { city: "lucerne", canton: "Lucerne" },
    { city: "luzern", canton: "Lucerne" },
    { city: "lugano", canton: "Ticino" },
    { city: "st. gallen", canton: "St. Gallen" },
    { city: "zug", canton: "Zug" },
    { city: "biel", canton: "Bern" },
    { city: "thun", canton: "Bern" },
    { city: "schaffhausen", canton: "Schaffhausen" }
  ];

  const isSwiss = normalizedCountry.includes("switzerland") || normalizedCountry.includes("schweiz") || normalizedCountry.includes("suisse");
  
  if (isSwiss || normalizedText.includes("ch")) {
    for (const entry of swissCantons) {
      if (normalizedCity.includes(normalizeText(entry.city))) {
        return entry.canton;
      }
    }
  }

  const parts = text
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  
  if (parts.length >= 3) {
    return parts[1];
  }

  const statePatterns = [
    /\b(Zurich|Zürich|Geneva|Genève|Basel|Bern|Vaud|Ticino|Lucerne|Luzern|Zug|St\.?\s*Gallen|Schaffhausen|Aargau|Graubünden|Valais|Wallis|Fribourg|Neuchâtel|Jura|Solothurn|Thurgau|Schwyz|Obwalden|Nidwalden|Glarus|Uri|Appenzell)\b/i,
    /\b(Canton of\s+\w+|Kanton\s+\w+)\b/i
  ];

  for (const pattern of statePatterns) {
    const match = text.match(pattern);
    if (match) {
      return match[1] || match[0];
    }
  }

  return "";
}

function extractSummary(lines, fullName) {
  const blocked = new RegExp(`${escapeRegex(fullName)}|@|http|linkedin|github`, "i");
  return lines
    .filter((line) => line.length >= 30 && line.length <= 220 && !blocked.test(line))
    .slice(0, 3)
    .join(" ");
}

function extractSectionLines(lines, matcher, limit) {
  const collected = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (matcher.test(line)) {
      for (let cursor = index; cursor < Math.min(index + limit + 2, lines.length); cursor += 1) {
        const candidate = String(lines[cursor] || "").trim();
        if (!candidate || candidate.length > 180) {
          continue;
        }
        if (/^[:\-–•·]+$/.test(candidate)) {
          continue;
        }
        collected.push(candidate);
      }
      break;
    }
  }

  if (!collected.length) {
    for (const line of lines) {
      if (matcher.test(line) && line.length <= 180) {
        collected.push(line);
      }
      if (collected.length >= limit) {
        break;
      }
    }
  }

  return uniqueCompact(collected).slice(0, limit);
}

function extractPattern(text, pattern) {
  const match = String(text || "").match(pattern);
  return match ? String(match[0]).trim() : "";
}

function normalizePhone(value) {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }

  const cleaned = text.replace(/[^\d+]/g, "");
  return cleaned.length >= 7 ? text : "";
}

function extractFullName(lines, email) {
  const emailUser = String(email || "").split("@")[0];

  for (const line of lines.slice(0, 6)) {
    if (line.length > 60 || /\d/.test(line) || /@|http|linkedin|github/i.test(line)) {
      continue;
    }

    const words = line.split(/\s+/).filter(Boolean);
    if (words.length >= 2 && words.length <= 5) {
      return line;
    }
  }

  if (emailUser) {
    return emailUser
      .replace(/[._-]+/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase())
      .trim();
  }

  return "";
}

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function uniqueCompact(values) {
  return [...new Set((values || []).map((item) => String(item || "").trim()).filter(Boolean))];
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}
