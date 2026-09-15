# Arch Style Dock 0.2.0

An independent GNOME Shell extension based on Ubuntu Dock / Dash-to-Dock,
repaired against `dev/dev+production-mockup.html`. The new graphite appearance
replaces the old lavender/frosted theme paths. No UbuntuRicePack checkout is required.

The source, build and 39 automated regression checks pass. GNOME Shell 48, 49
and 50 are the declared targets; **live GNOME compositor acceptance has not
been performed in the build environment**. Start with GNOME 50.1 on Wayland,
using `VALIDATION.md`. This is not a claim of flawless or pixel-identical rendering.

## Install in isolation

Extract the source archive into a **new directory**, then open a terminal in
that extracted `arch-style-dock-0.2.0` directory. Requirements: Python 3.9+,
Node.js 18+, `glib-compile-schemas`, and a running GNOME session providing
`gsettings` and `gnome-extensions`. No npm install or Sass compiler is needed
to install the supplied build.

1. Run this one-line command. It validates all source before changing the installation:

   ```bash
   python3 tools/install.py --mockup-defaults --enable
   ```

2. **Log out and log back in.** GNOME on Wayland must load the new JavaScript
   in a fresh Shell process. If the installer reports that GNOME has not yet
   discovered the UUID, run the printed activation command after login:

   ```bash
   python3 tools/activate.py
   ```

3. Run these two verification commands from the extracted source directory:

   ```bash
   gnome-extensions info arch-style-dock@ib-hussain
   ```

   ```bash
   python3 tools/doctor.py
   ```

**Pass:** the extension is active/enabled, version 2; diagnostics show a
current-session `release=0.2.0`, `pointer-watch=installed`,
`dock manager started` and `phase=enable result=ok`, with no dock errors or
enabled conflicting docks. **Fail:** ERROR/inactive state, an old release,
missing startup evidence, repeated errors, or a failed interaction check in
`VALIDATION.md`. Missing journal access is unverified, not a successful test.

The installer stages a complete runtime copy, compiles its schemas and backs
up the existing extension entry before replacing it. If that entry is a
symlink, the linked repository is left untouched. An existing `media/logo.png`
is retained; otherwise the bundled Applications grid icon is used because
the uploaded repository did not contain the original logo.

`--mockup-defaults` backs up and sets only visual preferences: 50 px icons,
0.32 roundness, enabled magnification at strength 0.5, and the existing grey
DOTS with a 1 px white outline. Position, favourites, hide delays and other
behavioural choices stay in place. `--enable` selects this dock and disables
enabled Ubuntu Dock, upstream Dash-to-Dock or Rice Dock. Activation failure
restores the previous affected selection and reports any restoration failure.
Without these flags, installation changes files only.

To validate staging without installing or changing settings:

```bash
python3 tools/install.py --dry-run
```

## Restore the previous installation

Keep the exact `Backup:` directory printed by the installer. It also prints a
complete quoted rollback command. From this source directory, the equivalent is:

```bash
python3 tools/restore.py /absolute/path/printed/as/Backup
```

Then log out and back in. This restores the original directory or symlink,
the visual values saved by `--mockup-defaults`, and the affected dock selection
saved by `--enable`. The replaced repaired files are retained beside the
backup. A failed file replacement rolls back automatically. No script uses
sudo or writes to the main UbuntuRicePack repository.

## Mockup mapping

| Detail | Native implementation at the default 50 px size |
| --- | --- |
| Shelf | Graphite `rgba(83,83,83,0.35)`, white 0.18 border, simple shadow |
| Size and corners | 68 px shelf, 20 px screen gap; radius = displayed icon size × 0.32 |
| Focused image | 1.5× scale, effective 15 px lift away from the screen edge |
| Immediate neighbours | 1.2× scale, effective 7.2 px lift |
| Second neighbours | 1.1× scale, no lift |
| Hover spacing | 13 px animated layout margins on both sides of the hovered item |
| Timing | 300 ms image transition; 200 ms margins and trash image transition |
| Trash | 94% image size, separate leading gap/border, hover nudge |
| Running state | Existing indicators remain on the unscaled icon container |
| Keyboard/reduced motion | Keyboard focus uses the same profile; disabled Shell animations use zero duration |

Magnification starts when an image is hovered or its button gains keyboard
focus, matching the new discrete mockup. It includes Show Applications and
resets during menus, dragging and hiding. Scaling and lift rotate for top,
left and right docks; RTL leading trash spacing is mirrored. Real padding
reserves room for enlarged pixels inside the scroll view.

The HTML uses browser `backdrop-filter`; this release keeps the previously
agreed tinted translucent treatment and **does not add wallpaper blur**.
Opacity is raised from the HTML's 0.25 to 0.35. Native easing is
`EASE_OUT_QUAD`, and the trash image margin is represented by a centre nudge.
System application artwork replaces the mockup's fixed image set. Its top
menu bar is outside this dock extension's scope. These are deliberate
adaptations, not browser pixel parity.

## Preferences and visibility

Appearance exposes magnification, strength, proportional roundness, indicator
style/colours and a “Use mockup appearance” button. Former theme and
transparency widgets are hidden; old stored theme keys cannot override the
graphite shelf. Deprecated keys remain readable for settings compatibility.

One controller owns show/hide deadlines. Repeated pointer/window updates do
not restart a pending deadline, and pointer state is sampled again when it
expires. The animation no longer adds a second hide delay. Overview, fixed
mode, menus, dragging and keyboard access take precedence over ordinary
autohide timing. Intellihide shows the dock when no eligible window overlaps;
use pure autohide or an overlapping window when measuring delays.

Settings are isolated under `org.gnome.shell.extensions.arch-style-dock`, at
`/org/gnome/shell/extensions/arch-style-dock/`. The corrected override applies
to that schema; Ubuntu Dock's schema is not modified.

## Development

Run all offline checks, including `node --check` on every runtime JavaScript file:

```bash
python3 tools/validate.py
```

Run JavaScript regressions only:

```bash
npm test
```

Rebuild the installable runtime ZIP after source changes:

```bash
python3 tools/package.py
```

The resulting `dist/arch-style-dock@ib-hussain.shell-extension.zip` contains the
runtime and compiled schema. The source archive's installer is recommended
because it also preserves the previous installation and settings. Runtime
ZIP installation alone does not perform that backup or choose between docks.

Only when editing Sass, run these commands one at a time:

```bash
python3 -m venv .venv
```

```bash
.venv/bin/python -m pip install -r requirements-dev.txt
```

```bash
.venv/bin/python tools/build_css.py
```

```bash
.venv/bin/python tools/validate.py
```

Edit `_mockup.scss` or `_stylesheet.scss`; do not edit generated
`stylesheet.css` by hand. Build hashes catch stale generated CSS, and
validation recompiles it when the pinned compiler is available. Reference
HTML and wallpaper remain in `dev/`; they are not loaded by GNOME.

See `VALIDATION.md` for evidence and native acceptance, `CHANGES.md` for the
repair summary, and `UPSTREAM.md` / `COPYING` for provenance and GPL licensing.
