/**
 * graph-rag-retriever
 *
 * Pipeline: embedQuery → queryVectorStore → filterByMetadata → rankChunks → formatContext
 *
 * Input:  RagRetrieverInput  (query, clientId, topK, dateRange?, docTypes?, tags?)
 * Output: RagRetrieverOutput (contextWindow, sourceRefs[], chunkCount)
 *
 * Implementation tracked in GitHub issues — see repo Issues tab.
 */

import { StateGraph, START, END, MemorySaver, StateSchema, UntrackedValue } from '@langchain/langgraph';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import pg from 'pg';
import { z } from 'zod';

function lastValue<T>(schema: z.ZodType<T, any, any>): UntrackedValue<T> {
  return schema as unknown as UntrackedValue<T>;
}

const RagState = new StateSchema({
  query:           lastValue(z.string().default('')),
  clientId:        lastValue(z.string().default('')),
  topK:            lastValue(z.number().default(5)),
  dateRange:       lastValue(z.object({ from: z.string(), to: z.string() }).optional()),
  docTypes:        lastValue(z.array(z.string()).optional()),
  tags:            lastValue(z.array(z.string()).optional()),
  mode:            lastValue(z.enum(['cloud', 'local']).default('cloud')),
  rankingStrategy: lastValue(z.enum(['mmr', 'cross-encoder', 'score']).default('mmr')),
  queryEmbedding:  lastValue(z.array(z.number()).default(() => [])),
  rawChunks:       lastValue(z.array(z.any()).default(() => [])),
  filteredChunks:  lastValue(z.array(z.any()).default(() => [])),
  rankedChunks:    lastValue(z.array(z.any()).default(() => [])),
  contextWindow:   lastValue(z.string().default('')),
  sourceRefs:      lastValue(z.array(z.string()).default(() => [])),
  chunkCount:      lastValue(z.number().default(0)),
  error:           lastValue(z.string().optional()),
  phase:           lastValue(z.string().default('')),
});

const standardRetry = { maxAttempts: 3, initialInterval: 1000, backoffFactor: 2 };

import { embedQueryNode }       from './nodes/embedQuery.js';
import { queryVectorStoreNode } from './nodes/queryVectorStore.js';
import { filterByMetadataNode } from './nodes/filterByMetadata.js';
import { rankChunksNode }       from './nodes/rankChunks.js';
import { formatContextNode }    from './nodes/formatContext.js';

function assembleGraph(checkpointer?: MemorySaver) {
  const builder = new StateGraph(RagState)
    .addNode('embedQuery',       embedQueryNode,       { retryPolicy: standardRetry })
    .addNode('queryVectorStore', queryVectorStoreNode, { retryPolicy: standardRetry })
    .addNode('filterByMetadata', filterByMetadataNode, { retryPolicy: standardRetry })
    .addNode('rankChunks',       rankChunksNode,       { retryPolicy: standardRetry })
    .addNode('formatContext',    formatContextNode,    { retryPolicy: standardRetry })
    .addEdge(START, 'embedQuery')
    .addEdge('embedQuery', 'queryVectorStore')
    .addEdge('queryVectorStore', 'filterByMetadata')
    .addEdge('filterByMetadata', 'rankChunks')
    .addEdge('rankChunks', 'formatContext')
    .addEdge('formatContext', END);

  return checkpointer ? builder.compile({ checkpointer }) : builder.compile();
}

export const graph: any = assembleGraph(new MemorySaver());

export async function buildGraph(): Promise<any> {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const checkpointer = new PostgresSaver(pool);
  await checkpointer.setup();
  return assembleGraph(checkpointer as unknown as MemorySaver);
}
