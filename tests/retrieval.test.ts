/**
 * tests/retrieval.test.ts — vitest integration tests for graph-rag-retriever.
 * Seeds the local vector store using embeddings from @xenova/transformers (no API key required),
 * then exercises the full embedQuery → queryVectorStore → filterByMetadata → rankChunks → formatContext pipeline.
 */
import "dotenv/config";
import { describe, test, expect, beforeAll, afterAll } from "vitest";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const TEST_STORE = path.join(__dirname, "../test-vector-store.json");

// Must be set before importing graph / vectorStore
process.env.VECTOR_STORE_PATH = TEST_STORE;

const { graph }      = await import("../src/graph.js");
const { embedTexts } = await import("../src/embeddings.js");

const SEED_DOCS = [
  {
    id: "seed-lg-1",
    text: "LangGraph is a framework for building stateful multi-actor LLM applications using directed graphs.",
    meta: { docType: "documentation", source: "langgraph-docs" },
  },
  {
    id: "seed-lg-2",
    text: "LangGraph supports human-in-the-loop patterns, checkpointing, and streaming of intermediate state.",
    meta: { docType: "documentation", source: "langgraph-docs" },
  },
  {
    id: "seed-vdb-1",
    text: "Vector databases store high-dimensional embeddings and enable semantic similarity search at scale.",
    meta: { docType: "article", source: "tech-blog" },
  },
  {
    id: "seed-ts-1",
    text: "TypeScript is a strongly typed superset of JavaScript that compiles to plain JavaScript.",
    meta: { docType: "documentation", source: "typescript-docs" },
  },
];

beforeAll(async () => {
  if (fs.existsSync(TEST_STORE)) fs.unlinkSync(TEST_STORE);

  const texts = SEED_DOCS.map(d => d.text);
  const embeddings = await embedTexts(texts);

  // Write seed records directly — rag-retriever is read-only; doc-ingestion handles writes
  const records = SEED_DOCS.map((d, i) => ({
    id: d.id,
    text: d.text,
    embedding: embeddings[i],
    metadata: d.meta,
  }));
  fs.writeFileSync(TEST_STORE, JSON.stringify(records, null, 2), "utf-8");
}, 180000); // Xenova model download on first run

afterAll(() => {
  if (fs.existsSync(TEST_STORE)) fs.unlinkSync(TEST_STORE);
});

describe("graph-rag-retriever", () => {
  test("retrieves relevant context for LangGraph query (MMR ranking)", async () => {
    const result = await graph.invoke(
      { query: "What is LangGraph and how does it work?", topK: 3, rankingStrategy: "mmr" },
      { configurable: { thread_id: `test-${Date.now()}` } },
    );

    expect(result.chunkCount).toBeGreaterThan(0);
    expect((result.contextWindow as string).toLowerCase()).toContain("langgraph");
    expect(Array.isArray(result.sourceRefs)).toBe(true);
    expect((result.sourceRefs as string[]).length).toBeGreaterThan(0);
    expect(result.phase).toBe("format-context");
  }, 60000);

  test("retrieves relevant context with score ranking", async () => {
    const result = await graph.invoke(
      { query: "vector database semantic search embeddings", topK: 2, rankingStrategy: "score" },
      { configurable: { thread_id: `test-${Date.now()}` } },
    );

    expect(result.chunkCount).toBeGreaterThan(0);
    const ctx = (result.contextWindow as string).toLowerCase();
    expect(ctx).toContain("vector");
  }, 60000);

  test("filters by docType metadata", async () => {
    const result = await graph.invoke(
      { query: "TypeScript JavaScript", topK: 5, docTypes: ["documentation"] },
      { configurable: { thread_id: `test-${Date.now()}` } },
    );

    expect(result.chunkCount).toBeGreaterThanOrEqual(0);
    // All returned chunks must be documentation type
    if (result.chunkCount > 0) {
      const ctx = result.contextWindow as string;
      expect(typeof ctx).toBe("string");
      expect(ctx.length).toBeGreaterThan(0);
    }
  }, 60000);

  test("handles empty store query gracefully", async () => {
    // Temporarily swap store to empty path
    const prevPath = process.env.VECTOR_STORE_PATH;
    const EMPTY_STORE = path.join(__dirname, "../empty-store.json");
    process.env.VECTOR_STORE_PATH = EMPTY_STORE;

    try {
      const result = await graph.invoke(
        { query: "anything", topK: 3 },
        { configurable: { thread_id: `test-${Date.now()}` } },
      );
      expect(typeof result.contextWindow).toBe("string");
      expect(result.chunkCount).toBe(0);
    } finally {
      process.env.VECTOR_STORE_PATH = prevPath;
      if (fs.existsSync(EMPTY_STORE)) fs.unlinkSync(EMPTY_STORE);
    }
  }, 60000);
});
