/**
 * cv-ai-parser.ts
 * Extrae ubicación (país/ciudad) del CV usando IA con OpenRouter
 * Mejora la detección de ubicación para búsquedas más precisas
 */

import { DEFAULT_MODEL, DEFAULT_OPENROUTER_API_KEY } from "../config.js";

export interface LocationExtraction {
  country: string;
  city: string;
  state: string;
  confidence: number; // 0-1
  extractedAt: number;
  method: "ai" | "regex" | "manual";
}

const COUNTRY_KEYWORDS: Record<string, string[]> = {
  "Switzerland": ["zürich", "zurich", "bern", "genève", "geneva", "basel", "basilea", "luzern", "lugano", "zug", "ch", "suiza", "suisse", "svizzera"],
  "Spain": ["madrid", "barcelona", "valencia", "sevilla", "bilbao", "malaga", "murcia", "palma", "es", "españa"],
  "United States": ["new york", "los angeles", "chicago", "houston", "phoenix", "philadelphia", "san antonio", "san diego", "dallas", "san jose", "us", "usa", "america"],
  "Germany": ["berlin", "munich", "cologne", "hamburgo", "hamburg", "frankfurt", "düsseldorf", "dusseldorf", "de", "deutschland"],
  "France": ["paris", "marseille", "lyon", "toulouse", "nice", "nantes", "fr", "france"],
  "United Kingdom": ["london", "manchester", "birmingham", "leeds", "glasgow", "edinburgh", "uk", "britain"],
  "Italy": ["roma", "rome", "milano", "milan", "napoli", "naples", "torino", "turin", "genova", "genoa", "it", "italia"],
  "Netherlands": ["amsterdam", "rotterdam", "the hague", "den haag", "utrecht", "groningen", "nl", "netherlands"],
  "Belgium": ["brussels", "antwerp", "ghent", "charleroi", "be", "belgium"],
  "Portugal": ["lisbon", "porto", "pt", "portugal"],
  "Poland": ["warsaw", "krakow", "gdańsk", "gdansk", "poznan", "wroclaw", "pl", "poland"],
  "Czech Republic": ["prague", "brno", "ostrava", "plzeň", "plzen", "cz"],
  "Austria": ["vienna", "wien", "graz", "linz", "salzburg", "at", "austria"],
  "Canada": ["toronto", "vancouver", "montreal", "calgary", "edmonton", "ottawa", "ca", "canada"],
  "Australia": ["sydney", "melbourne", "brisbane", "perth", "adelaide", "canberra", "au", "australia"],
  "Singapore": ["singapore", "sg"],
  "Japan": ["tokyo", "osaka", "yokohama", "nagoya", "sapporo", "jp", "japan"],
  "South Korea": ["seoul", "busan", "daegu", "incheon", "kr", "korea"],
  "India": ["bangalore", "bengaluru", "delhi", "mumbai", "hyderabad", "pune", "in", "india"],
  "Mexico": ["mexico city", "cdmx", "monterrey", "guadalajara", "mx", "mexico"],
  "Brazil": ["são paulo", "sao paulo", "rio de janeiro", "belo horizonte", "br", "brazil"],
  "Argentina": ["buenos aires", "córdoba", "cordoba", "rosario", "ar", "argentina"],
  "Colombia": ["bogotá", "bogota", "medellín", "medellin", "cali", "co", "colombia"],
  "Chile": ["santiago", "valparaíso", "valparaiso", "concepción", "concepcion", "cl", "chile"],
};

const COUNTRY_CODES: Record<string, string> = {
  "ch": "Switzerland",
  "es": "Spain",
  "us": "United States",
  "de": "Germany",
  "fr": "France",
  "uk": "United Kingdom",
  "gb": "United Kingdom",
  "it": "Italy",
  "nl": "Netherlands",
  "be": "Belgium",
  "pt": "Portugal",
  "pl": "Poland",
  "cz": "Czech Republic",
  "at": "Austria",
  "ca": "Canada",
  "au": "Australia",
  "sg": "Singapore",
  "jp": "Japan",
  "kr": "South Korea",
  "in": "India",
  "mx": "Mexico",
  "br": "Brazil",
  "ar": "Argentina",
  "co": "Colombia",
  "cl": "Chile",
};

/**
 * Extrae ubicación usando IA via OpenRouter
 */
