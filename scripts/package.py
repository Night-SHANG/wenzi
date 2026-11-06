"""Package already-verified source, JS and production dependencies. No rebuild or network."""
from pathlib import Path
from datetime import datetime
from zoneinfo import ZoneInfo
import argparse
import hashlib
import json
import subprocess
import zipfile

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--out', default='artifacts/modular-text-world-0.3.0-alpha.1.zip')
args = parser.parse_args()
package = json.loads((root / 'package.json').read_text(encoding='utf-8'))
lock = json.loads((root / 'package-lock.json').read_text(encoding='utf-8'))
out = (root / args.out).resolve()
out.parent.mkdir(parents=True, exist_ok=True)
files = {}
for directory in ['src', 'dist', 'tests', 'docs', 'scripts', 'worlds', 'examples', '.github']:
    path = root / directory
    if not path.is_dir():
        raise SystemExit(f'Missing required directory: {directory}')
    for file in sorted(path.rglob('*')):
        if file.is_file() and not file.is_symlink() and '__pycache__' not in file.parts:
            files[file.relative_to(root).as_posix()] = file.read_bytes()
for name in ['package.json', 'package-lock.json', 'tsconfig.json', '.gitignore', 'README.md', 'THIRD_PARTY.md', 'run-demo.cmd', 'play-farm.cmd']:
    files[name] = (root / name).read_bytes()
for name, info in lock['packages'].items():
    if not name.startswith('node_modules/') or info.get('dev'):
        continue
    for file in sorted((root / name).rglob('*')):
        if file.is_file() and not file.is_symlink():
            files[file.relative_to(root).as_posix()] = file.read_bytes()
for report in ['preflight.json', 'built-smoke.json']:
    data = (root / 'artifacts' / report).read_bytes()
    evidence = json.loads(data)
    if evidence.get('ok') is not True:
        raise SystemExit(f'Cannot package failed verification: {report}')
    scope = 'preflight' if report == 'preflight.json' else 'built-smoke'
    current = subprocess.run(['node', str(root / 'scripts' / 'release-fingerprint.mjs'), scope, str(root)],
                             cwd=root, capture_output=True, text=True)
    if current.returncode:
        raise SystemExit(f'Cannot fingerprint verification inputs: {current.stderr.strip()}')
    if evidence.get('fingerprint') != json.loads(current.stdout):
        raise SystemExit(f'Cannot package stale verification: {report}; rerun verification for current inputs')
    files['verification/' + report] = data
commit = subprocess.run(['git', 'rev-parse', 'HEAD'], cwd=root, check=True, capture_output=True, text=True).stdout.strip()
bundle = root / 'artifacts' / 'repository.bundle'
subprocess.run(['git', 'bundle', 'create', str(bundle), '--all'], cwd=root, check=True, capture_output=True)
files['repository.bundle'] = bundle.read_bytes()
info = {'name': package['name'], 'version': package['version'], 'commit': commit,
        'builtAtBeijing': datetime.now(ZoneInfo('Asia/Shanghai')).isoformat(timespec='seconds'),
        'runtime': 'Node.js >=24.12.0', 'sourceAndRuntimeIncluded': True,
        'externalGitRepository': None}
files['BUILD.json'] = (json.dumps(info, ensure_ascii=False, indent=2) + '\n').encode('utf-8')
manifest = {name: hashlib.sha256(data).hexdigest() for name, data in sorted(files.items())}
files['verification/manifest-sha256.json'] = (json.dumps(manifest, indent=2) + '\n').encode('utf-8')
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    for name, data in sorted(files.items()):
        archive.writestr('modular-text-world/' + name, data)
digest = hashlib.sha256(out.read_bytes()).hexdigest()
out.with_suffix('.sha256').write_text(f'{digest}  {out.name}\n', encoding='ascii')
print(json.dumps({'file': str(out), 'bytes': out.stat().st_size, 'sha256': digest, 'entries': len(files), 'commit': commit}, indent=2))
