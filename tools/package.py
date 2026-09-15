#!/usr/bin/env python3
"""Create an installable extension zip from validated source."""
import json
import shutil
import subprocess
import tempfile
import zipfile
from pathlib import Path
from common import ROOT, runtime_files, schema_compiler
from validate import validate


def main():
    validate()
    metadata = json.loads((ROOT / 'metadata.json').read_text())
    output = ROOT / 'dist' / f'{metadata["uuid"]}.shell-extension.zip'
    output.parent.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='arch-dock-build-') as name:
        stage = Path(name)
        for path in runtime_files():
            target = stage / path.relative_to(ROOT)
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(path, target)
        subprocess.run([schema_compiler(), '--strict', str(stage / 'schemas')], check=True)
        temporary = output.with_suffix('.zip.tmp')
        with zipfile.ZipFile(temporary, 'w', zipfile.ZIP_DEFLATED) as archive:
            for path in sorted(stage.rglob('*')):
                if path.is_file():
                    info = zipfile.ZipInfo(path.relative_to(stage).as_posix(), (2026, 9, 15, 0, 0, 0))
                    info.external_attr = 0o100644 << 16
                    info.compress_type = zipfile.ZIP_DEFLATED
                    archive.writestr(info, path.read_bytes())
        temporary.replace(output)
    print(f'Package: {output}')


if __name__ == '__main__':
    main()
