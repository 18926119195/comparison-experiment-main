# 实验记录：拓扑链重排消融实验（tail-to-front chunk rotation）

## 实验目的

检验"拓扑链"的 chunk（句子/实体来源）顺序被打乱后，Recall LLM 是否仍能选出覆盖正确答案的证据片段。

## 实验假设

原始 pipeline（recall + reasoning）对 300 条 HotpotQA 样本的 em=1 正确率为 65.7%。如果拓扑链顺序本身是 Recall LLM 依赖的关键特征，那么把末尾 chunk 整体移到前面（中点切分对调）后，原本答对的题目会有相当比例无法找到正确证据；反之则说明拓扑链的信息分布是相对顺序无关的。

## 实验方法

1. **筛选题目**：从原始 300 条中取出 `em=1`（完全正确）的 197 条题目
2. **拓扑链重排**：以 chunk（`ctx_N_sent_M` 句子级片段）为单位，将 chunk 序列从中点切成前后两半，后半整体移到前半前面，每半内部 chunk 顺序和节点内部顺序均不变
3. **隔离重跑**：复用已有的 `pipeline-trace.json`（不重新跑 NER），用重排后的拓扑链重新构造 Recall prompt，重新调用 `deepseek-flash`（recallThinking=false，温度=0），获取新的 recall 选段
4. **人工复核**：判断重排后的 recall 选段是否仍包含支撑 gold 答案的证据

## 核心结果

| 重排后文本忠实度 | 数量 | 占比 |
|---|---|---|
| **是**（重排后仍找到证据） | 167 | 84.8% |
| **部分**（证据不完整） | 13 | 6.6% |
| **否**（重排后完全无法定位证据） | 17 | 8.6% |

- API 调用：197/197 成功，无 API 错误，无 recall 解析失败
- 总消耗 token：1,320,037（prompt + completion）

## 关键发现

- **84.8% 的题目不受影响**：拓扑链信息分布相对顺序无关，Recall LLM 能从非顺序的符号化表示中定位关键实体
- **17 条（8.6%）高度顺序依赖**：重排后原本答对的题目完全找不到证据，说明这些题的成功依赖于"正确答案相关实体恰好出现在链前部"这一顺序特征，对应 `case-D-reorder-lost-evidence.json`
- **13 条部分依赖**：证据片段被选中但缺少关键一步，对应 `case-E-reorder-partial-evidence.json`

## 文件夹结构

```
实验记录-拓扑链重排消融-tail-to-front/
├── README.md                          本文件
├── 01-代码/
│   └── run-reorder.cjs               隔离实验脚本（完全独立，不依赖 ablation.js）
├── 02-原始数据/
│   ├── reorder-results-offset0-limit197.json   197条 recall LLM 原始 API 输出（含 prompt、rawResponse、usage）
│   └── manual-review-reorder-197.json         197条人工复核素材（question / gold / recall选段还原文本）
├── 03-人工复核结果/
│   ├── manual-review-reorder-197-results.json  197条人工判断（verdict: 是/部分/否 + note）
│   ├── merged-reorder-197-full.json            合并对照表（所有字段聚合）
│   ├── case-D-reorder-lost-evidence.json       17条"重排后证据完全丢失"
│   └── case-E-reorder-partial-evidence.json    13条"重排后证据部分保留"
└── 04-完整聊天记录/
    ├── 完整聊天记录.md                    可读 Markdown 版本（完整会话记录）
    └── 完整聊天记录-原始jsonl.jsonl       原始 JSONL（含所有 tool_use/tool_result 元数据）
```

## 数据字段说明

### reorder-results-offset0-limit197.json（每条）
- `qid` / `question` / `expectedAnswer` / `originalPred`：题目信息
- `rotation.totalChunks` / `splitPoint`：该题 chunk 总数 / 中点切分位置
- `rotation.originalChunkOrder` / `rotatedChunkOrder`：原始 / 重排后的 chunk 顺序
- `promptLength`：重排后 recall prompt 字符数
- `recallRawResponse`：recall LLM 原始输出（符号序列）
- `recallValid`：输出是否被成功解析
- `reconstructedSegmentsText`：recall 选段的还原原文（供人工复核用）
- `usage`：API token 消耗统计

### manual-review-reorder-197-results.json（每条）
- `qid` / `verdict`（是/部分/否）/ `note`

## 隔离说明

- 不触碰 `ablation.js` 或任何已有 `output/` 目录
- 拓扑链数据全部从已有的 `output/test-70samples-2026-10-07/recall-<qid>/pipeline-trace.json` 只读重建
- Recall prompt 构建逻辑照抄 `ablation.js` 的 `renderChain` / `buildRecallSystem` / `buildRecallUser`（本文件夹内自包含实现，不 import）
- 所有输出写入本文件夹自己的 `output/` 子目录，与原始实验完全隔离
