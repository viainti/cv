"use client";

import JSZip from "jszip";

let pdfWorkerReady = false;

export async function extractCvTextFromFile(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase() || "";

  if (extension === "pdf") {
    return extractPdfText(file);
  }

  if (extension === "docx") {
    return extractDocxText(file);
  }

  const rawText = await file.text();
  return normalizeText(rawText);
}

async function extractPdfText(file: File) {
  const pdfjs = await import("pdfjs-dist/build/pdf.mjs");

  if (!pdfWorkerReady) {
    pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.mjs";
    pdfWorkerReady = true;
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjs.getDocument({ data: bytes }).promise;
  const pages: string[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map((item) => ("str" in item ? item.str : "")).join(" ");
    pages.push(pageText);
  }

  return normalizeText(pages.join("\n"));
}

async function extractDocxText(file: File) {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const documentXml = await zip.file("word/document.xml")?.async("string");

  if (!documentXml) {
    throw new Error("No se pudo leer el contenido del archivo DOCX.");
  }

  const xmlText = documentXml
    .replace(/<w:p[^>]*>/g, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

  return normalizeText(xmlText);
}

function normalizeText(value: string) {
  return value.replace(/\s+\n/g, "\n").replace(/\n{3,}/g, "\n\n").replace(/[ \t]{2,}/g, " ").trim();
}
