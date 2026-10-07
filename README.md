# 对比实验 (Comparison Experiment)

多跳问答的 Recall-Reasoning 流水线，对比 **Phase C+ + 30s cache wait** 与其它 cache 策略。

## 文件说明

- `ablation.js` — 主入口脚本（Recall / Reasoning 两阶段流水线）
- `preprocess-only-s0.js` — 只跑 Stage 0 (实体抽取) 的预处理脚本
- `convert-docuverse.py` — 把 HotpotQA 转成内部 docuverse 格式
- `spacy-server.py` — Stage 0 用的 spaCy 实体抽取 HTTP 服务
- `final-noun-index.json` — 300 道题的拓扑链名词索引
- `data/hotpotqa/` — HotpotQA 题目 + docuverse + 名词索引数据
- `output/` — 各次测试运行结果（已 gitignore）

## 跑题示例

```bash
$env:MODE="recall"
$env:LIMIT="1"
$env:OFFSET="150"          # 跑第 151 道题
$env:CACHE_WAIT_MS="30000" # Recall 后等 30s，让 cache unit 落盘
node ablation.js
```

## 关键结论

详见 `output/test-150/recall-hotpot_4596/summary.json`：
- **Reasoning 41.8% cache hit** — 同次 run 命中 Recall 的 cache unit
- **Recall 95.9% cache hit** — 跨 run 命中之前的 cache

证明 Phase C+ + 30s 等待能让 Reasoning 阶段吃上 Recall 留下的 cache prefix。
