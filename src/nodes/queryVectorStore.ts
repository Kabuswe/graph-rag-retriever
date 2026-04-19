/**
 * queryVectorStore — searches the vector store for relevant chunks.
 */
import { loadVectorStore, searchByEmbedding } from "../vectorStore.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const queryVectorStoreNode = async (state: any) => {
  const { queryEmbedding, topK = 10, clientId } = state;

  const store = loadVectorStore();

  if (store.length === 0) {
    console.warn("[queryVectorStore] Vector store is empty. Run doc-ingestion first.");
    return { phase: "query-vector-store", rawChunks: [] };
  }

  // Pre-filter by clientId if specified
  const rawChunks = searchByEmbedding(
    queryEmbedding as number[],
    store,
    (topK as number) * 3, // over-fetch before filtering
    clientId ? (r) => !r.metadata.clientId || r.metadata.clientId === clientId : undefined,
  );

  console.log(`[queryVectorStore] Retrieved ${rawChunks.length} raw chunks from ${store.length} total`);

  return {
    phase: "query-vector-store",
    rawChunks,
  };
};
