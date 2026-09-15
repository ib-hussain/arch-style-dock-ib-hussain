"""Build helpers. No network access, sudo, or desktop changes."""
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parents[1]


def schema_compiler():
    compiler = shutil.which('glib-compile-schemas')
    if not compiler:
        candidates = list(Path('/usr/lib').glob('*/glib-2.0/glib-compile-schemas'))
        compiler = str(candidates[0]) if candidates else None
    if not compiler:
        raise SystemExit('glib-compile-schemas is required (Ubuntu: libglib2.0-bin; Arch: glib2).')
    return compiler


def runtime_files():
    paths = [*ROOT.glob('*.js'), ROOT / 'metadata.json', ROOT / 'Settings.ui',
             ROOT / 'stylesheet.css', ROOT / 'COPYING', ROOT / 'README.md', ROOT / 'UPSTREAM.md',
             ROOT / 'CHANGES.md', ROOT / 'VALIDATION.md']
    for folder in ['dependencies', 'media', 'schemas']:
        paths.extend(p for p in (ROOT / folder).rglob('*') if p.is_file() and p.suffix != '.compiled')
    return sorted(set(paths))
