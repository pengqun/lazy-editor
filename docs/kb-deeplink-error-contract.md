# KB Deep-Link Error Contract

> 规范文档：knowledge base citation deep-link 的错误码定义、前后端映射与 UI 行为。

---

## 后端错误码（Rust → 前端 IPC 错误字符串）

`get_kb_chunk` 命令（`src-tauri/src/commands/kb.rs`）在失败时返回下列结构化前缀错误码：

| 错误码前缀 | 格式 | 触发条件 | 示例 |
|-----------|------|---------|------|
| `source-not-found:` | `source-not-found:<documentId>` | 调用方提供了 `documentId` 且该文档不存在（已删除，CASCADE DELETE） | `source-not-found:42` |
| `chunk-not-found:` | `chunk-not-found:<chunkId>` | 文档存在但 chunk 行不存在（re-index 后 ID 失效） | `chunk-not-found:99` |
| `chunk-error:` | `chunk-error:<details>` | 数据库未预期错误 | `chunk-error:disk I/O error` |

### 参数说明

```
get_kb_chunk(chunkId: i64, documentId?: i64)
```

- `chunkId`（必填）：目标 chunk 的数据库 ID。
- `documentId`（可选）：来源文档 ID。提供时后端先检查文档是否存在，用于区分 source 删除 vs chunk 缺失。

### 判定流程

```
┌─ documentId provided? ─┐
│  yes                    │  no
│  ▼                      │
│  document_exists(docId) │
│  ├─ false → source-not-found:<docId>
│  ├─ error → chunk-error:<msg>
│  └─ true  → (continue)
│                         │
└────────┬────────────────┘
         ▼
  get_chunk_with_context(chunkId)
  ├─ ok    → 成功返回 ChunkContext
  ├─ no rows → chunk-not-found:<chunkId>
  └─ other  → chunk-error:<msg>
```

---

## 前端错误分类（TypeScript）

### ViewChunkErrorKind

定义在 `src/stores/knowledge/types.ts`：

```typescript
type ViewChunkErrorKind = "source-missing" | "chunk-missing" | "malformed-link";
```

### classifyViewChunkError 映射表

定义在 `src/stores/knowledge/viewer.ts`：

| 后端错误码 | 匹配规则 | 前端 ErrorKind |
|-----------|---------|---------------|
| `source-not-found:*` | `startsWith("source-not-found:")` | `source-missing` |
| `chunk-not-found:*` | `startsWith("chunk-not-found:")` | `chunk-missing` |
| `chunk-error:*` | `startsWith("chunk-error:")` | `chunk-missing` |
| （前端检测） | `includes("malformed")` | `malformed-link` |
| （兜底） | 不匹配任何规则 | `chunk-missing` |

### UI 消息

定义在 `buildViewChunkError()`：

| ErrorKind | 用户提示 |
|-----------|---------|
| `source-missing` | "Source missing — this document is no longer in the knowledge base." |
| `chunk-missing` | "Chunk missing — this citation points to content that no longer exists." |
| `malformed-link` | "Malformed citation link — this reference is invalid." |

---

## Citation 数据属性

citation 元素（HTML）嵌入以下 data attributes，用于 deep-link 导航：

| Attribute | 来源 | 用途 |
|-----------|------|------|
| `data-chunk-id` | `CitationSource.chunkId` | 目标 chunk ID（必填） |
| `data-document-id` | `CitationSource.documentId` | 来源文档 ID（用于后端 source 存在性检查） |
| `data-score` | `CitationSource.score` | 相似度分数（显示用） |

`parseCitationElement()` 解析这些属性；若 `chunkId` 或 `documentId` 无效则触发 `malformed-link`。

---

## 调用链

```
用户点击 citation
  → parseCitationElement(el)              // 提取 chunkId, documentId, score
  → navigateToCitationSource(...)         // src/hooks/useAI.ts
    → kbStore.viewChunk(chunkId, query, score, documentId)
      → invoke("get_kb_chunk", { chunkId, documentId })   // Tauri IPC
        ← 成功: ChunkContext
        ← 失败: 结构化错误码字符串
      → classifyViewChunkError(err) → ViewChunkErrorKind
      → buildViewChunkError(kind)   → { kind, message }
    → setRightPanel("knowledge")          // 打开 knowledge panel
```

---

## 变更规则

1. 新增后端错误码时，必须同步更新 `classifyViewChunkError` 映射和本文档。
2. 前端 `ViewChunkErrorKind` 变更时，必须同步更新 `buildViewChunkError` 的 UI 消息。
3. 守护测试（`knowledge-slices.test.ts`）验证映射完整性——新增 error kind 会导致测试失败。
