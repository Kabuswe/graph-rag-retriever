/**
 * embeddings.ts — Local embeddings using @xenova/transformers.
 * Shared between graph-rag-retriever and graph-doc-ingestion.
 */
let pipeline: ((texts: string[], options?: Record<string, unknown>) => Promise<unknown[]>) | null = null;

async function getEmbeddingPipeline() {
  if (pipeline) return pipeline;
  const { pipeline: p } = await import("@xenova/transformers") as {
    pipeline: (task: string, model: string) => Promise<(texts: string[], opts?: Record<string, unknown>) => Promise<unknown[]>>
  };
  pipeline = await p("feature-extraction", "Xenova/all-MiniLM-L6-v2");
  return pipeline;
}

export async function embedText(text: string): Promise<number[]> {
  const pipe = await getEmbeddingPipeline();
  const out = await pipe([text], { pooling: "mean", normalize: true });
  const first = out[0] as { data: Float32Array } | Float32Array | number[];
  if ("data" in first) return Array.from((first as { data: Float32Array }).data);
  if (first instanceof Float32Array) return Array.from(first);
  return first as number[];
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  return Promise.all(texts.map(embedText));
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB) + 1e-10);
}
