# Maintenance Next Plan（维护迭代计划）

> 生成日期：2026-03-14
> 状态：执行中

---

## 任务总览

| # | 任务 | 优先级 | 风险 | 依赖 |
|---|------|--------|------|------|
| M1 | CI 稳定性基线软告警增强 | P2 | 低 | 无 |
| M2 | deep-link 错误码精确分离（后端 source/chunk） | P1 | 低 | 无 |
| M3 | store 跨-slice 调用收敛 | P2 | 中 | 无 |
| M4 | extractor 噪音规则本地可配置化 | P2 | 低 | 无 |
| M5 | CI Node 24 前瞻兼容演练 | P3 | 低 | 无 |

执行顺序：M1 → M2 → M3 → M4 → M5（无硬依赖，可独立执行）

---

## M1：CI 稳定性基线软告警增强

### 现状
- `ci-stability-baseline` job 已存在（non-blocking, `continue-on-error: true`）
- `scripts/ci-stability-baseline.mjs` 生成 markdown summary 写入 `$GITHUB_STEP_SUMMARY`
- 仅输出历史信息，无告警分级

### 目标
在 CI summary 中，当基线检测到潜在退化时输出 ⚠️ 标记（黄色提示），不阻断流水线。

### 方案
1. 在 `scripts/test-diagnose-baseline.mjs` 的 `buildStabilityBaseline()` 返回值中增加 `warnings: string[]` 字段
2. 告警规则：
   - 最近一次运行失败率 > 0 → warn "Recent run has failures"
   - 连续 3 次运行中失败率上升 → warn "Failure rate trending up"
   - 历史记录不足 3 条 → info "Insufficient history for trend analysis"
3. 在 `renderStabilityBaselineMarkdown()` 中渲染 warnings 为 `> ⚠️ ...` blockquote
4. `ci-stability-baseline.mjs` 无需改动（已消费 baseline 对象）

### 验收标准
- `npm run build:selftest && npm test` 通过
- 新增 warnings 渲染测试
- 软告警不影响 CI exit code

### 风险
低。仅改动 non-blocking job 的输出格式。

---

## M2：deep-link 错误码精确分离 ✅

> **已完成** — 完整规范见 [kb-deeplink-error-contract.md](./kb-deeplink-error-contract.md)

后端 `get_kb_chunk` 新增可选 `documentId` 参数，区分 `source-not-found` / `chunk-not-found` / `chunk-error` 三种错误码。前端 `classifyViewChunkError` 同步更新映射。

---

## M3：store 跨-slice 调用收敛

### 现状
- batch.ts：`confirmBatchPlan` 和 `retryBatchStep` 各有 `get().loadDocuments()` + `get().checkIntegrity()` 共 4 次直接 `get()` 调用
- integrity.ts：`relinkDocument` 和 `removeStaleDocuments` 各有 `get().loadDocuments()` + `get().checkIntegrity()` 共 4 次

### 目标
提取公共刷新链路为显式 helper，减少散落的 `get()` 调用，提升可维护性。

### 方案
1. 在 `knowledge/` 下新建 `refresh.ts`，导出 `refreshAfterMutation(get: () => KnowledgeState)`
   - 内部调用 `get().loadDocuments()` + `get().checkIntegrity()`
2. batch.ts 和 integrity.ts 中的 4 处刷新链路统一替换为 `refreshAfterMutation(get)`
3. 更新跨-slice 测试验证 `refreshAfterMutation` 被调用

### 验收标准
- `get().loadDocuments()` + `get().checkIntegrity()` 组合仅出现在 `refresh.ts` 中
- 所有现有行为不变
- 守护测试通过

### 风险
中。改动涉及 batch + integrity 两个 slice 的调用链路，需确保刷新顺序不变。

---

## M4：extractor 噪音规则本地可配置化

### 现状
- `NOISE_SELECTOR_STR` 硬编码在 `extractor.rs` 中
- 无法在不重编译的情况下调整规则

### 目标
支持从本地配置文件加载额外噪音规则，与内置规则合并；无配置时回退到内置规则。

### 方案
1. 定义配置结构体 `ExtractorConfig { extra_noise_selectors: Vec<String> }`
2. 在 `AppState` 中增加 `extractor_config: ExtractorConfig`
3. 初始化时从 workspace 目录下 `.lazy-editor/extractor.json` 加载（可选）
4. `extract_readable_text` 接收 merged noise selector
5. `fetch_and_extract` Tauri command 从 state 读取 config
6. 不暴露新的 Tauri command（仅内部读取配置文件）

### 验收标准
- 无配置文件时行为不变
- 有配置文件时额外规则生效
- Rust 测试：配置合并与默认回退
- 外部接口 (`fetch_and_extract` 命令) 签名不变

### 风险
低。配置为可选，回退到内置规则；不改外部接口。

---

## M5：CI Node 24 前瞻兼容演练

### 现状
- CI 全部使用 Node 20
- Node 22 为当前 LTS，Node 24 进入 current 通道
- 未验证 npm ci / vite build / vitest 在 Node 24 下的兼容性

### 目标
在 CI 中增加 Node 24 矩阵跑验证（non-blocking），提前发现兼容问题。

### 方案
1. `ci.yml` 的 `version-gate` job 增加 `strategy.matrix.node-version: [20, 24]`
2. Node 24 行设置 `continue-on-error: true`（不阻断 CI）
3. 在 `package.json` 中添加 `engines: { "node": ">=20" }` 声明
4. 在 CI summary 中标注 Node 24 为 experimental

### 验收标准
- Node 20 CI 行为不变
- Node 24 作为 non-blocking 矩阵行
- `package.json` 声明 engines 约束

### 风险
低。Node 24 矩阵行为 non-blocking，不影响现有 CI 结果。

---

## Blockers 记录

（执行过程中记录，初始为空）

| 任务 | Blocker | 替代路径 | 状态 |
|------|---------|---------|------|
| — | — | — | — |
