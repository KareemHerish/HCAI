/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { KnowledgeChunk, Language, ProcessedQuery, RetrievedChunk } from '../types.js';
import {
  computeLocalMultilingualEmbedding,
  cosineSimilarity,
  embedTextsWithGemini,
} from './embeddings.js';
import { normalizeTextForSearch } from './queryProcessor.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function resolveDataPath(...segments: string[]): string {
  const fromCwd = path.resolve(process.cwd(), ...segments);
  if (fs.existsSync(fromCwd)) return fromCwd;
  const fromModuleRoot = path.resolve(__dirname, '..', '..', ...segments);
  if (fs.existsSync(fromModuleRoot)) return fromModuleRoot;
  return fromCwd;
}

const KB_CHUNKS_PATH = resolveDataPath('data', 'knowledge_base', 'chunks.json');
const VECTOR_INDEX_PATH = resolveDataPath('data', 'vector_store', 'index.json');
const GEMINI_VECTORS_PATH = resolveDataPath('data', 'vector_store', 'gemini_vectors.json');

interface VectorIndexFile {
  version: string;
  embedding_dim: number;
  created_at: string;
  total_chunks: number;
  vectors: Record<string, number[]>;
}

const STOPWORDS = new Set([
  'the', 'is', 'are', 'was', 'were', 'what', 'which', 'who', 'whom', 'how', 'does', 'do', 'did',
  'can', 'could', 'would', 'should', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'for',
  'with', 'by', 'as', 'at', 'from', 'it', 'its', 'this', 'that', 'these', 'those', 'be', 'been',
  'about', 'into', 'than', 'then', 'there', 'their', 'they', 'have', 'has', 'had', 'may', 'might',
  'ما', 'هي', 'هو', 'هم', 'هن', 'من', 'في', 'علي', 'على', 'الي', 'إلى', 'عن', 'مع', 'او', 'أو',
  'و', 'ف', 'ب', 'ل', 'ك', 'هل', 'كيف', 'لماذا', 'متي', 'متى', 'اين', 'أين', 'ايه', 'ازاي',
  'التي', 'الذي', 'الذين', 'هذا', 'هذه', 'ذلك', 'تلك', 'كان', 'تكون', 'يكون', 'قد', 'بين',
]);

export function tokenizeForBm25(text: string): string[] {
  const norm = normalizeTextForSearch(text);
  return norm
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
}

export interface RetrievalOptions {
  topK?: number;
  relevanceThreshold?: number;
  sourceFilter?: string[];
  preferredLanguage?: Language;
}

class LocalHybridVectorStore {
  private chunks: KnowledgeChunk[] = [];
  private chunkMap = new Map<string, KnowledgeChunk>();
  private localVectors = new Map<string, number[]>();
  private geminiVectors = new Map<string, number[]>();
  private tokenizedDocs = new Map<string, string[]>();
  private docTermFreqs = new Map<string, Map<string, number>>();
  private idf = new Map<string, number>();
  private avgDocLen = 100;
  private isLoaded = false;
  private isGeminiIndexing = false;

  public load(): void {
    if (this.isLoaded) return;

    if (!fs.existsSync(KB_CHUNKS_PATH)) {
      console.warn(`Knowledge base chunks file not found at ${KB_CHUNKS_PATH}. Run npm run ingest.`);
      this.chunks = [];
      this.isLoaded = true;
      return;
    }

    const rawChunks = fs.readFileSync(KB_CHUNKS_PATH, 'utf-8');
    this.chunks = JSON.parse(rawChunks) as KnowledgeChunk[];
    this.chunkMap.clear();
    for (const c of this.chunks) {
      this.chunkMap.set(c.chunk_id, c);
    }

    // Load local persistent vectors
    if (fs.existsSync(VECTOR_INDEX_PATH)) {
      const idx = JSON.parse(fs.readFileSync(VECTOR_INDEX_PATH, 'utf-8')) as VectorIndexFile;
      for (const [id, vec] of Object.entries(idx.vectors || {})) {
        this.localVectors.set(id, vec);
      }
    }

    // Ensure every chunk has a vector
    for (const chunk of this.chunks) {
      if (!this.localVectors.has(chunk.chunk_id)) {
        const textForEmbed = `${chunk.title} ${chunk.section_heading || ''} ${chunk.text}`;
        this.localVectors.set(chunk.chunk_id, computeLocalMultilingualEmbedding(textForEmbed));
      }
    }

    // Load cached Gemini neural embeddings if previously generated
    if (fs.existsSync(GEMINI_VECTORS_PATH)) {
      try {
        const gData = JSON.parse(fs.readFileSync(GEMINI_VECTORS_PATH, 'utf-8')) as Record<
          string,
          number[]
        >;
        for (const [id, vec] of Object.entries(gData)) {
          this.geminiVectors.set(id, vec);
        }
      } catch {
        // Ignore corrupt optional cache
      }
    }

    // Build BM25 statistics
    this.buildBm25Index();
    this.isLoaded = true;

    // Optional non-blocking background Gemini embedding warmup (opt-in to preserve API quota/latency)
    if (process.env.ENABLE_GEMINI_EMBED_WARMUP === 'true') {
      this.warmGeminiEmbeddingsInBackground();
    }
  }

