const SKILL_GROUPS = [
  ["javascript", ["javascript", "js", "ecmascript"]],
  ["typescript", ["typescript", "ts"]],
  ["react", ["react", "react.js", "reactjs"]],
  ["next.js", ["next.js", "nextjs", "next"]],
  ["vue", ["vue", "vue.js", "vuejs"]],
  ["angular", ["angular"]],
  ["node.js", ["node.js", "nodejs", "node"]],
  ["python", ["python"]],
  ["java", ["java"]],
  ["php", ["php"]],
  ["c#", ["c#", ".net", "dotnet"]],
  ["sql", ["sql", "postgres", "postgresql", "mysql"]],
  ["mongodb", ["mongodb", "mongo"]],
  ["aws", ["aws", "amazon web services"]],
  ["docker", ["docker"]],
  ["kubernetes", ["kubernetes", "k8s"]],
  ["graphql", ["graphql"]],
  ["rest api", ["rest", "restful", "api"]],
  ["tailwind", ["tailwind", "tailwindcss"]],
  ["figma", ["figma"]],
  ["git", ["git", "github", "gitlab"]],
  ["testing", ["jest", "vitest", "cypress", "playwright", "testing"]],
  ["ci/cd", ["ci/cd", "github actions", "gitlab ci", "pipeline"]],
  ["agile", ["agile", "scrum", "kanban"]],
  ["llm", ["llm", "openai", "ai", "machine learning", "nlp"]]
];

const ROLE_GROUPS = [
  ["frontend", ["frontend", "front-end", "ui engineer", "web ui"]],
  ["backend", ["backend", "back-end", "api", "server-side"]],
  ["fullstack", ["full stack", "fullstack"]],
  ["mobile", ["android", "ios", "react native", "flutter", "mobile"]],
  ["data", ["data engineer", "data analyst", "analytics", "bi"]],
  ["devops", ["devops", "platform", "sre", "infrastructure"]],
  ["product", ["product manager", "product owner", "growth"]],
  ["design", ["designer", "ux", "ui/ux", "product design"]]
];

const STOPWORDS = new Set([
  "with",
  "that",
  "this",
  "from",
  "have",
  "will",
  "your",
  "para",
  "como",
  "con",
  "una",
  "the",
  "and",
  "our",
  "you",
  "job",
  "role"
]);

