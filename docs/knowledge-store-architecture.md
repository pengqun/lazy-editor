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

---

## Playbook: Knowledge Store 变更操作手册

### 新增 action 应放在哪个 slice

| 场景 | 目标 slice | 说明 |
|------|-----------|------|
| 文档 CRUD、搜索、检索设置 | **core**（`knowledge.ts` 内联） | 直接操作 `documents`/`searchResults`/`pinnedDocIds` 等核心状态 |
| chunk 查看、引用跳转 | **viewer**（`viewer.ts`） | 管理 `viewedChunk`/`viewChunkError` 等只读预览状态 |
| 完整性扫描、修复、提醒、阈值 | **integrity**（`integrity.ts`） | 涉及 `integrityReport`/`reminderSettings`/`healthThresholds` |
| 批量修复计划、执行、重试 | **batch**（`batch.ts`） | 涉及 `batchFixPlan`/`batchExecutionLog`/`batchStepStatuses` |

**判断原则**：action 主要读写哪个 slice 的状态字段，就放在该 slice。如果横跨多个 slice，放在 *发起方* slice 中，通过 `get()` 调用目标 slice 的 action。

### 何时允许跨-slice 调用

跨-slice 调用（通过 `get()` 访问其他 slice 的 action）仅在以下情况允许：

1. **操作完成后的刷新链路** — 如 `confirmBatchPlan` 执行完毕后调用 `get().loadDocuments()` + `get().checkIntegrity()` 刷新全局状态。
2. **聚合查询** — 需要读取其他 slice 的状态来决定当前 action 的行为。

**禁止的跨-slice 模式**：
- slice 文件之间直接 `import`（必须通过 `get()` 在运行时访问）
- 在 slice 初始化（工厂函数返回的对象字面量）中引用其他 slice 的状态字段

### 如何写对应测试

1. **单 slice 测试**：构造 `set = vi.fn()` 和 `get = () => state`，直接调用 slice factory，验证 `set` 被调用时的参数。
2. **跨-slice 测试**：在 `get()` 返回的 state 中注入其他 slice 的 action 作为 `vi.fn()`，验证 action 被调用的次数和顺序。
3. **守护测试**：
   - 导出稳定性：检查 `useKnowledgeStore.getState()` 包含所有预期的 key。
   - 导入一致性：对比 re-export 与直接 import 的 slice factory 是否返回相同的 key 集合。
   - 结构约束：验证 slice 模块不含禁止的 import 路径。

### 常见反模式

| 反模式 | 正确做法 |
|--------|---------|
| 在 slice 中 `import { useKnowledgeStore } from "../knowledge"` | 通过 `get()` 访问其他 slice 的 action |
| 在 `types.ts` 中放运行时逻辑 | `types.ts` 仅放类型和 `import type`（唯一例外：`toHealthThresholds` re-export 用于 `ReturnType`） |
| 内联 `err instanceof Error ? err.message : String(err)` | 使用 `extractErrorMessage()` from `integrity-utils.ts` |
| 在多个 slice 中重复定义相同的默认值常量 | 提取到 `types.ts` 或 `integrity-utils.ts` 中共享 |
| 合并 slice 回 `knowledge.ts` | 保持 `knowledge.ts` 为薄聚合层（<220 行） |

---

## 变更影响检查清单

提交涉及 knowledge store 的变更前，逐项确认：

### 结构完整性
- [ ] `knowledge.ts` 行数 ≤ 220
- [ ] slice 模块无 `import … from "../knowledge"` 或 `useKnowledgeStore` 引用
- [ ] slice 间无直接 `import`（viewer ↛ batch, integrity ↛ viewer 等）
- [ ] `types.ts` 无新增运行时逻辑（仅 `import type` 和接口定义）

### 导出稳定性
- [ ] `useKnowledgeStore.getState()` 包含所有已记录的 key（见测试中 `expectedKeys` 列表）
- [ ] 每个 slice factory 返回的 key 集合与 re-export 版本一致
- [ ] 新增 action 已加入对应 slice 的 `Pick<KnowledgeState, …>` 类型

### 初始化安全
- [ ] 每个 slice factory 返回的对象包含所有声明的状态字段（无遗漏）
- [ ] 初始值与 `KnowledgeState` 接口声明的类型兼容
- [ ] 新增状态字段有合理的零值（null / false / [] / {}）

### 跨-slice 调用
- [ ] 跨-slice 调用仅出现在 action 完成后的刷新链路中
- [ ] 跨-slice 调用有对应的测试覆盖（见 `knowledge-slices.test.ts` cross-slice 用例）

### 测试
- [ ] `npm run build:selftest` 通过（tsc + vite build）
- [ ] `npm test` 全部通过
- [ ] `cd src-tauri && cargo test -q` 全部通过