  public reload(): void {
    this.isLoaded = false;
    this.localVectors.clear();
    this.geminiVectors.clear();
    this.tokenizedDocs.clear();
    this.docTermFreqs.clear();
    this.idf.clear();
    this.load();
  }

  private buildBm25Index(): void {
    const N = this.chunks.length || 1;
    const df = new Map<string, number>();
    let totalLen = 0;

    for (const chunk of this.chunks) {
      const combined = `${chunk.title} ${chunk.title} ${chunk.section_heading || ''} ${(chunk.keywords || []).join(' ')} ${chunk.text}`;
      const tokens = tokenizeForBm25(combined);
      this.tokenizedDocs.set(chunk.chunk_id, tokens);
      totalLen += tokens.length;

      const tf = new Map<string, number>();
      const seen = new Set<string>();
      for (const t of tokens) {
        tf.set(t, (tf.get(t) || 0) + 1);
        if (!seen.has(t)) {
          seen.add(t);
          df.set(t, (df.get(t) || 0) + 1);
        }
      }
      this.docTermFreqs.set(chunk.chunk_id, tf);
    }

    this.avgDocLen = Math.max(1, totalLen / N);
    for (const [term, freq] of df.entries()) {
      this.idf.set(term, Math.log(1 + (N - freq + 0.5) / (freq + 0.5)));
    }
  }

  private warmGeminiEmbeddingsInBackground(): void {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') return;
    if (this.isGeminiIndexing || this.chunks.length === 0) return;
    if (this.geminiVectors.size >= this.chunks.length) return;

    this.isGeminiIndexing = true;
    (async () => {
      try {
        const missing = this.chunks.filter((c) => !this.geminiVectors.has(c.chunk_id));
        const batchSize = 80;
        for (let i = 0; i < missing.length; i += batchSize) {
          const batch = missing.slice(i, i + batchSize);
          const texts = batch.map(
            (c) => `${c.title}\n${c.section_heading ? c.section_heading + '\n' : ''}${c.text}`
          );
          const vecs = await embedTextsWithGemini(texts);
          if (!vecs) break; // Stop gracefully if quota/key unavailable
          batch.forEach((c, idx) => {
            this.geminiVectors.set(c.chunk_id, vecs[idx]);
          });
        }

        if (this.geminiVectors.size > 0) {
          fs.mkdirSync(path.dirname(GEMINI_VECTORS_PATH), { recursive: true });
          const serialized: Record<string, number[]> = {};
          for (const [k, v] of this.geminiVectors.entries()) {
            serialized[k] = v;
          }
          fs.writeFileSync(GEMINI_VECTORS_PATH, JSON.stringify(serialized));
        }
      } catch {
        // Non-fatal; local multilingual vectors remain active
      } finally {
        this.isGeminiIndexing = false;
      }
    })();
  }

  private computeBm25Score(chunkId: string, queryTokens: string[]): { score: number; matched: string[] } {
    const tf = this.docTermFreqs.get(chunkId);
    const tokens = this.tokenizedDocs.get(chunkId);
    if (!tf || !tokens) return { score: 0, matched: [] };

    const k1 = 1.5;
    const b = 0.75;
    const docLen = tokens.length;
    let score = 0;
    const matched: string[] = [];

    const uniqueQueryTokens = Array.from(new Set(queryTokens));
    for (const term of uniqueQueryTokens) {
      const freq = tf.get(term) || 0;
      if (freq > 0) {
        matched.push(term);
        const idfVal = this.idf.get(term) || 0.5;
        const num = freq * (k1 + 1);
        const den = freq + k1 * (1 - b + b * (docLen / this.avgDocLen));
        score += idfVal * (num / den);
      }
    }

    return { score, matched };
  }

