/**
 * rankChunks — re-ranks filtered chunks using the configured strategy.
 * Supports: mmr (diversity-aware), score (pure relevance), cross-encoder (LLM rerank placeholder).
 */
import { mmrRerank } from "../vectorStore.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const rankChunksNode = async (state: any) => {
  const { filteredChunks, rankingStrategy = "mmr", topK = 10, queryEmbedding } = state;

  const chunks = Array.isArray(filteredChunks) ? filteredChunks : [];

  if (chunks.length === 0) {
    return { phase: "rank-chunks", rankedChunks: [] };
  }

  let ranked: unknown[];

  if (rankingStrategy === "mmr" && Array.isArray(queryEmbedding) && queryEmbedding.length > 0) {
    ranked = mmrRerank(queryEmbedding as number[], chunks as never, topK as number);
  } else {
    // Score-based: sort by relevance score, take topK
    ranked = [...chunks]
      .sort((a: unknown, b: unknown) => {
        const aScore = (a as Record<string, unknown>).score as number ?? 0;
        const bScore = (b as Record<string, unknown>).score as number ?? 0;
        return bScore - aScore;
      })
      .slice(0, topK as number);
  }

  console.log(`[rankChunks] strategy=${rankingStrategy}, returned ${ranked.length} chunks`);

  return {
    phase: "rank-chunks",
    rankedChunks: ranked,
  };
};
