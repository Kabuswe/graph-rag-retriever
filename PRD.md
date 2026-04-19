# graph-rag-retriever — Product Requirements Document

## Purpose
Universal retrieval primitive. Given a query, embeds it, queries Amazon S3 Vectors with optional metadata filters, ranks returned chunks, and formats a context window ready for downstream LLM consumption. Every agent graph that needs grounded responses calls this subgraph. Also works in local mode with SQLite-vec for the Electron desktop app.

## Deployment
- Deployed on LangSmith Deployment as `ragRetriever`
- `langgraph.json`: `{ "graphs": { "ragRetriever": "./src/graph.ts:graph" } }`
- Exposed as an MCP tool for use by any external MCP client

## Pipeline
```
START → embedQuery → queryVectorStore → filterByMetadata → rankChunks → formatContext → END
```

### Node Responsibilities

**`embedQuery`**
- Embed `query` using Bedrock Titan Embeddings V2 (cloud) or `nomic-embed-text` via Ollama (local mode)
- Detect mode from env: `VECTOR_STORE_MODE=s3|sqlite`
- Output: `queryEmbedding: number[]`

**`queryVectorStore`**
- Cloud: call S3 Vectors `QueryVectors` with `queryEmbedding`, `topK`, and metadata filter expression
- Local: SQLite-vec `SELECT` with cosine similarity and WHERE clause filters
- Metadata filter expression built from: `clientId`, `dateRange`, `docTypes[]`, `tags[]`
- Output: `rawChunks: VectorChunk[]`

**`filterByMetadata`**
- Apply any post-retrieval filters not expressible in the vector query (e.g. compound conditions)
- Deduplicate by source+chunk overlap
- Output: `filteredChunks: VectorChunk[]`

**`rankChunks`**
- Re-rank by relevance using a cross-encoder or simple MMR (Maximal Marginal Relevance) for diversity
- Trim to `topK` chunks
- Output: `rankedChunks: VectorChunk[]`

**`formatContext`**
- Concatenate ranked chunks into a single `contextWindow` string with source citations
- Build `sourceRefs[]` list for citation tracking
- Output: `contextWindow: string`, `sourceRefs: string[]`, `chunkCount: number`

## State Schema
```ts
{
  query: string;
  clientId: string;
  topK: number;              // default 5
  dateRange?: { from: string; to: string };
  docTypes?: string[];
  tags?: string[];
  mode: 'cloud' | 'local';  // derived from env

  queryEmbedding: number[];
  rawChunks: VectorChunk[];
  filteredChunks: VectorChunk[];
  rankedChunks: VectorChunk[];

  contextWindow: string;
  sourceRefs: string[];
  chunkCount: number;

  error?: string;
  phase: string;
}
```

## AWS Dependencies
- `@aws-sdk/client-s3-vectors` — S3 Vectors QueryVectors API
- `@aws-sdk/client-bedrock-runtime` — Titan Embeddings V2
- S3 Vectors index ARN configured via `S3_VECTORS_INDEX_ARN` env var

## Local Mode Dependencies
- `better-sqlite3` + `sqlite-vec` extension
- Ollama REST API at `http://localhost:11434` for `nomic-embed-text`
- SQLite database path from `SQLITE_DB_PATH` env var

## Environment Variables
```
VECTOR_STORE_MODE=s3          # or sqlite
S3_VECTORS_INDEX_ARN=
AWS_REGION=
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
OLLAMA_BASE_URL=http://localhost:11434
SQLITE_DB_PATH=
LANGSMITH_API_KEY=
LANGSMITH_TRACING_V2=true
DATABASE_URL=
```

## Agent Instructions
1. Follow the exact structural pattern from `graph-ux-research`
2. The `mode` field must be derived at graph init time from `VECTOR_STORE_MODE` env var — not per-node
3. `embedQuery` node must be the only place embeddings are generated — no embedding calls in other nodes
4. `rankChunks` should implement MMR by default; add a `rankingStrategy: 'mmr'|'cross-encoder'|'score'` state field for flexibility
5. All chunk metadata must be preserved through the pipeline and included in `sourceRefs`
6. The `formatContext` output must include a token count estimate to help callers manage context window budgets
7. Write integration tests for both `cloud` and `local` modes using mocked AWS clients and in-memory SQLite
8. Expose a `src/local.ts` entry point that hardcodes `mode: 'local'` for the Electron app to import directly

## Acceptance Criteria
- Returns relevant chunks for a query against a seeded S3 Vectors index
- Metadata filters for `clientId` and `dateRange` correctly scope results
- Local mode returns results from SQLite-vec without any AWS calls
- `contextWindow` output is ready to inject directly into an LLM prompt
- LangSmith traces show all 5 node steps with chunk counts at each stage
