#!/usr/bin/env python3
"""Validate, stage, back up and install this extension without sudo."""
import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import shutil
import shlex
import subprocess
import tempfile
from common import ROOT, runtime_files, schema_compiler
from validate import validate

UUID = 'arch-style-dock@ib-hussain'
SCHEMA = 'org.gnome.shell.extensions.arch-style-dock'
CONFLICTS = ['ubuntu-dock@ubuntu.com', 'dash-to-dock@micxgx.gmail.com', 'rice-dock@ib-hussain']
MOCKUP_VALUES = {
    'dash-max-icon-size': '50', 'dock-roundness': '0.32',
    'magnification-enabled': 'true', 'magnification-strength': '0.5',
    'apply-custom-theme': 'false', 'unity-backlit-items': 'false',
    'running-indicator-style': "'DOTS'", 'custom-theme-customize-running-dots': 'true',
    'custom-theme-running-dots-color': "'rgb(192,191,188)'",
    'custom-theme-running-dots-border-color': "'rgb(255,255,255)'",
    'custom-theme-running-dots-border-width': '1',
}


def activate():
    """Select this dock, rolling back the affected selection on failure."""
    enabled = subprocess.check_output(['gnome-extensions', 'list', '--enabled'], text=True).splitlines()
    disabled = []
    try:
        for uuid in CONFLICTS:
            if uuid in enabled:
                subprocess.run(['gnome-extensions', 'disable', uuid], check=True, capture_output=True, text=True)
                disabled.append(uuid)
        subprocess.run(['gnome-extensions', 'enable', UUID], check=True, capture_output=True, text=True)
    except subprocess.CalledProcessError as error:
        failures = []
        if UUID not in enabled:
            result = subprocess.run(['gnome-extensions', 'disable', UUID], capture_output=True, text=True)
            # An undiscovered UUID is already disabled; that error is harmless.
        for uuid in disabled:
            result = subprocess.run(['gnome-extensions', 'enable', uuid], capture_output=True, text=True)
            if result.returncode:
                failures.append(uuid)
        detail = (error.stderr or str(error)).strip()
        print(f'Activation failed: {detail}')
        if failures:
            print('Could not restore these previously enabled docks: ' + ', '.join(failures))
        else:
            print('Previous dock selection restored.')
        return False
    return True


def atomic_install(stage, target, backup):
    """Move the old entry itself, preserving a symlink's external repository."""
    old = backup / 'extension'
    had_old = target.exists() or target.is_symlink()
    if had_old:
        target.rename(old)
    try:
        os.replace(stage, target)
    except BaseException:
        if had_old:
            old.rename(target)
        raise


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--mockup-defaults', action='store_true', help='Back up and apply only the mockup visual settings.')
    parser.add_argument('--enable', action='store_true', help='Select this dock; disable installed conflicting docks.')
    parser.add_argument('--dry-run', action='store_true', help='Validate and stage without changing the installed extension.')
    args = parser.parse_args()
    validate()
    if (args.enable and not shutil.which('gnome-extensions')) or (args.mockup_defaults and not shutil.which('gsettings')):
        raise SystemExit('Run the installer in your GNOME desktop session; required GNOME commands are missing.')

    data_home = Path(os.environ.get('XDG_DATA_HOME', str(Path.home() / '.local/share')))
    shell_dir = data_home / 'gnome-shell'
    target = shell_dir / 'extensions' / UUID
    target.parent.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    backup = shell_dir / 'arch-style-dock-backups' / stamp
    with tempfile.TemporaryDirectory(prefix='arch-dock-stage-', dir=target.parent) as temp:
        stage = Path(temp) / UUID
        stage.mkdir()
        for source in runtime_files():
            dest = stage / source.relative_to(ROOT)
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, dest)
        # The archive omitted logo.png; retain an already-installed custom logo.
        old_logo = target / 'media/logo.png'
        if not (stage / 'media/logo.png').exists() and old_logo.is_file():
            shutil.copy2(old_logo, stage / 'media/logo.png')
        subprocess.run([schema_compiler(), '--strict', str(stage / 'schemas')], check=True)
        if args.dry_run:
            print('PASS: install staging verified; installed extension and settings were not changed.')
            return

        backup.mkdir(parents=True)
        (backup / 'manifest.json').write_text(json.dumps({
            'uuid': UUID, 'target': str(target.absolute()),
            'had_previous': target.exists() or target.is_symlink(),
        }, indent=2) + '\n')
        if args.mockup_defaults:
            saved = {}
            for key in MOCKUP_VALUES:
                saved[key] = subprocess.check_output(['gsettings', '--schemadir', str(stage / 'schemas'),
                                                     'get', SCHEMA, key], text=True).strip()
            (backup / 'appearance-settings.json').write_text(json.dumps(saved, indent=2) + '\n')
        enabled = []
        if args.enable:
            enabled = subprocess.check_output(['gnome-extensions', 'list', '--enabled'], text=True).splitlines()
            (backup / 'enabled-extensions.json').write_text(json.dumps(enabled, indent=2) + '\n')
        atomic_install(stage, target, backup)

    if args.mockup_defaults:
        changed = []
        try:
            for key, value in MOCKUP_VALUES.items():
                subprocess.run(['gsettings', '--schemadir', str(target / 'schemas'), 'set', SCHEMA, key, value], check=True)
                changed.append(key)
        except subprocess.CalledProcessError:
            failed = []
            for key in changed:
                result = subprocess.run(['gsettings', '--schemadir', str(target / 'schemas'), 'set', SCHEMA, key, saved[key]], check=False)
                if result.returncode:
                    failed.append(key)
            detail = 'Prior values restored.' if not failed else 'Could not restore: ' + ', '.join(failed)
            raise SystemExit(f'Appearance update failed. {detail} Backup: {backup}')
    if args.enable:
        if not activate():
            print('If this UUID is newly installed, log out and back in, then run:')
            print('python3 ' + shlex.quote(str(ROOT / 'tools/activate.py')))
    print(f'Installed: {target}')
    print(f'Backup: {backup}')
    print('Rollback: python3 ' + shlex.quote(str(ROOT / 'tools/restore.py')) + ' ' + shlex.quote(str(backup)))
    print('Log out and log back in to load the new JavaScript on Wayland.')


if __name__ == '__main__':
    main()
