#!/usr/bin/env python3
"""Offline source, schema, asset, GtkBuilder contract and regression checks."""
import ast
import hashlib
import json
import re
import shutil
import subprocess
import sys
import xml.etree.ElementTree as ET
from pathlib import Path
from common import ROOT, runtime_files, schema_compiler


def run(*args):
    subprocess.run(args, cwd=ROOT, check=True)


def validate(tests=True):
    if not shutil.which('node'):
        raise SystemExit('Node.js 18+ is required for syntax and regression checks.')
    runtime = runtime_files()
    scripts = [p for p in runtime if p.suffix == '.js']
    for path in scripts:
        run('node', '--check', str(path))
        for spec in re.findall(r"(?:from\s+|import\s*\()['\"](\.[^'\"]+)['\"]", path.read_text()):
            if not (path.parent / spec).resolve().is_file():
                raise ValueError(f'Missing local import: {path.name} -> {spec}')
    print(f'PASS: JavaScript syntax and local imports ({len(scripts)} files)', flush=True)
    for path in [*(ROOT / 'tools').glob('*.py'), *(ROOT / 'tests').glob('*.py')]:
        ast.parse(path.read_text(), filename=str(path))
    print('PASS: Python helper syntax', flush=True)

    meta = json.loads((ROOT / 'metadata.json').read_text())
    schema = ET.parse(ROOT / 'schemas/org.gnome.shell.extensions.arch-style-dock.gschema.xml')
    assert schema.find('schema').get('id') == meta['settings-schema']
    run(schema_compiler(), '--strict', '--dry-run', str(ROOT / 'schemas'))
    print('PASS: schema compilation, override and metadata identity', flush=True)

    ui = ET.parse(ROOT / 'Settings.ui')
    object_ids = [e.get('id') for e in ui.iter('object') if e.get('id')]
    assert len(object_ids) == len(set(object_ids)), 'Duplicate GtkBuilder IDs'
    prefs = (ROOT / 'prefs.js').read_text()
    for name in re.findall(r"get_object\(\s*'([^']+)'\s*\)", prefs):
        assert name in object_ids, f'Missing GtkBuilder object: {name}'
    for signal in ui.iter('signal'):
        handler = signal.get('handler')
        assert re.search(rf'\b{re.escape(handler)}\s*\(', prefs), f'Missing GtkBuilder handler: {handler}'
    print('PASS: GtkBuilder XML, IDs and signal-handler contracts', flush=True)

    record = json.loads((ROOT / 'tools/stylesheet-hashes.json').read_text())
    for name, expected in record.items():
        digest = hashlib.sha256((ROOT / name).read_bytes()).hexdigest()
        assert digest == expected, f'{name} changed; run python3 tools/build_css.py'
    try:
        import sass
    except ImportError:
        pass  # Hashes verify the checked-in build without a compiler dependency.
    else:
        expected = sass.compile(filename=str(ROOT / '_stylesheet.scss'), output_style='expanded')
        assert expected == (ROOT / 'stylesheet.css').read_text(), 'SCSS and CSS differ'
    css = (ROOT / 'stylesheet.css').read_text()
    for name in re.findall(r'url\([\'\"]?(\./media/[^)\'\"]+)', css):
        assert (ROOT / name).is_file(), f'Missing CSS asset: {name}'
    for name in ['apps-grid.svg', 'glossy.svg', 'highlight_stacked_bg.svg', 'highlight_stacked_bg_h.svg']:
        ET.parse(ROOT / 'media' / name)
    assert 'arch-theme-frosted' not in css and '224, 210, 238' not in css
    print('PASS: SCSS/CSS reproducibility and required assets', flush=True)
    if tests:
        run('node', '--experimental-vm-modules', '--test', *map(str, sorted((ROOT / 'tests').glob('*.test.mjs'))))
        run(sys.executable, '-m', 'unittest', 'discover', '-s', 'tests', '-p', 'test_*.py')
    print('PASS: automated validation complete. Live GNOME compositor acceptance is still required.', flush=True)


if __name__ == '__main__':
    try:
        validate()
    except (AssertionError, ValueError, subprocess.CalledProcessError) as error:
        print(f'FAIL: {error}', file=sys.stderr)
        sys.exit(1)
