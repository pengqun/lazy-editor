# Knowledge Store Architecture

## Module Layout

```
src/stores/
├── knowledge.ts                  # Aggregation layer: creates useKnowledgeStore, re-exports all types and slices
└── knowledge/
    ├── types.ts                  # Shared interfaces & KnowledgeState definition
    ├── viewer.ts                 # createViewerStateSlice — chunk viewer state & actions
    ├── integrity.ts              # createIntegrityStateSlice — integrity scan, reminders, health thresholds, health check
    └── batch.ts                  # createBatchStateSlice + createBatchActionSlice — batch fix plan execution
```

## Slice Boundaries

| Slice | State Fields | Key Actions |
|-------|-------------|-------------|
| **viewer** | `viewedChunk`, `viewChunkLoading`, `viewChunkError`, `viewedChunkQuery`, `viewedChunkScore` | `viewChunk`, `closeChunkViewer`, `setViewChunkError`, `dismissChunkError` |
| **integrity** | `integrityReport`, `integrityHistory`, `integrityTrendHistory`, `reminderSettings`, `healthThresholds`, `healthCheckReport` | `checkIntegrity`, `relinkDocument`, `removeStaleDocuments`, `runHealthCheck`, threshold/reminder management |
| **batch** | `batchFixPlan`, `batchLastPlan`, `batchExecuting`, `batchStepStatuses`, `batchExecutionLog`, `lastBatchImpact` | `buildBatchPlan`, `confirmBatchPlan`, `retryBatchStep`, `clearHealthCheck` |
| **core** (in knowledge.ts) | `documents`, `searchResults`, `pinnedDocIds`, retrieval settings | `loadDocuments`, `ingestFile`, `searchKB`, `togglePinDocument`, preset/scope management |

## Cross-Slice Access Rules

1. Slices receive `set` (and optionally `get`) from the store's `create()` call.
2. Cross-slice reads go through `get()` — e.g., batch actions call `get().checkIntegrity()` after execution.
3. Slices must **never** import the store instance (`useKnowledgeStore`) — only types from `./types`.
4. The aggregation layer (`knowledge.ts`) is the only file that imports slice factories and composes the store.

## Import Direction (No Cycles)

```
knowledge.ts  ──imports──>  knowledge/viewer.ts
              ──imports──>  knowledge/integrity.ts
              ──imports──>  knowledge/batch.ts
              ──imports──>  knowledge/types.ts

knowledge/{viewer,integrity,batch}.ts  ──imports type──>  knowledge/types.ts
```

All slice → types imports use `import type`, ensuring zero runtime circular dependencies.

## Prohibited Patterns

- **Do not** import from `../knowledge` (the aggregation layer) inside any slice module. Use `./types` for type imports.
- **Do not** create direct dependencies between slice files (e.g., viewer importing from batch).
- **Do not** add runtime logic to `types.ts` — it must remain a pure type/interface module (the sole exception is the re-export of `toHealthThresholds` needed for `ReturnType` in `KnowledgeState`).
- **Do not** merge slices back into `knowledge.ts` — keep it as a thin aggregation layer.

## Public API

All external consumers import from `@/stores/knowledge`. The re-exports ensure a single entry point:

- Types: `KBDocument`, `SearchResult`, `ChunkContext`, `KnowledgeState`, `IntegrityReport`, etc.
- Slice factories: `createViewerStateSlice`, `createIntegrityStateSlice`, `createBatchStateSlice`, `createBatchActionSlice`
- Store hook: `useKnowledgeStore`
