"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { extractCvTextFromFile } from "@/lib/cv-parser";
import { DEFAULT_MODEL, DEFAULT_OPENROUTER_API_KEY } from "@/lib/defaults";
import { analyzeJobFit } from "@/lib/job-fit";

type FormState = {
  cvText: string;
  jobUrl: string;
  apiKey: string;
  model: string;
  extraPrompt: string;
};

type QuickPlatform = {
  id: string;
  label: string;
  meta: string;
  accentClass: string;
  favicon: string;
  logo: string;
  baseUrl: string;
};

const initialState: FormState = {
  cvText: "",
  jobUrl: "",
  apiKey: DEFAULT_OPENROUTER_API_KEY,
  model: DEFAULT_MODEL,
  extraPrompt: ""
};

const QUICK_PLATFORMS: QuickPlatform[] = [
  { id: "linkedin", label: "LinkedIn", meta: "Principal", accentClass: "platform-chip-linkedin", favicon: "in", logo: "LI", baseUrl: "https://www.linkedin.com/jobs/search/" },
  { id: "getonboard", label: "Get on Board", meta: "Latam", accentClass: "platform-chip-getonboard", favicon: "go", logo: "GOB", baseUrl: "https://www.getonbrd.com/jobs" },
  { id: "computrabajo", label: "Computrabajo", meta: "Latam", accentClass: "platform-chip-computrabajo", favicon: "cb", logo: "CT", baseUrl: "https://www.computrabajo.com/search-jobs" },
  { id: "bumeran", label: "Bumeran", meta: "Latam", accentClass: "platform-chip-bumeran", favicon: "b", logo: "BUM", baseUrl: "https://www.bumeran.com" },
  { id: "laborum", label: "Laborum", meta: "Latam", accentClass: "platform-chip-laborum", favicon: "lb", logo: "LAB", baseUrl: "https://www.laborum.cl" },
  { id: "elempleo", label: "Elempleo", meta: "Latam", accentClass: "platform-chip-elempleo", favicon: "e", logo: "EMP", baseUrl: "https://www.elempleo.com/co/ofertas-empleo/" },
  { id: "indeed", label: "Indeed", meta: "Global", accentClass: "platform-chip-indeed", favicon: "i", logo: "ID", baseUrl: "https://www.indeed.com/jobs" },
  { id: "glassdoor", label: "Glassdoor", meta: "Global", accentClass: "platform-chip-glassdoor", favicon: "g", logo: "GD", baseUrl: "https://www.glassdoor.com/Job/jobs.htm" },
  { id: "wellfound", label: "Wellfound", meta: "Startup", accentClass: "platform-chip-wellfound", favicon: "w", logo: "WF", baseUrl: "https://wellfound.com/jobs" },
  { id: "remoteok", label: "Remote OK", meta: "Remote", accentClass: "platform-chip-remoteok", favicon: "ok", logo: "ROK", baseUrl: "https://remoteok.com/remote-dev-jobs" },
  { id: "weworkremotely", label: "We Work Remotely", meta: "Remote", accentClass: "platform-chip-weworkremotely", favicon: "ww", logo: "WWR", baseUrl: "https://weworkremotely.com/remote-jobs/search" },
  { id: "torre", label: "Torre", meta: "Latam", accentClass: "platform-chip-torre", favicon: "t", logo: "TOR", baseUrl: "https://torre.ai/jobs" },
  { id: "jooble", label: "Jooble", meta: "Global", accentClass: "platform-chip-jooble", favicon: "j", logo: "JBL", baseUrl: "https://jooble.org/SearchResult" }
];

