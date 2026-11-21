/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface ApprovedSourceSpec {
  id: string;
  name: string;
  allowedDomains: string[];
  baseUrl: string | null;
  licenseNote: string;
}

export const APPROVED_SOURCES: Record<string, ApprovedSourceSpec> = {
  MEDLINEPLUS: {
    id: 'medlineplus',
    name: 'MedlinePlus',
    allowedDomains: ['medlineplus.gov'],
    baseUrl: 'https://medlineplus.gov/healthtopics.html',
    licenseNote: 'U.S. National Library of Medicine (NIH) — Public Domain health education',
  },
  ARABIC_PILE_MEDICAL: {
    id: 'arabic_pile_medical',
    name: 'TheArabicPile_Medical (premio-ai)',
    allowedDomains: [],
    baseUrl: null,
    licenseNote: 'Hugging Face dataset premio-ai/TheArabicPile_Medical (educational subsets)',
  },
  WHO: {
    id: 'who',
    name: 'World Health Organization (WHO)',
    allowedDomains: ['who.int', 'www.who.int'],
    baseUrl: 'https://www.who.int/news-room/fact-sheets',
    licenseNote: 'WHO Fact Sheets (English & Arabic)',
  },
  NHS: {
    id: 'nhs',
    name: 'NHS',
    allowedDomains: ['nhs.uk', 'www.nhs.uk'],
    baseUrl: 'https://www.nhs.uk/conditions/',
    licenseNote: 'UK National Health Service Conditions',
  },
  CDC: {
    id: 'cdc',
    name: 'CDC',
    allowedDomains: ['cdc.gov', 'www.cdc.gov'],
    baseUrl: 'https://www.cdc.gov/',
    licenseNote: 'U.S. Centers for Disease Control and Prevention',
  },
  NCBI_BOOKSHELF: {
    id: 'ncbi_bookshelf',
    name: 'NCBI Bookshelf',
    allowedDomains: ['ncbi.nlm.nih.gov', 'www.ncbi.nlm.nih.gov'],
    baseUrl: 'https://www.ncbi.nlm.nih.gov/books/',
    licenseNote: 'NCBI Bookshelf / InformedHealth.org open educational texts',
  },
};

const ALLOWLIST_NAMES = new Set(Object.values(APPROVED_SOURCES).map((s) => s.name));
const ALLOWLIST_DOMAINS = new Set(
  Object.values(APPROVED_SOURCES).flatMap((s) => s.allowedDomains)
);

export function isAllowedSourceName(sourceName: string): boolean {
  return ALLOWLIST_NAMES.has(sourceName);
}

export function isAllowedSourceUrl(url: string | null): boolean {
  if (url === null) return true; // Dataset records without URLs are allowed with dataset + record_id
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
    const host = parsed.hostname.toLowerCase();
    for (const domain of ALLOWLIST_DOMAINS) {
      if (host === domain || host.endsWith(`.${domain}`)) {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}
