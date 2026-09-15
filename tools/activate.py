#!/usr/bin/env python3
"""Select Arch Style Dock after GNOME has discovered its installation."""
import shutil
from install import activate

if __name__ == '__main__':
    if not shutil.which('gnome-extensions'):
        raise SystemExit('Run this command from a terminal in your GNOME session.')
    if not activate():
        raise SystemExit(1)
    print('Arch Style Dock selected. Run python3 tools/doctor.py to check the running release.')
