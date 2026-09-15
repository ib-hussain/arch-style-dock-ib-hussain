#!/usr/bin/env python3
"""Rebuild the runtime stylesheet and its reproducibility record."""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main():
    try:
        import sass
    except ImportError:
        raise SystemExit('Install build dependencies: python3 -m pip install -r requirements-dev.txt')
    css = sass.compile(filename=str(ROOT / '_stylesheet.scss'), output_style='expanded')
    (ROOT / 'stylesheet.css').write_text(css)
    paths = ['_stylesheet.scss', '_mockup.scss', 'stylesheet.css']
    record = {name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest() for name in paths}
    (ROOT / 'tools/stylesheet-hashes.json').write_text(json.dumps(record, indent=2) + '\n')
    print('PASS: stylesheet rebuilt from SCSS')


if __name__ == '__main__':
    main()
