"""
一次性复现脚本（Python 版，等价于 experiments/fulltext-baseline/run-noCoT.cjs）
- 沿用同一份 hotpot_1911 题目与 34 个 chunk
- 同样的 system / user prompt
- 关闭思维链，temperature=0
- API_KEY: sk-cc0c5773a9bc4abaa16a55215833cc5f
"""

import json
import os
import time
import urllib.request
from collections import OrderedDict
from datetime import datetime
from pathlib import Path

API_KEY = "sk-cc0c5773a9bc4abaa16a55215833cc5f"
API_URL = "https://api.deepseek.com/chat/completions"
MODEL = "deepseek-flash"
ENABLE_THINKING = False
QUESTION_ID = "hotpot_1911"

ROOT = Path(__file__).resolve().parents[2]
RUN_TS = datetime.now().isoformat(timespec="seconds").replace(":", "-").replace(".", "-")
OUT_DIR = ROOT / "output" / f"fulltext-baseline-noCoT-{RUN_TS}"
DATA_PATH = ROOT / "data" / "hotpotqa" / "per-question.json"


def call_llm(system: str, user: str) -> dict:
    body = json.dumps({
        "model": MODEL,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "temperature": 0,
        "max_tokens": 384000,
    }).encode("utf-8")

    req = urllib.request.Request(
        API_URL,
        data=body,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {API_KEY}",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        return json.loads(resp.read().decode("utf-8"))


def evaluate_answer(predicted: str, expected: str) -> float:
    import re
    norm_pred = re.sub(r"[.。!！?？]+$", "", predicted.lower().strip())
    norm_exp = re.sub(r"[.。!！?？]+$", "", expected.lower().strip())
    if norm_pred == norm_exp:
        return 1.0
    if norm_exp in norm_pred or norm_pred in norm_exp:
        return 0.8
    pred_words = set(norm_pred.split())
    exp_words = set(norm_exp.split())
    match = sum(1 for w in exp_words if w in pred_words or w in norm_pred)
    return match / max(len(exp_words), 1)


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    print(f"输出目录: {OUT_DIR}")

    with DATA_PATH.open("r", encoding="utf-8") as f:
        data = json.load(f)
    entry = data["questions"][QUESTION_ID]
    question = entry["question"]
    expected_answer = entry["answer"]
    chunks = entry["chunks"]

    print(f"\n题目: {question}")
    print(f"期望答案: {expected_answer}")
    print(f"chunk 总数: {len(chunks)}")
    print(f"涉及实体: {len({c['title'] for c in chunks})} 个")

    by_title = OrderedDict()
    for c in chunks:
        by_title.setdefault(c["title"], []).append(c["text"])

    context_lines = []
    for title, texts in by_title.items():
        context_lines.append(f"[{title}]")
        for i, t in enumerate(texts):
            context_lines.append(f"{i}. {t}")
        context_lines.append("")
    context_text = "\n".join(context_lines).strip()

    system = "You are a precise question-answering assistant. Answer with only the short entity name (no explanation)."
    user = f"Context:\n{context_text}\n\nQuestion: {question}\n\nAnswer:"

    (OUT_DIR / "prompt.txt").write_text(
        f"=== SYSTEM ===\n{system}\n\n=== USER ===\n{user}\n\n"
        f"=== STATS ===\ncontext_chars={len(context_text)}, chunks={len(chunks)}, titles={len(by_title)}\n",
        encoding="utf-8",
    )
    print(f"\nprompt 已保存 (context {len(context_text)} chars, {len(chunks)} chunks, {len(by_title)} titles)")

    print(f"\n[fulltext-baseline-noCoT] 发送请求 (model={MODEL}, thinking={ENABLE_THINKING}, temp=0)...")
    t0 = time.time()
    resp = call_llm(system, user)
    elapsed_ms = int((time.time() - t0) * 1000)

    msg = (resp.get("choices") or [{}])[0].get("message") or {}
    predicted_answer = (msg.get("content") or "").strip()
    reasoning = msg.get("reasoning_content") or ""
    usage = resp.get("usage") or {}

    print(f"\nLLM 耗时: {elapsed_ms} ms")
    print(f"usage: prompt={usage.get('prompt_tokens')}, completion={usage.get('completion_tokens')}, "
          f"reasoning={(usage.get('completion_tokens_details') or {}).get('reasoning_tokens', 0)}")
    print(f"\npredictedAnswer: {predicted_answer[:300]}")
    print(f"expectedAnswer:  {expected_answer}")

    score = evaluate_answer(predicted_answer, expected_answer)
    em = 1 if score == 1 else 0
    print(f"\n>>> SCORE: {score} ({'EM' if em else 'no-EM'})")

    details = [{
        "qid": QUESTION_ID,
        "question": question,
        "expectedAnswer": expected_answer,
        "predictedAnswer": predicted_answer,
        "reasoning": reasoning[:5000],
        "score": score,
        "em": em,
        "contextChars": len(context_text),
        "chunkCount": len(chunks),
        "titleCount": len(by_title),
        "usage": {
            "prompt_tokens": usage.get("prompt_tokens"),
            "completion_tokens": usage.get("completion_tokens"),
            "total_tokens": usage.get("total_tokens"),
            "reasoning_tokens": (usage.get("completion_tokens_details") or {}).get("reasoning_tokens", 0),
            "cache_hit": (usage.get("prompt_tokens_details") or {}).get("cached_tokens", 0),
        },
        "elapsedMs": elapsed_ms,
        "apiConfig": {"model": MODEL, "thinking": ENABLE_THINKING, "temperature": 0, "max_tokens": 384000},
    }]

    (OUT_DIR / "fulltext-baseline-details.json").write_text(json.dumps(details, ensure_ascii=False, indent=2), encoding="utf-8")
    (OUT_DIR / "raw-response.json").write_text(json.dumps(resp, ensure_ascii=False, indent=2), encoding="utf-8")
    (OUT_DIR / "reasoning.txt").write_text(reasoning, encoding="utf-8")
    (OUT_DIR / "answer.txt").write_text(predicted_answer, encoding="utf-8")

    print(f"\n所有输出已保存到: {OUT_DIR}")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"运行失败: {e}")
        raise