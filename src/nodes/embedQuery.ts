/**
 * embedQuery — generates embedding for the user's query.
 */
import { embedText } from "../embeddings.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const embedQueryNode = async (state: any) => {
  const { query } = state;

  const queryEmbedding = await embedText(query as string);

  return {
    phase: "embed-query",
    queryEmbedding,
    mode: process.env.VECTOR_STORE_PATH ? "local" : "cloud",
  };
};
