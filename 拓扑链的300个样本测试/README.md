# 拓扑链 300 个样本测试 - 汇总说明

本文件夹汇总了基于 HotpotQA 的 300 条样本在"拓扑链"（topology chain，即先对原文做实体/名词级别的重建或抽取，再做 recall 检索链 + reasoning 推理）流程下的全部测试数据、评分结果，以及人工复核过程与结论。

模型配置：`deepseek-flash`，`recallThinking: false`，`reasoningThinking: false`。

## 核心结论（先说结果）

| 指标 | 数值 |
|---|---|
| 样本总数 | 300 |
| 字符串精确匹配 EM | 197 (65.7%) |
| 语义等价 SEM（人名/缩写/单复数等颗粒度差异，视为正确） | 71 (23.7%) |
| 字符串/语义均不匹配 ✗ | 32 (10.7%) |
| EM + SEM 合计（人工认定语义正确） | 268 (89.3%) |
| 平均分（combined-details.json 中 score 字段） | 0.824 |

人工对"重建文本是否真的包含/支持标准答案"做了第二层复核（即文本忠实性复核，与上面的"预测是否匹配答案"是两个不同维度）：

| 文本忠实性判定 | 数量 | 占比 |
|---|---|---|
| 是（重建文本明确支持标准答案） | 241 | 80.3% |
| 否（重建文本缺失/矛盾，无法支持标准答案） | 37 | 12.3% |
| 部分（有线索但需额外推理，或关键信息缺失一部分） | 22 | 7.3% |

### 两层判定交叉后发现的关键问题

把"预测是否匹配"和"文本是否支持"交叉比对，分成三类问题最值得关注：

1. **模型漏判（21 条）**：字符串判定为 ✗，但人工确认重建文本里其实已经包含正确答案。说明不是检索/重建环节的锅，是 recall/reasoning 环节没有把现成的证据正确提炼出来，或者回答格式不对（比如该答 yes/no 却答了公司名，该答方位词却答了地名）。见 `03-人工复核/case-A-model-missed-available-evidence.json`。
2. **源头缺失（6 条）**：字符串判定为 ✗，人工复核也确认重建文本里确实没有支持答案的内容。这类是实体抽取/文本重建阶段就丢了关键信息，模型答错情有可原。见 `03-人工复核/case-B-source-text-insufficient.json`。
3. **文本不支持但答案碰巧对了（31 条）**：字符串判定为 EM/SEM 正确，但人工复核发现重建文本里并没有能支持该答案的证据。这类大概率是模型靠自身参数记忆蒙对的，而不是真的从给定材料里推理出来的，在做"忠实性"评估时需要单独扣除。见 `03-人工复核/case-C-matched-despite-insufficient-text.json`。

这意味着，如果只看 EM+SEM 的 89.3% 正确率，会高估"拓扑链"方法本身的检索-推理能力——其中至少 31 条（10.3%）的"正确"并非源于对重建文本的忠实推理。

## 文件夹结构

```
拓扑链的300个样本测试/
├── README.md                                  本文件
├── 01-原始数据/
│   ├── all-cases-for-manual-review.json       300 条样本的完整人工复核素材（含 reconstructedSegments 或 selectedNouns）
│   ├── all-cases-reconstructed-text.json       300 条样本的重建文本原文
│   ├── combined-details.json                   300 条样本的 recall+reasoning 原始运行记录（含完整推理路径、token 用量）
│   ├── partial-cases-for-review.json           得分介于 0~1 之间（非全对非全错）的子集，供重点复核
│   ├── remaining-batch.json                    补充批次（hotpot_5707 ~ hotpot_7359，67 条）的重建文本
│   └── _all-300-detail.json                    300 条样本的 qid / pred / gold / em / score 精简表
├── 02-批次明细/
│   ├── batch-XXX-YYY-details.json × 13         按批次拆分的详细运行记录（分 13 批跑完 300 题）
│   ├── batch-XXX-YYY-summary.json × 13          每批次的汇总统计（EM 数、平均分、token 用量、cache 命中率）
│   └── recall-summary-partial-29.json           一次仅跑 29 条的中间态汇总（历史记录，非最终结果）
└── 03-人工复核/
    ├── manual-review-results.json               人工对 300 条样本逐条判定"重建文本是否支持标准答案"（是/否/部分 + 理由）
    ├── manual-judgment-300-EM-SEM.md             人工对 300 条样本逐条做字符串级比对（EM ✓ / SEM ✓ / ✗ + 备注）
    ├── merged-300-full-table.json                上面两份人工判定 + pred/gold/score 合并后的 300 条完整对照表
    ├── case-A-model-missed-available-evidence.json   21 条"模型漏判"案例
    ├── case-B-source-text-insufficient.json          6 条"源头文本缺失"案例
    └── case-C-matched-despite-insufficient-text.json 31 条"文本不支持但答案碰巧对"案例
└── 04-完整聊天记录.md                          本次任务（从最初的 recall 模式代码审查，到 300 条人工复核，再到本汇总文件夹的搭建）对应的完整会话记录
```

