"""
spaCy 名词抽取服务
运行: python spacy-server.py
监听: http://localhost:5001/extract_nouns
"""

from flask import Flask, request, jsonify
import spacy

app = Flask(__name__)
app.config['JSON_AS_ASCII'] = False

# 加载英文模型
nlp = spacy.load("en_core_web_sm")

@app.route('/extract_nouns', methods=['POST'])
def extract_nouns():
    data = request.get_json()
    text = data.get('text', '')
    include_proper_nouns = data.get('include_proper_nouns', True)
    include_nouns = data.get('include_nouns', True)
    min_length = data.get('min_length', 2)

    doc = nlp(text)

    nouns = []
    noun_phrases = []

    for token in doc:
        if include_nouns and token.pos_ == 'NOUN' and len(token.text) >= min_length:
            nouns.append({
                'surface': token.text,
                'start': token.idx,
                'end': token.idx + len(token.text),
            })

    # 名词短语（NP chunks）
    for chunk in doc.noun_chunks:
        if include_proper_nouns:
            # 过滤掉纯停用词短语
            chunk_text = chunk.text.strip()
            if len(chunk_text) >= min_length and not chunk.root.pos_ == 'PRON':
                noun_phrases.append({
                    'surface': chunk_text,
                    'start': chunk.start_char,
                    'end': chunk.end_char,
                })

    return jsonify({
        'nouns': nouns,
        'noun_phrases': noun_phrases,
    })

if __name__ == '__main__':
    print("spaCy service starting on http://localhost:5001 ...")
    app.run(host='0.0.0.0', port=5001, threaded=True)