  public async retrieve(
    processedQuery: ProcessedQuery,
    options: RetrievalOptions = {}
  ): Promise<RetrievedChunk[]> {
    this.load();
    if (this.chunks.length === 0) return [];

    const topK = options.topK ?? 5;
    const threshold = options.relevanceThreshold ?? 0.24;
    const sourceFilterSet = options.sourceFilter?.length
      ? new Set(options.sourceFilter.map((s) => s.toLowerCase()))
      : null;

    // 1. Compute query embedding (try Gemini embedding if all chunks have Gemini vectors, else local multilingual)
    const hasFullGeminiVectors = this.geminiVectors.size >= this.chunks.length * 0.9;
    let queryGeminiVec: number[] | null = null;
    if (hasFullGeminiVectors) {
      const res = await embedTextsWithGemini([processedQuery.retrievalQuery]);
      if (res && res[0]) queryGeminiVec = res[0];
    }
    const queryLocalVec = computeLocalMultilingualEmbedding(processedQuery.retrievalQuery);
    const queryTokens = tokenizeForBm25(processedQuery.retrievalQuery);
    const rawTokens = tokenizeForBm25(processedQuery.normalizedQuery);

    // 2. Score all candidate chunks
    const candidates: RetrievedChunk[] = [];
    let maxBm25 = 0.0001;

    const rawScores = this.chunks
      .filter((chunk) => {
        if (sourceFilterSet && !sourceFilterSet.has(chunk.source_name.toLowerCase())) {
          return false;
        }
        return true;
      })
      .map((chunk) => {
        const gVec = queryGeminiVec ? this.geminiVectors.get(chunk.chunk_id) : undefined;
        const vecScore =
          queryGeminiVec && gVec
            ? cosineSimilarity(queryGeminiVec, gVec)
            : cosineSimilarity(queryLocalVec, this.localVectors.get(chunk.chunk_id) || []);

        const bm25Res = this.computeBm25Score(chunk.chunk_id, queryTokens);
        if (bm25Res.score > maxBm25) maxBm25 = bm25Res.score;

        // Title / keyword exact boost
        const normTitle = normalizeTextForSearch(chunk.title);
        let titleBoost = 0;
        for (const rt of rawTokens) {
          if (rt.length >= 3 && normTitle.includes(rt)) {
            titleBoost += 0.14;
          }
        }
        for (const exp of processedQuery.expandedTerms) {
          const normExp = normalizeTextForSearch(exp);
          if (normExp && normTitle === normExp) {
            titleBoost += 0.22;
          } else if (normExp && normTitle.includes(normExp)) {
            titleBoost += 0.1;
          }
        }

        // Mild preference for chunks matching response language while preserving cross-lingual evidence
        const langBoost =
          chunk.language === processedQuery.responseLanguage ? 0.06 : 0;

        return {
          chunk,
          vecScore,
          bm25Raw: bm25Res.score,
          matched: bm25Res.matched,
          titleBoost: Math.min(titleBoost, 0.35),
          langBoost,
        };
      });

    for (const item of rawScores) {
      const bm25Norm = item.bm25Raw / maxBm25;
      // Hybrid score combining dense vector similarity (50%), normalized BM25 (35%), and title/language alignment (15%)
      const hybridScore = Number(
        (
          item.vecScore * 0.5 +
          bm25Norm * 0.35 +
          item.titleBoost +
          item.langBoost
        ).toFixed(4)
      );

      if (hybridScore >= threshold && (item.matched.length > 0 || item.vecScore >= 0.42)) {
        candidates.push({
          ...item.chunk,
          vectorScore: Number(item.vecScore.toFixed(4)),
          bm25Score: Number(bm25Norm.toFixed(4)),
          hybridScore,
          matchedTerms: item.matched,
        });
      }
    }

    // 3. Sort descending by hybridScore
    candidates.sort((a, b) => b.hybridScore - a.hybridScore);

    // 4. Deduplicate by document_id (max 2 chunks per document) and near-identical text prefix
    const selected: RetrievedChunk[] = [];
    const docCounts = new Map<string, number>();
    const seenSnippets = new Set<string>();

    for (const cand of candidates) {
      const snippetKey = normalizeTextForSearch(cand.text).slice(0, 120);
      if (seenSnippets.has(snippetKey)) continue;

      const count = docCounts.get(cand.document_id) || 0;
      if (count >= 2) continue;

      seenSnippets.add(snippetKey);
      docCounts.set(cand.document_id, count + 1);
      selected.push(cand);

      if (selected.length >= topK) break;
    }

    return selected;
  }

  public getStats() {
    this.load();
    const bySource: Record<string, number> = {};
    const byLanguage: Record<string, number> = { ar: 0, en: 0 };
    const docIds = new Set<string>();

    for (const c of this.chunks) {
      bySource[c.source_name] = (bySource[c.source_name] || 0) + 1;
      byLanguage[c.language] = (byLanguage[c.language] || 0) + 1;
      docIds.add(c.document_id);
    }

    return {
      totalDocuments: docIds.size,
      totalChunks: this.chunks.length,
      localVectorCount: this.localVectors.size,
      geminiVectorCount: this.geminiVectors.size,
      bySource,
      byLanguage,
    };
  }
}

export const vectorStore = new LocalHybridVectorStore();