## 数据来源与评判标准说明

- **`combined-details.json`** 里每条记录包含 `predictedAnswer`（完整推理路径文本）、`recallTruncation`、`nounCount`、`recallUsage`/`reasoningUsage`（token 用量和 cache 命中情况）。这是最原始、信息量最大的记录。
- **`_all-300-detail.json`** 是从上面提炼出的精简版，只保留 `pred`/`gold`/`em`/`score`，方便快速过一遍。
- **批次拆分**：300 题是分 13 个批次跑的（1-10、11-29、30-40、41-69、70-80、81-99、100-110、111-159、160-170、171-249、250-260、261-289、290-300），`02-批次明细` 下保留了每批的独立 details/summary，方便定位某一批次是否存在异常（比如 token 用量突增、cache 命中率骤降）。
- **人工复核分两层**：
  - 第一层（`manual-judgment-300-EM-SEM.md`）只看"模型给出的字符串答案"和"标准答案"是否一致或语义等价，不关心重建文本质量。
  - 第二层（`manual-review-results.json`）专门检查"重建后的文本片段"（`reconstructedSegments` 或退化为 `selectedNouns` 列表的情况）里是否真的包含支持标准答案的证据，这是针对"拓扑链"重建环节本身忠实性的检查，和模型答得对不对是两件事。
- 部分样本（4 条：hotpot_3989/4006/4031/4074）的重建数据只有 `selectedNouns`（打散的名词短语列表），没有组织成句子级的 `reconstructedSegments`，判定时按"关键实体/短语是否共现"的标准处理，在 `manual-review-results.json` 的 note 中有注明。

## 已知数据问题（人工复核中发现）

以下情况在复核过程中被标记，均已在 `manual-review-results.json` 的理由字段中注明，供后续排查重建脚本或数据管线使用：

- `hotpot_872`：Warrington 地名在重建文本中丢失，疑似占位符渲染遗留问题。
- `hotpot_2459`：PET 缩写在重建文本中被截断丢失。
- `hotpot_2718`：目标学校排名缺失，且混入了不相关的 Eastview 排名数据。
- `hotpot_5680`：数据中存在重建 bug，导致某片段重复出现 4741 次（但未影响最终人工判断）。
- `hotpot_6274`：检索到的实体出生年份（1983）与期望答案对应的实体（出生 1961）不符，疑似检索到了同名的错误实体。
- `hotpot_1569`：文本中日期信息已损坏，无法还原具体生卒日期。

## 05-拓扑链重排消融实验

针对原始 `em=1`（完全正确）的 197 条题目，做了"末尾 chunk 整体移到前面"的消融测试：把拓扑链以 chunk（句子/实体来源）为单位，从中点切开，后半部分整体移到前半部分前面，之后重新调用 Recall LLM，看它还能不能选出覆盖 gold 答案的证据片段。

**结果**：重排后文本忠实度是 84.8%、部分 6.6%、否 8.6%。详见 `05-拓扑链重排消融实验/README.md`。关键发现：17 条（8.6%）原本答对的题目在重排后完全找不到证据，说明这些题高度依赖"正确答案恰好出现在链前部"这一顺序特征。