export default function HomePage() {
  const [form, setForm] = useState<FormState>(initialState);
  const [saved, setSaved] = useState(false);
  const [activeFile, setActiveFile] = useState("");
  const [isExtracting, setIsExtracting] = useState(false);
  const [isInspectingLinkedIn, setIsInspectingLinkedIn] = useState(false);
  const [status, setStatus] = useState("Sube tu CV para preparar el perfil base.");
  const [jobText, setJobText] = useState("");
  const [jobAnalysis, setJobAnalysis] = useState<ReturnType<typeof analyzeJobFit> | null>(null);

  const update = (key: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  useEffect(() => {
    const savedForm = window.localStorage.getItem("cv-apply-profile");
    if (!savedForm) {
      return;
    }

    try {
      const parsed = JSON.parse(savedForm) as Partial<FormState> & { jobText?: string };
      setForm((prev) => ({ ...prev, ...parsed }));
      setJobText(parsed.jobText || "");
      setStatus(parsed.cvText ? "Perfil recuperado desde este navegador." : "Sube tu CV para empezar.");
    } catch {
      setStatus("Sube tu CV para preparar el perfil base.");
    }
  }, []);

  const onSave = () => {
    window.localStorage.setItem("cv-apply-profile", JSON.stringify({ ...form, jobText }));
    setSaved(true);
    setStatus("Perfil listo para análisis y autoaplicación.");
    setTimeout(() => setSaved(false), 1400);
  };

  const onFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setActiveFile(file.name);
    setIsExtracting(true);
    setStatus(`Extrayendo texto de ${file.name}...`);

    try {
      const cvText = await extractCvTextFromFile(file);
      setForm((prev) => ({ ...prev, cvText }));
      setStatus("Texto extraído correctamente. Ya puedes revisar el perfil.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "No se pudo extraer el texto del CV.");
    } finally {
      setIsExtracting(false);
    }
  };

  const completion = useMemo(() => {
    const steps = [Boolean(activeFile), form.cvText.trim().length > 0, Boolean(form.jobUrl.trim())];
    return `${steps.filter(Boolean).length}/3`;
  }, [activeFile, form.cvText, form.jobUrl]);

  const onAnalyzeJob = async () => {
    if (!form.cvText.trim()) {
      setStatus("Primero carga o pega tu CV.");
      return;
    }

    const isLinkedInUrl = /linkedin\.com\/jobs\//i.test(form.jobUrl);
    let nextJobText = jobText.trim();
    let enrichedTitle = form.jobUrl;
    let enrichedCompany = "";
    let enrichedLocation = "";

    if (isLinkedInUrl && nextJobText.length < 220) {
      try {
        setIsInspectingLinkedIn(true);
        setStatus("Leyendo LinkedIn con Playwright...");
        const response = await fetch("/api/linkedin/inspect", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ url: form.jobUrl })
        });

        const payload = (await response.json()) as {
          success?: boolean;
          reason?: string;
          result?: { title?: string; company?: string; location?: string; description?: string };
        };

        if (!payload.success) {
          throw new Error(payload.reason || "No se pudo enriquecer la vacante.");
        }

        if (payload.result?.description) {
          nextJobText = payload.result.description;
          setJobText(payload.result.description);
        }
        enrichedTitle = payload.result?.title || enrichedTitle;
        enrichedCompany = payload.result?.company || "";
        enrichedLocation = payload.result?.location || "";
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "No se pudo leer LinkedIn con Playwright.");
      } finally {
        setIsInspectingLinkedIn(false);
      }
    }

    if (!nextJobText.trim()) {
      setStatus("Pega la descripción del job o usa una URL de LinkedIn para analizarlo.");
      return;
    }

    const analysis = analyzeJobFit({
      cvText: form.cvText,
      jobTitle: enrichedTitle,
      company: enrichedCompany,
      location: enrichedLocation,
      jobText: nextJobText,
      pageUrl: form.jobUrl
    });

    setJobAnalysis(analysis);
    setStatus("Análisis de vacante actualizado.");
  };

  const onPickPlatform = (platform: QuickPlatform) => {
    update("jobUrl", platform.baseUrl);
    setStatus(`${platform.label} listo para abrir o pegar una vacante.`);
  };

  return (
    <main className="h-screen overflow-hidden px-4 py-4 md:px-8 md:py-6">
      <section className="mx-auto flex h-full max-w-7xl flex-col gap-4">
        <header className="glass-card flex items-start justify-between px-6 py-5 md:px-8">
          <div className="pt-1">
            <p className="label-ui text-xs font-semibold uppercase tracking-[0.28em]">CV Apply</p>
            <h1 className="title-display mt-2 max-w-4xl text-2xl font-semibold text-[#071e27] md:text-4xl">
              Sube tu CV una vez y prepara tu autoaplicación en cualquier job.
            </h1>
          </div>
          <div className="fit-badge hidden md:block">
            <div className="text-lg font-semibold leading-none">{completion}</div>
            <div className="mt-1 text-[10px] uppercase tracking-[0.2em] text-white/70">progreso</div>
          </div>
        </header>

        <div className="grid h-full gap-4 lg:grid-cols-[1.4fr_0.95fr]">
          <section className="glass-card flex h-full flex-col p-5 md:p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="title-display text-sm font-semibold text-[#071e27]">Perfil base</p>
                <p className="label-ui mt-1 text-sm">
                  Carga tu CV, extrae el texto y deja listo el contexto para aplicar rápido.
                </p>
              </div>
              <div className="pulse-badge">
                {activeFile || "Sin archivo"}
              </div>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-[1fr_1.2fr]">
              <div className="module-card">
                <label className="label-ui mb-2 block text-xs font-medium uppercase tracking-[0.22em]">Subir CV</label>
                <input type="file" accept=".pdf,.docx,.txt,.md" className="input-ui text-sm" onChange={onFileChange} />
                <p className="label-ui mt-3 text-sm leading-6">
                  Soporta `PDF`, `DOCX`, `TXT` y `MD`. El texto se extrae y queda listo para usar en la extensión.
                </p>

                <div className="paper-card mt-4">
                  <p className="label-ui text-xs font-medium uppercase tracking-[0.22em]">Estado</p>
                  <p className="mt-2 text-sm leading-6 text-[#071e27]">{isExtracting ? "Procesando archivo..." : status}</p>
                </div>
              </div>

              <div className="flex flex-col">
                <label className="label-ui mb-2 block text-xs font-medium uppercase tracking-[0.22em]">Texto extraído</label>
                <textarea
                  className="input-ui h-[280px] resize-none"
                  value={form.cvText}
                  onChange={(e) => update("cvText", e.target.value)}
                  placeholder="El contenido del CV aparecerá aquí para revisión rápida."
                />
              </div>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <label className="label-ui mb-2 block text-xs font-medium uppercase tracking-[0.22em]">URL del job</label>
                <input
                  className="input-ui"
                  value={form.jobUrl}
                  onChange={(e) => update("jobUrl", e.target.value)}
                  placeholder="https://empresa.com/jobs/frontend"
                />
              </div>

              <div>
                <label className="label-ui mb-2 block text-xs font-medium uppercase tracking-[0.22em]">Modelo</label>
                <input className="input-ui" value={form.model} onChange={(e) => update("model", e.target.value)} />
              </div>
            </div>

            <div className="mt-4">
              <label className="label-ui mb-2 block text-xs font-medium uppercase tracking-[0.22em]">Instrucciones de aplicación</label>
              <textarea
                className="input-ui h-24 resize-none"
                value={form.extraPrompt}
                onChange={(e) => update("extraPrompt", e.target.value)}
                placeholder="Ej: prioriza roles frontend, respuestas breves y ajuste fuerte con React, TypeScript y producto."
              />
            </div>

            <div className="mt-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="label-ui text-xs font-medium uppercase tracking-[0.22em]">Plataformas para buscar jobs</p>
                  <p className="label-ui mt-1 text-sm">Incluí Get on Board con branding más visible y más portales para arrancar rápido.</p>
                </div>
                <div className="pulse-badge hidden md:block">{QUICK_PLATFORMS.length} fuentes</div>
              </div>

              <div className="platform-grid mt-3">
                {QUICK_PLATFORMS.map((platform) => (
                  <button key={platform.id} type="button" className="platform-card" onClick={() => onPickPlatform(platform)}>
                    <div className="flex items-center gap-3">
                      <span className={`platform-brand ${platform.accentClass}`} aria-hidden="true">
                        <span className="platform-favicon">{platform.favicon}</span>
                        <span className="platform-logo">{platform.logo}</span>
                      </span>
                      <span className="min-w-0">
                        <span className="platform-card-title">{platform.label}</span>
                        <span className="platform-card-meta">{platform.meta}</span>
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-auto flex items-center gap-3 pt-4">
              <button type="button" className="btn-primary w-full" onClick={onSave}>
                Guardar perfil
              </button>
              <div className="module-card w-full py-3 text-sm label-ui">
                {saved ? "Perfil guardado." : "Clave por defecto activa y lista para usar."}
              </div>
            </div>
          </section>

          <aside className="glass-card flex h-full flex-col p-5 md:p-6">
            <div>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="title-display text-sm font-semibold text-[#071e27]">Analizador de vacantes</p>
                  <p className="label-ui mt-1 text-sm">
                    Pega el texto de LinkedIn o de cualquier job y calcula el match con tu CV.
                  </p>
                </div>
                <div className="pulse-badge">
                  {jobAnalysis ? `${jobAnalysis.score}/100` : "Sin analisis"}
                </div>
              </div>

              <div className="mt-5">
                <label className="label-ui mb-2 block text-xs font-medium uppercase tracking-[0.22em]">Texto del job</label>
                <textarea
                  className="input-ui h-[220px] resize-none"
                  value={jobText}
                  onChange={(e) => setJobText(e.target.value)}
                  placeholder="Pega aquí la descripción de LinkedIn, la oferta o el bloque principal del job."
                />
                <button type="button" className="btn-primary mt-3 w-full" onClick={onAnalyzeJob}>
                  {isInspectingLinkedIn ? "Leyendo LinkedIn..." : "Analizar match"}
                </button>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              <div className="module-card">
                <p className="label-ui text-xs font-medium uppercase tracking-[0.22em]">Configuración activa</p>
                <p className="mt-3 text-sm leading-6 text-[#071e27]">
                  OpenRouter por defecto listo para todos los usuarios de esta instalación.
                </p>
                <div className="paper-card mt-4 text-sm text-[#071e27]">
                  Modelo actual: {form.model}
                </div>
                <div className="paper-card mt-3 text-sm text-[#071e27]">
                  API Key: {form.apiKey ? "configurada" : "pendiente"}
                </div>
              </div>

              <div className="module-card">
                <p className="label-ui text-xs font-medium uppercase tracking-[0.22em]">Resultado</p>
                {jobAnalysis ? (
                  <div className="mt-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="title-display text-lg font-semibold text-[#071e27]">{jobAnalysis.verdict}</p>
                        <p className="label-ui mt-1 text-sm leading-6">{jobAnalysis.summary}</p>
                      </div>
                      <div className="fit-badge">
                        <div className="text-2xl font-semibold leading-none">{jobAnalysis.score}</div>
                        <div className="mt-1 text-[10px] uppercase tracking-[0.2em] text-white/70">score</div>
                      </div>
                    </div>

                    <div className="paper-card mt-4 text-sm text-[#071e27]">
                      <p className="title-display text-sm font-medium text-[#071e27]">Recomendación</p>
                      <p className="mt-2 leading-6">
                        {jobAnalysis.recommended
                          ? "Sí hay match. Vale la pena aplicar y adaptar el CV a esta vacante."
                          : "Hay match parcial. Conviene reforzar el CV antes de aplicar."}
                      </p>
                    </div>

                    <div className="paper-card mt-4 text-sm text-[#071e27]">
                      <p className="title-display text-sm font-medium text-[#071e27]">Fortalezas</p>
                      <p className="mt-2 leading-6">{jobAnalysis.strengths.join(" ") || "Sin fortalezas claras todavía."}</p>
                    </div>

                    <div className="paper-card mt-3 text-sm text-[#071e27]">
                      <p className="title-display text-sm font-medium text-[#071e27]">Brechas</p>
                      <p className="mt-2 leading-6">{jobAnalysis.gaps.join(" ") || "No detecté brechas críticas."}</p>
                    </div>

                    <div className="paper-card mt-3 text-sm text-[#071e27]">
                      <p className="title-display text-sm font-medium text-[#071e27]">Qué mejorar en tu CV</p>
                      <div className="mt-2 space-y-2">
                        {(jobAnalysis.suggestedActions || []).length ? (
                          jobAnalysis.suggestedActions.map((action, index) => (
                            <div key={`${action}-${index}`} className="rounded-2xl bg-[#eef8fd] px-3 py-2 leading-6 text-[#4d6570]">
                              {action}
                            </div>
                          ))
                        ) : (
                          <p className="leading-6 text-[#4d6570]">No encontré mejoras urgentes. Puedes aplicar con tu versión actual.</p>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="label-ui mt-3 text-sm leading-6">
                    Aquí verás el score, si conviene aplicar y qué deberías incluir o reforzar en tu CV.
                  </p>
                )}
              </div>
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}
