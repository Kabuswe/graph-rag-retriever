/**
 * formatContext — formats ranked chunks into an LLM-consumable context string.
 */

interface Chunk {
  id: string;
  text: string;
  score?: number;
  metadata?: {
    source?: string;
    docType?: string;
    chunkIndex?: number;
    [key: string]: unknown;
  };
}

function buildContextString(chunks: Chunk[]): string {
  return chunks
    .map((chunk, idx) => {
      const source = chunk.metadata?.source ? ` | source: ${chunk.metadata.source}` : "";
      const score = typeof chunk.score === "number" ? ` | score: ${chunk.score.toFixed(3)}` : "";
      return `[${idx + 1}]${source}${score}\n${chunk.text}`;
    })
    .join("\n\n---\n\n");
}

function buildSourceList(chunks: Chunk[]): string[] {
  return [...new Set(
    chunks
      .map(c => c.metadata?.source)
      .filter((s): s is string => typeof s === "string" && s.length > 0),
  )];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const formatContextNode = async (state: any) => {
  const { rankedChunks, query } = state;
  const chunks = Array.isArray(rankedChunks) ? rankedChunks as Chunk[] : [];

  if (chunks.length === 0) {
    return {
      phase: "format-context",
      contextWindow: "No relevant documents found in the vector store.",
      context: "No relevant documents found in the vector store.",
      sourceRefs: [],
      chunkCount: 0,
    };
  }

  const contextStr = buildContextString(chunks);
  const sourceRefs = buildSourceList(chunks);

  return {
    phase: "format-context",
    contextWindow: contextStr,
    context: contextStr,     // alias so test can read either field
    sourceRefs,
    chunkCount: chunks.length,
    retrievedAt: new Date().toISOString(),
    query,
  };
};
