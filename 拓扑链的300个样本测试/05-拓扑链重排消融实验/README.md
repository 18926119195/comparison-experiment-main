# 拓扑链重排消融实验报告（末尾chunk移到前面）

## 实验设计

- **目的**：检验拓扑链的 chunk（句子/实体来源）顺序被打乱后，Recall LLM 是否仍能选出覆盖正确答案的证据片段
- **测试集**：原始 300 条中 `em=1`（完全正确）的 197 条题目
- **重排规则**：以 chunk 为单位（每个 `ctx_N_sent_M` 为一个 chunk），将 chunk 序列从中点切成前后两半，后半整体移到前半前面，每半内部 chunk 顺序和每个 chunk 内部节点顺序均不变
- **模型配置**：`deepseek-flash`，recallThinking=false，温度=0（与原始 pipeline 完全一致）
- **隔离原则**：不触碰 `ablation.js` 或任何已有输出目录；所有数据通过读取已有的 `pipeline-trace.json` 重建，不重新运行 NER 或 spaCy

## 核心结果

| 重排后文本忠实度 | 数量 | 占比 |
|---|---|---|
| **是**（重排后 Recall 仍找到证据） | 167 | 84.8% |
| **部分**（证据链不完整/缺关键一步） | 13 | 6.6% |
| **否**（重排后 Recall 完全无法定位证据） | 17 | 8.6% |

**解读**：在原始 pipeline 回答完全正确的 197 题中，将拓扑链末尾的 chunk 整体移到前面后，**84.8% 的题目 Recall LLM 仍然能找到支持答案的证据片段**，说明拓扑链的顺序信息对大多数题目的召回效果影响有限。但有 8.6%（17 题）原本答对了，顺序一打乱就完全找不到证据了——这说明这些题的成功高度依赖于"正确答案恰好出现在链的前半部分"这一顺序特征，值得单独分析（见下方 case-D）。

## 关键发现

### Case D：重排后证据丢失（17 条）

这 17 条题目在原始顺序下 recall 选中了证据，但 chunk 顺序打乱后就再也选不中任何支撑 gold 答案的片段了。这些题目高度依赖"答案相关实体恰好出现在链的前半"这一顺序特征。

见 `case-D-reorder-lost-evidence.json`。

### Case E：重排后证据部分保留（13 条）

证据不完整，Recall LLM 选中了部分相关片段但缺少关键一步（数字、日期、具体地点等）。见 `case-E-reorder-partial-evidence.json`。

### 与原始文本忠实度对比

| | 原始（em=1 样本） | 重排后 |
|---|---|---|
| 是 | 100% | 84.8% |
| 部分 | — | 6.6% |
| 否 | 0% | 8.6% |

## 数据文件说明

```
experiments/recall-reorder-tail-to-front/
├── run-reorder.cjs                        隔离实验脚本（独立实现，不依赖 ablation.js）
└── output/
    ├── reorder-results-offset0-limit197.json          197条原始API输出记录
    ├── manual-review-reorder-197-results.json        197条人工文本忠实度判断
    ├── manual-review-reorder-197.json                197条待判断素材
    ├── merged-reorder-197-full.json                 合并完整对照表（含原始pred / 重排后判断 / 理由）
    ├── case-D-reorder-lost-evidence.json            17条"重排后证据完全丢失"
    └── case-E-reorder-partial-evidence.json         13条"重排后证据部分保留"
```

## 实验结论

将拓扑链末尾的 chunk 整体移到前面（中点切分对调），对 84.8% 的题目 Recall 效果不受影响，说明拓扑链的信息分布是相对均匀的，Recall LLM 能够从非顺序的符号化表示中定位关键实体。但 8.6%（17题）的失败案例说明仍有相当比例的题目其 Recall 成功依赖于"正确实体出现在链前部"这一顺序特性，这些题目可能是潜在的顺序依赖性风险样本。

这些 case-D 题目和原始实验中的 case-C（文本不支持但碰巧答对）加起来，共同揭示了"表面正确率"与"拓扑链方法真正推理能力"之间的差距。
