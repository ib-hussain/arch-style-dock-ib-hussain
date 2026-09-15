#!/usr/bin/env python3
"""Read-only diagnostics for the current GNOME Shell session."""
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
from install import UUID, SCHEMA, CONFLICTS


def command(*args):
    if not shutil.which(args[0]):
        return 127, f'{args[0]} is not installed'
    try:
        result = subprocess.run(args, capture_output=True, text=True, timeout=15)
        return result.returncode, (result.stdout + result.stderr).strip()
    except subprocess.TimeoutExpired:
        return 124, f'{args[0]} timed out'


def main():
    data_home = Path(os.environ.get('XDG_DATA_HOME', str(Path.home() / '.local/share')))
    target = data_home / 'gnome-shell/extensions' / UUID
    print(f'UUID: {UUID}\nInstalled path: {target}\nResolved path: {target.resolve()}')
    print('Session type: ' + os.environ.get('XDG_SESSION_TYPE', 'unknown'))
    print(command('gnome-shell', '--version')[1])
    metadata_file = target / 'metadata.json'
    if metadata_file.is_file():
        metadata = json.loads(metadata_file.read_text())
        print(f'Files on disk: release={metadata.get("version-name")} version={metadata.get("version")}')
    else:
        print('FAIL: installed metadata is missing.')
    print('\nExtension state:\n' + command('gnome-extensions', 'info', UUID)[1])
    list_code, output = command('gnome-extensions', 'list', '--enabled')
    selected = list_code == 0 and UUID in output.splitlines()
    conflicts = [uuid for uuid in CONFLICTS if uuid in output.splitlines()]
    print('Enabled conflicting docks: ' + (', '.join(conflicts) or 'none reported'))
    print('\nEffective settings:')
    for key in ['dock-position', 'dash-max-icon-size', 'dock-roundness', 'magnification-enabled',
                'magnification-strength', 'autohide', 'intellihide', 'dock-fixed', 'manualhide',
                'show-delay', 'hide-delay', 'require-pressure-to-show', 'debug-logging']:
        code, value = command('gsettings', '--schemadir', str(target / 'schemas'), 'get', SCHEMA, key)
        print(f'  {key}: {value}')
        if code:
            print('  Cannot read remaining settings; check the installation/schema path.')
            break

    code, output = command('gdbus', 'call', '--session', '--dest', 'org.freedesktop.DBus',
                           '--object-path', '/org/freedesktop/DBus',
                           '--method', 'org.freedesktop.DBus.GetConnectionUnixProcessID', 'org.gnome.Shell')
    match = re.search(r'uint32\s+(\d+)', output) if code == 0 else None
    if not match:
        print('\nUNVERIFIED: no current GNOME Shell process could be identified.\n' + output)
        return 2
    pid = match.group(1)
    code, logs = command('journalctl', '--user', '-b', f'_PID={pid}', '--no-pager', '-o', 'cat', '-n', '4000')
    print(f'\nCurrent Shell PID={pid}; extension messages from its most recent 4000 journal lines:')
    lines = [line for line in logs.splitlines() if f'[{UUID}]' in line]
    print('\n'.join(lines[-80:]) or 'No matching messages available.')
    # Prefer the last enable attempt, rather than an old attempt in this Shell.
    starts = [i for i, line in enumerate(lines) if 'release=0.2.0' in line]
    recent = lines[starts[-1]:] if starts else []
    failures = [line for line in recent if any(word in line for word in ['error=', 'result=fail', ' failed'])]
    enabled_ok = (any('phase=enable result=ok' in line for line in recent) and
                  any('dock manager started' in line for line in recent) and
                  any('pointer-watch=installed' in line for line in recent))
    other_errors = [line for line in logs.splitlines() if 'JS ERROR' in line and f'[{UUID}]' not in line]
    if other_errors:
        print('\nOther JavaScript errors in this Shell (may belong to other extensions):\n' + '\n'.join(other_errors[-15:]))
    if code or not selected or not enabled_ok or failures or conflicts:
        print('\nUNVERIFIED: expected a current release=0.2.0 startup and phase=enable result=ok, with no subsequent dock errors or conflicts.')
        return 1
    print('\nPASS: current-session startup evidence found. Complete the visual and interaction checks in VALIDATION.md.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
