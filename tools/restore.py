#!/usr/bin/env python3
"""Restore the backup printed by tools/install.py; keep the replaced version."""
import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import shutil
import subprocess
from install import UUID, SCHEMA, CONFLICTS, MOCKUP_VALUES


def restore_files(target, backup, had_previous, displaced):
    old = backup / 'extension'
    if had_previous and not (old.exists() or old.is_symlink()):
        raise ValueError('The previous extension entry is missing; this backup may already have been restored.')
    has_current = target.exists() or target.is_symlink()
    if has_current:
        target.rename(displaced)
    try:
        if had_previous:
            old.rename(target)
    except BaseException:
        if has_current:
            displaced.rename(target)
        raise


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('backup', type=Path, help='The exact Backup directory printed by the installer.')
    args = parser.parse_args()
    backup = args.backup.resolve()
    shell_dir = Path(os.environ.get('XDG_DATA_HOME', str(Path.home() / '.local/share'))) / 'gnome-shell'
    target = shell_dir / 'extensions' / UUID
    if backup.parent != (shell_dir / 'arch-style-dock-backups').resolve():
        raise SystemExit('Choose a backup from this user’s arch-style-dock-backups directory.')
    manifest = json.loads((backup / 'manifest.json').read_text())
    if manifest.get('uuid') != UUID or manifest.get('target') != str(target.absolute()):
        raise SystemExit('Backup target does not match this installation.')
    if (backup / 'restored.json').exists():
        raise SystemExit('This backup has already been restored.')
    had_previous = manifest.get('had_previous')
    if not isinstance(had_previous, bool):
        raise SystemExit('Invalid backup manifest.')
    old = backup / 'extension'
    if had_previous and not (old.exists() or old.is_symlink()):
        raise SystemExit('Previous extension entry is missing.')

    saved_file = backup / 'appearance-settings.json'
    saved = json.loads(saved_file.read_text()) if saved_file.exists() else {}
    enabled_file = backup / 'enabled-extensions.json'
    enabled = json.loads(enabled_file.read_text()) if enabled_file.exists() else None
    if saved and not shutil.which('gsettings'):
        raise SystemExit('gsettings is required to restore the saved appearance.')
    if enabled is not None and not shutil.which('gnome-extensions'):
        raise SystemExit('gnome-extensions is required to restore the saved dock selection.')

    # Use the new schema before replacing its files, so even old symlink
    # installations without compiled schemas can be restored.
    failures = []
    for key, value in saved.items():
        if key not in MOCKUP_VALUES or not isinstance(value, str):
            raise SystemExit('Unrecognised setting in backup.')
        result = subprocess.run(['gsettings', '--schemadir', str(target / 'schemas'),
                                 'set', SCHEMA, key, value], capture_output=True, text=True)
        if result.returncode:
            failures.append(key)
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    displaced = backup / ('replaced-on-restore-' + stamp)
    restore_files(target, backup, had_previous, displaced)
    (backup / 'restored.json').write_text(json.dumps({'displaced': str(displaced), 'time': stamp}) + '\n')
    if enabled is not None:
        affected = [UUID, *CONFLICTS]
        # Disable first, then restore the previous selection. Other extensions
        # are not part of this installation and keep their current state.
        installed = subprocess.check_output(['gnome-extensions', 'list'], text=True).splitlines()
        for selected in [False, True]:
            for uuid in affected:
                if uuid not in installed or (uuid in enabled) != selected:
                    continue
                result = subprocess.run(['gnome-extensions', 'enable' if selected else 'disable', uuid],
                                        capture_output=True, text=True)
                if result.returncode:
                    failures.append(uuid)
    print(f'Previous installation restored. Replaced files retained at: {displaced}')
    print('Log out and log back in to load the restored JavaScript on Wayland.')
    if failures:
        raise SystemExit('Files restored, but these settings could not be restored: ' + ', '.join(failures))


if __name__ == '__main__':
    main()
