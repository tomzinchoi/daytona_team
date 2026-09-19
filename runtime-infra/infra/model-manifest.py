"""Executed only while baking the image, never downloading during a benchmark."""
import hashlib
import json
from pathlib import Path
import sys

root = Path('/opt/models')
models = {}
for model in ['qwen3-4b', 'deepseek-r1-distill-qwen-7b', 'gemma-3-4b']:
    path = root / (model + '.gguf')
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        if stream.read(4) != b'GGUF':
            raise SystemExit('Invalid GGUF file: ' + path.name)
        stream.seek(0)
        for chunk in iter(lambda: stream.read(8 * 1024 * 1024), b''):
            digest.update(chunk)
    models[model] = {'filename': path.name, 'bytes': path.stat().st_size, 'sha256': digest.hexdigest()}
(root / 'manifest.json').write_text(json.dumps({'llamaCppCommit': sys.argv[1], 'inference': 'CPU', 'models': models}), encoding='utf-8')
