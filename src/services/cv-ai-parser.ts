import { CVData, ApiResponse } from '../types';

interface LocationDetectionResult {
  country: string;
  city: string;
  state: string;
  confidence: number;
}

const COUNTRY_KEYWORDS: Record<string, string[]> = {
  US: ['USA', 'United States', 'US', 'America', 'New York', 'California', 'Texas'],
  CH: ['Switzerland', 'Zurich', 'Geneva', 'Bern', 'Lausanne', 'Basel'],
  ES: ['Spain', 'Spain', 'Madrid', 'Barcelona', 'Valencia', 'Seville'],
  DE: ['Germany', 'Berlin', 'Munich', 'Hamburg', 'Frankfurt', 'Cologne'],
  UK: ['United Kingdom', 'UK', 'England', 'London', 'Manchester', 'Liverpool'],
  CA: ['Canada', 'Toronto', 'Vancouver', 'Montreal', 'Calgary'],
  FR: ['France', 'Paris', 'Lyon', 'Marseille', 'Toulouse'],
  BR: ['Brazil', 'São Paulo', 'Rio de Janeiro', 'Brasília'],
  MX: ['Mexico', 'Mexico City', 'Guadalajara', 'Cancun'],
  AR: ['Argentina', 'Buenos Aires', 'Córdoba', 'Rosario'],
};

/**
 * CV AI Parser Service
 * Extracts structured data from CV text using AI and regex patterns
 */
export const cvAIParser = {
  /**
   * Extract location information from CV text
   */
  async extractLocation(cvText: string): Promise<LocationDetectionResult> {
    // Try AI first (if configured)
    const aiResult = await this.tryAIExtraction(cvText);
    if (aiResult) return aiResult;

    // Fallback to regex
    return this.extractLocationWithRegex(cvText);
  },

  /**
   * Try to use OpenRouter API for extraction
   */
  async tryAIExtraction(cvText: string): Promise<LocationDetectionResult | null> {
    try {
      const apiKey = await this.getOpenRouterKey();
      if (!apiKey) return null;

      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-3.5-turbo',
          messages: [
            {
              role: 'user',
              content: `Extract the location (city, state, country) from this CV. Return JSON only:
${cvText.substring(0, 1000)}

Return format: {"country": "...", "city": "...", "state": "...", "confidence": 0.0-1.0}`,
            },
          ],
          max_tokens: 200,
        }),
      });

      if (!response.ok) return null;

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      if (!content) return null;

      const parsed = JSON.parse(content);
      return {
        country: parsed.country || 'Unknown',
        city: parsed.city || '',
        state: parsed.state || '',
        confidence: parsed.confidence || 0.7,
      };
    } catch (error) {
      console.warn('[CVParser] AI extraction failed, falling back to regex', error);
      return null;
    }
  },

  /**
   * Extract location using regex patterns
   */
  extractLocationWithRegex(cvText: string): LocationDetectionResult {
    let bestMatch: LocationDetectionResult = {
      country: 'Unknown',
      city: '',
      state: '',
      confidence: 0.3,
    };

    // Check for country keywords
    for (const [country, keywords] of Object.entries(COUNTRY_KEYWORDS)) {
      for (const keyword of keywords) {
        if (cvText.toLowerCase().includes(keyword.toLowerCase())) {
          bestMatch.country = country;
          bestMatch.confidence = Math.min(1.0, bestMatch.confidence + 0.3);
          break;
        }
      }
    }

    // Try to extract city from common patterns
    const cityPattern = /(?:based in|located in|from|city|ciudad):\s*([A-Z][a-z]+)/gi;
    const cityMatch = cityPattern.exec(cvText);
    if (cityMatch) {
      bestMatch.city = cityMatch[1];
      bestMatch.confidence = Math.min(1.0, bestMatch.confidence + 0.2);
    }

    return bestMatch;
  },

  /**
   * Extract all CV data
   */
  async extractCVData(cvText: string, fileName: string): Promise<Partial<CVData>> {
    const location = await this.extractLocation(cvText);

    return {
      fileName,
      content: cvText,
      uploadedAt: Date.now(),
      extractedData: {
        location: {
          ...location,
        },
        skills: this.extractSkills(cvText),
        experience: this.extractExperience(cvText),
        education: this.extractEducation(cvText),
      },
    };
  },

  extractSkills(text: string): string[] {
    const skillKeywords = [
      'JavaScript',
      'TypeScript',
      'React',
      'Vue',
      'Angular',
      'Node.js',
      'Python',
      'Java',
      'C#',
      'SQL',
      'MongoDB',
      'Firebase',
      'Docker',
      'Git',
      'AWS',
      'Azure',
      'GCP',
    ];

    return skillKeywords.filter(
      (skill) =>
        text.toLowerCase().includes(skill.toLowerCase()) ||
        text.includes(skill)
    );
  },

  extractExperience(text: string): Array<{ title: string; company: string; duration: string }> {
    const experiences = [];
    const expPattern =
      /(?:job title|position|role):\s*([^\n]+)\s+(?:at|company):\s*([^\n]+)/gi;

    let match;
    while ((match = expPattern.exec(text)) !== null) {
      experiences.push({
        title: match[1].trim(),
        company: match[2].trim(),
        duration: '',
      });
    }

    return experiences;
  },

  extractEducation(text: string): Array<{ degree: string; school: string; year?: string }> {
    const education = [];
    const eduPattern = /(?:degree|education):\s*([^\n]+)\s+(?:from|at):\s*([^\n]+)/gi;

    let match;
    while ((match = eduPattern.exec(text)) !== null) {
      education.push({
        degree: match[1].trim(),
        school: match[2].trim(),
      });
    }

    return education;
  },

  async getOpenRouterKey(): Promise<string | null> {
    try {
      const { openRouterKey } = await chrome.storage.local.get('openRouterKey');
      return openRouterKey || null;
    } catch {
      return null;
    }
  },
};