export function analyzeJobFit({ cvText, jobTitle = "", company = "", location = "", jobText = "", pageUrl = "" }) {
  const cv = normalizeText(cvText);
  const job = normalizeText([jobTitle, company, location, jobText].filter(Boolean).join("\n"));

  const cvSkills = extractSkills(cv);
  const jobSkills = extractSkills(job);
  const matchedSkills = jobSkills.filter((skill) => cvSkills.includes(skill));
  const missingSkills = jobSkills.filter((skill) => !cvSkills.includes(skill)).slice(0, 6);

  const cvRoles = extractRoles(cv);
  const jobRoles = extractRoles(job);
  const matchedRoles = jobRoles.filter((role) => cvRoles.includes(role));

  const cvYears = extractYears(cv);
  const requiredYears = extractYears(job);
  const keywordScore = computeKeywordScore(cv, job);

  const skillsScore = jobSkills.length ? (matchedSkills.length / jobSkills.length) * 45 : 25;
  const roleScore = matchedRoles.length ? 20 : jobRoles.length ? 6 : 12;
  const seniorityScore = computeSeniorityScore(cv, job, cvYears, requiredYears);
  const keywordPoints = keywordScore * 20;
  const contextScore = computeContextScore(cv, job, pageUrl, location);
  const score = clamp(Math.round(skillsScore + roleScore + seniorityScore + keywordPoints + contextScore), 0, 100);

  return {
    score,
    verdict: getVerdict(score),
    recommended: score >= 68,
    matchedSkills,
    missingSkills,
    matchedRoles,
    cvSkills,
    jobSkills,
    summary: buildSummary(score, matchedSkills, missingSkills, matchedRoles, requiredYears, cvYears),
    strengths: buildStrengths(matchedSkills, matchedRoles, cvYears, requiredYears),
    gaps: buildGaps(missingSkills, matchedRoles, jobRoles, cvYears, requiredYears),
    suggestedActions: buildActions(score, missingSkills, jobSkills, matchedSkills),
    jobSnapshot: {
      title: trimText(jobTitle, 120),
      company: trimText(company, 80),
      location: trimText(location, 80)
    }
  };
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function extractSkills(text) {
  return SKILL_GROUPS.filter(([, aliases]) => aliases.some((alias) => text.includes(alias))).map(([label]) => label);
}

function extractRoles(text) {
  return ROLE_GROUPS.filter(([, aliases]) => aliases.some((alias) => text.includes(alias))).map(([label]) => label);
}

function extractYears(text) {
  const matches = [...text.matchAll(/(\d+)\+?\s*(?:years|year|anos|años)/g)];
  if (!matches.length) {
    return 0;
  }

  return Math.max(...matches.map((match) => Number(match[1]) || 0));
}

function computeSeniorityScore(cv, job, cvYears, requiredYears) {
  const cvSeniority = extractSeniority(cv);
  const jobSeniority = extractSeniority(job);

  let score = 8;
  if (!jobSeniority || cvSeniority === jobSeniority) {
    score += 7;
  } else if (
    (jobSeniority === "mid" && ["junior", "senior"].includes(cvSeniority)) ||
    (jobSeniority === "senior" && ["lead", "staff"].includes(cvSeniority))
  ) {
    score += 4;
  }

  if (!requiredYears || cvYears >= requiredYears) {
    score += 8;
  } else if (cvYears >= requiredYears - 1) {
    score += 4;
  }

  return score;
}

function extractSeniority(text) {
  if (text.includes("staff") || text.includes("principal")) return "staff";
  if (text.includes("lead") || text.includes("manager")) return "lead";
  if (text.includes("senior") || text.includes("sr.")) return "senior";
  if (text.includes("mid") || text.includes("semi senior")) return "mid";
  if (text.includes("junior") || text.includes("jr.") || text.includes("intern")) return "junior";
  return "";
}

function computeKeywordScore(cv, job) {
  const cvTokens = new Set(tokenize(cv));
  const jobTokens = tokenize(job).slice(0, 80);
  if (!jobTokens.length) {
    return 0.4;
  }

  const matches = jobTokens.filter((token) => cvTokens.has(token)).length;
  return clamp(matches / Math.max(new Set(jobTokens).size, 8), 0, 1);
}

function tokenize(text) {
  return text
    .split(/[^a-z0-9+#.]+/g)
    .filter((token) => token.length > 3 && !STOPWORDS.has(token));
}

function computeContextScore(cv, job, pageUrl, location) {
  let score = 6;

  if (pageUrl.includes("linkedin.com")) {
    score += 2;
  }

  if (job.includes("remote") && cv.includes("remote")) {
    score += 3;
  }

  if (location && cv.includes(normalizeText(location))) {
    score += 2;
  }

  return score;
}

function buildSummary(score, matchedSkills, missingSkills, matchedRoles, requiredYears, cvYears) {
  if (score >= 82) {
    return `Ajuste alto. Tu perfil coincide bien con ${joinList(matchedSkills.slice(0, 4)) || "las competencias principales"} y el rol esperado.`;
  }

  if (score >= 68) {
    return `Ajuste sólido. Hay buena base en ${joinList(matchedSkills.slice(0, 3)) || "skills clave"}, aunque conviene reforzar ${joinList(missingSkills.slice(0, 2)) || "algunos requisitos"}.`;
  }

  return `Ajuste parcial. El rol ${matchedRoles.length ? "sí se acerca a tu trayectoria" : "todavía no encaja del todo"} y la vacante parece pedir ${requiredYears || "más"} años frente a ${cvYears || "una experiencia no explícita"} en el CV.`;
}

function buildStrengths(matchedSkills, matchedRoles, cvYears, requiredYears) {
  const strengths = [];

  if (matchedSkills.length) {
    strengths.push(`Coincidencia técnica en ${joinList(matchedSkills.slice(0, 4))}.`);
  }

  if (matchedRoles.length) {
    strengths.push(`Tu experiencia apunta a un rol de ${joinList(matchedRoles)}.`);
  }

  if (!requiredYears || cvYears >= requiredYears) {
    strengths.push("La experiencia declarada cumple o está cerca del nivel pedido.");
  }

  return strengths.slice(0, 3);
}

function buildGaps(missingSkills, matchedRoles, jobRoles, cvYears, requiredYears) {
  const gaps = [];

  if (missingSkills.length) {
    gaps.push(`Faltan señales claras en ${joinList(missingSkills.slice(0, 4))}.`);
  }

  if (jobRoles.length && !matchedRoles.length) {
    gaps.push(`La vacante parece más orientada a ${joinList(jobRoles)} que el CV actual.`);
  }

  if (requiredYears && cvYears && cvYears < requiredYears) {
    gaps.push(`La oferta pide ${requiredYears}+ años y el CV expone ${cvYears}.`);
  }

  return gaps.slice(0, 3);
}

function buildActions(score, missingSkills, jobSkills, matchedSkills) {
  const actions = [];

  if (missingSkills.length) {
    actions.push(`Refuerza el CV con evidencia concreta de ${joinList(missingSkills.slice(0, 2))}.`);
  }

  if (jobSkills.length && matchedSkills.length) {
    actions.push(`Prioriza experiencias con ${joinList(matchedSkills.slice(0, 3))} al responder preguntas abiertas.`);
  }

  actions.push(score >= 68 ? "Vale la pena aplicar con una respuesta personalizada." : "Aplica sólo si puedes adaptar el CV y las respuestas a esta oferta.");
  return actions.slice(0, 3);
}

function getVerdict(score) {
  if (score >= 82) return "Muy buen match";
  if (score >= 68) return "Buen match";
  if (score >= 52) return "Match medio";
  return "Match bajo";
}

function joinList(items) {
  return items.filter(Boolean).join(", ");
}

function trimText(value, length) {
  const text = String(value || "").trim();
  if (text.length <= length) {
    return text;
  }

  return `${text.slice(0, length - 1)}…`;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