export async function extractLocationWithAI(
  cvText: string
): Promise<LocationExtraction> {
  const apiKey = DEFAULT_OPENROUTER_API_KEY;
  
  if (!apiKey || !cvText) {
    return fallbackLocationExtraction(cvText);
  }

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        messages: [
          {
            role: "user",
            content: `Analiza este CV y extrae la ubicación principal (país y ciudad). 
            
Retorna SOLO un JSON válido (sin markdown) con este formato:
{
  "country": "nombre del país completo en inglés",
  "city": "nombre de la ciudad",
  "state": "región/provincia o vacío si no aplica",
  "confidence": 0.8
}

Si no encuentras ubicación clara, usa null para los campos desconocidos.
Confidence: 0.9+ si está muy claro, 0.7-0.8 si es probable, 0.5-0.6 si es incierto.

CV:
${cvText.substring(0, 2000)}`,
          },
        ],
        temperature: 0.3,
        max_tokens: 200,
      }),
    });

    if (!response.ok) {
      console.error("[v0] OpenRouter API error:", response.statusText);
      return fallbackLocationExtraction(cvText);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

    // Parsear respuesta JSON
    let parsed;
    try {
      // Limpiar markdown si existe
      const jsonStr = content.replace(/```json\n?|\n?```/g, "").trim();
      parsed = JSON.parse(jsonStr);
    } catch (e) {
      console.error("[v0] Failed to parse AI response:", e);
      return fallbackLocationExtraction(cvText);
    }

    return {
      country: parsed.country || "",
      city: parsed.city || "",
      state: parsed.state || "",
      confidence: Math.min(Math.max(parsed.confidence || 0, 0), 1),
      extractedAt: Date.now(),
      method: "ai",
    };
  } catch (error) {
    console.error("[v0] CV location extraction error:", error);
    return fallbackLocationExtraction(cvText);
  }
}

/**
 * Fallback: extrae ubicación usando regex y keywords
 */
export function fallbackLocationExtraction(cvText: string): LocationExtraction {
  const lowerText = cvText.toLowerCase();
  let detectedCountry = "";
  let detectedCity = "";
  let confidence = 0;

  // Buscar países por keywords
  for (const [country, keywords] of Object.entries(COUNTRY_KEYWORDS)) {
    const matches = keywords.filter(kw => lowerText.includes(kw)).length;
    if (matches > 0) {
      detectedCountry = country;
      confidence = Math.min(matches * 0.15, 0.8);
      break;
    }
  }

  // Buscar códigos de país (ej: "Switzerland (CH)")
  if (!detectedCountry) {
    const codeMatch = cvText.match(/\b([A-Z]{2})\b/g);
    if (codeMatch) {
      for (const code of codeMatch) {
        const country = COUNTRY_CODES[code.toLowerCase()];
        if (country) {
          detectedCountry = country;
          confidence = 0.6;
          break;
        }
      }
    }
  }

  // Buscar patrón "City, Country"
  const locationPattern = /(?:Based in|Located in|From|Live in|Zurich|Barcelona|Madrid|London|Paris|Berlin|Toronto|Sydney|Singapore|Tokyo)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?),?\s*([A-Z]{2})?/i;
  const locationMatch = cvText.match(locationPattern);
  if (locationMatch) {
    detectedCity = locationMatch[1];
    if (locationMatch[2]) {
      detectedCountry = COUNTRY_CODES[locationMatch[2].toLowerCase()] || detectedCountry;
    }
    confidence = 0.7;
  }

  return {
    country: detectedCountry,
    city: detectedCity,
    state: "",
    confidence: Math.min(confidence, 0.95),
    extractedAt: Date.now(),
    method: "regex",
  };
}

/**
 * Busca país en una lista de strings (ej: resultados de búsqueda)
 */
export function detectCountryFromList(items: string[]): string {
  const combined = items.join(" ").toLowerCase();
  
  for (const [country, keywords] of Object.entries(COUNTRY_KEYWORDS)) {
    const matches = keywords.filter(kw => combined.includes(kw)).length;
    if (matches > 0) {
      return country;
    }
  }
  
  return "";
}

/**
 * Crea un cache key para resultados de ubicación
 */
export function createLocationCacheKey(cvFileName: string): string {
  return `cv_location_${btoa(cvFileName).replace(/=/g, "")}`;
}

/**
 * Obtiene ubicación cacheada o extrae nueva
 */
export async function getOrExtractLocation(
  cvText: string,
  cvFileName: string,
  useCache = true
): Promise<LocationExtraction> {
  if (useCache) {
    const cached = await getLocationFromStorage(cvFileName);
    if (cached && Date.now() - cached.extractedAt < 30 * 24 * 60 * 60 * 1000) {
      // Cache válido por 30 días
      return cached;
    }
  }

  const location = await extractLocationWithAI(cvText);
  
  // Guardar en storage
  try {
    await saveLocationToStorage(cvFileName, location);
  } catch (e) {
    console.warn("[v0] Failed to cache location:", e);
  }

  return location;
}

/**
 * Guarda ubicación en chrome storage
 */
export async function saveLocationToStorage(
  cvFileName: string,
  location: LocationExtraction
): Promise<void> {
  const key = createLocationCacheKey(cvFileName);
  const data: Record<string, LocationExtraction> = {};
  data[key] = location;
  
  return new Promise((resolve) => {
    chrome.storage.local.set(data, resolve);
  });
}

/**
 * Obtiene ubicación del storage
 */
export async function getLocationFromStorage(
  cvFileName: string
): Promise<LocationExtraction | null> {
  const key = createLocationCacheKey(cvFileName);
  
  return new Promise((resolve) => {
    chrome.storage.local.get([key], (result) => {
      resolve(result[key] || null);
    });
  });
}
