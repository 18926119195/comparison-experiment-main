"""
将 flat docuverse 转换为 docuverse-corpus 格式，供 preprocess-only-s0.js 使用
"""

import json
import sys
import os

src = sys.argv[1] if len(sys.argv) > 1 else "data/hotpotqa/docuverse.json"
dst = sys.argv[2] if len(sys.argv) > 2 else "data/hotpotqa/docuverse-corpus.json"

print(f"Reading: {src}")
with open(src, "r", encoding="utf-8") as f:
    flat = json.load(f)

print(f"Chunks: {len(flat)}")

# 按 questionId 分组
by_qid = {}
for chunk in flat:
    qid = chunk.get("questionId")
    if qid not in by_qid:
        by_qid[qid] = []
    by_qid[qid].append({
        "key": chunk["chunkKey"],
        "text": chunk["text"],
        "page": 0,
    })

# 构建 bookIndex 结构
books = []
for qid, chunks in by_qid.items():
    books.append({
        "id": qid,
        "questionId": qid,
        "chunks": chunks,
    })

corpus = {
    "kind": "docuverse-corpus",
    "bookIndex": {
        "chunks": flat,  # 也保留 flat chunks 方便直接用
        "books": books,
    },
}

print(f"Writing: {dst}")
with open(dst, "w", encoding="utf-8") as f:
    json.dump(corpus, f, ensure_ascii=False)

print(f"Done. {len(books)} questions, total {len(flat)} chunks")
