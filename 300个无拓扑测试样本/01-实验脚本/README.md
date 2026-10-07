# 100 题人工审查脚本说明（早期批次）

本目录是早期 100 题人工审查留下的两个脚本。它们在本次"300 题合并"中未被直接使用，但属于实验历史的一部分，留档保存。

## list-non-em.cjs

```js
// 列出 details.json 中所有非 EM 的题号，用于人工抽样
// 输出：qid + question + predicted + gold
```

## check-questions.cjs

```js
// 检查每题的 predictedAnswer 是否在 source 的 passage 上下文中出现
// 用于判断 LLM 是否从给定文本里"读到"了答案
```

## 与 300 题合并的关系

`write-judgment-md.cjs` 是合并版的判定脚本，它内嵌了完整的 SEM/WRONG 判定字典，可以独立运行。
而 `list-non-em.cjs` / `check-questions.cjs` 是辅助工具，仅在手工审查早期阶段用于快速定位可疑样本。