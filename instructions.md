Completed: [](sandbox:/workspace/scratch/3b771442d718/arch-style-dock-0.2.0.zip)

Implemented graphite styling, coordinated magnification and spacing, visibility scheduling fixes, cleanup, preferences, and installation/rollback tools.

**39 tests passed**, plus syntax, schema, stylesheet and package checks. Live GNOME 50.1 Wayland validation remains necessary; wallpaper blur is not included.

1. Extract into a **new folder**, open a terminal there, and run:

   ```bash
   python3 tools/install.py --mockup-defaults --enable
   ```

2. **Log out and back in.** If the installer prints an activation command, run it after login.

3. Run these two verification commands from the extracted folder:

   ```bash
   gnome-extensions info arch-style-dock@ib-hussain
   ```

   ```bash
   python3 tools/doctor.py
   ```

Pass criteria: active extension, version 2 / release 0.2.0, and no dock errors or conflicting docks. The included `VALIDATION.md` covers visual checks; `README.md` explains rollback.
