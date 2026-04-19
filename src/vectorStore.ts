/**
 * vectorStore.ts — File-backed vector store for rag-retriever.
 * Reads from the same path that doc-ingestion writes to.
 * In production: swap for AWS S3 Vectors or OpenSearch.
 */
import fs from "fs";
import { cosineSimilarity } from "./embeddings.js";

const STORE_PATH = process.env.VECTOR_STORE_PATH ?? "./vector-store.json";

export interface VectorRecord {
  id: string;
  text: string;
  embedding: number[];
  metadata: {
    clientId?: string;
    docType?: string;
    source?: string;
    chunkIndex?: number;
    ingestedAt?: string;
    [key: string]: unknown;
  };
}

export function loadVectorStore(): VectorRecord[] {
  try {
    if (fs.existsSync(STORE_PATH)) {
      return JSON.parse(fs.readFileSync(STORE_PATH, "utf-8")) as VectorRecord[];
    }
  } catch { /* ignore */ }
  return [];
}

export function searchByEmbedding(
  queryEmbedding: number[],
  records: VectorRecord[],
  topK: number,
  filter?: (r: VectorRecord) => boolean,
): Array<VectorRecord & { score: number }> {
  const scored = records
    .filter(filter ?? (() => true))
    .map(r => ({ ...r, score: cosineSimilarity(queryEmbedding, r.embedding) }))
    .filter(r => r.score > 0.1);

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}

/** Max Marginal Relevance: balance relevance with diversity. */
export function mmrRerank(
  query: number[],
  candidates: Array<VectorRecord & { score: number }>,
  topK: number,
  lambda = 0.5,
): Array<VectorRecord & { score: number }> {
  if (candidates.length <= topK) return candidates;

  const selected: Array<VectorRecord & { score: number }> = [];
  const remaining = [...candidates];

  while (selected.length < topK && remaining.length > 0) {
    let bestIdx = 0;
    let bestScore = -Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const relevance = remaining[i].score;
      const redundancy = selected.length > 0
        ? Math.max(...selected.map(s => cosineSimilarity(remaining[i].embedding, s.embedding)))
        : 0;
      const mmrScore = lambda * relevance - (1 - lambda) * redundancy;
      if (mmrScore > bestScore) { bestScore = mmrScore; bestIdx = i; }
    }

    selected.push(remaining[bestIdx]);
    remaining.splice(bestIdx, 1);
  }

  return selected;
}
