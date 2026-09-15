# Validation record — Arch Style Dock 0.2.0

Checked on 15 September 2026 against the supplied repository and production
mockup. Automated checks pass. **Live GNOME rendering and interaction are not
yet verified.** The build workspace has no GNOME Shell compositor, GJS runtime
or native GTK4 preferences runner, so it cannot establish flawless GNOME 50.1
Wayland behaviour or cross-distribution certification.

## Automated evidence

Build environment: Node.js 24.19.0, Python 3.12.14, GLib schema compiler
2.80.0, LibSass 0.23.0 and ESLint 9.39.1. The older GLib compiler validates
schema syntax; it does not substitute for GNOME 50 runtime testing.

| Check | Result and scope |
| --- | --- |
| JavaScript | `node --check` and relative imports pass for all 26 runtime JS files |
| Python | Helper syntax and 10 installer/activation/rollback regressions pass |
| GSettings | Native `glib-compile-schemas --strict` accepts the schema and corrected override |
| Preferences | XML parses; GtkBuilder IDs and named handlers match `prefs.js` |
| Styles | LibSass 0.23.0 rebuild is reproducible; source/CSS hashes match |
| Assets | Required SVGs parse and CSS asset paths exist; optional user logo has a fallback |
| JavaScript regressions | 29 tests pass; no failures or skipped tests |
| Correctness lint | Runtime JS passes undefined-name, unreachable-code, duplicate-member and constructor checks |

JavaScript tests import the actual production model, magnification, theme,
visibility and extension modules. GI/Shell objects are boundary doubles. They
verify behaviour and cleanup contracts; they **do not render Clutter, load
native St CSS, execute GtkBuilder or emulate the entire Shell**. The Node
VM-module experimental warning comes from the harness, not GNOME runtime code.

Coverage includes hover boundaries, neighbour scaling, margins, trash and Show
Applications, four orientations, monitor scale, negative monitor coordinates,
reduced motion, keyboard focus, overlapping menu/drag states, icon replacement
and removal, repeated teardown, startup failure, conflicts and ten activation
cycles. Fake-clock cases check exact three-second show/hide deadlines,
stationary pointers, repeated restacks, cancellation, reversal, timer ID zero
and retryable animation failures. Filesystem tests check directory backup,
absolute/relative symlinks, first-install rollback, replacement failures and
preservation of unrelated enabled extensions.

Reproduce checks from the source directory:

```bash
python3 tools/validate.py
```

`validation.log` captures the final validation/package run. Packaging repeats
required checks before creating the runtime ZIP. Sass recompilation needs the
optional build environment in `README.md`; installation uses the supplied CSS.

## Native acceptance on GNOME 50.1 Wayland

Install using `README.md`, log out and back in, then run its two verification
commands. Diagnostics identify the current Shell PID through the session bus
and select that PID's journal lines from the current boot. This avoids mistaking
an earlier login's messages for the running extension. Missing journal access
is reported as unverified.

| Scenario | Pass criterion |
| --- | --- |
| Fresh login | Active dock; current 0.2.0 startup evidence; no dock JS errors or duplicate dock |
| Resting appearance | Graphite shelf, proportional corners, readable on light/dark/busy wallpaper |
| Hover sweep | First/middle/last icons and Show Applications follow 1.5/1.2/1.1 scales; row makes space and returns smoothly |
| Trash | Distinct gap/border; clickable enlarged image; no clipping or misplaced indicator |
| Fast direction changes | No flicker loop, stuck scale, drifting icons or lasting gaps |
| App actions | Launch, focus, minimise, previews, right-click menus and running dots operate |
| Drag/favourites | Reorder/add/remove favourites, cancel drag, then hover; no stale transforms or lost interaction |
| Delay timing | Autohide on, intellihide off, pressure off: three-second deadlines run once and are not reset by stationary pointer or restacks |
| Intellihide | Eligible overlapping windows cause hiding; clear workspace shows the dock |
| Menus/overview | Own menus, drag and keyboard interaction keep the dock accessible; no focus-grab twitch |
| Fullscreen | Fullscreen reveal and pressure preferences are honoured |
| Fixed mode | Maximised windows reserve shelf space without a large empty hover band |
| Settings | Appearance updates immediately; reopening preferences does not duplicate monitors or handlers |
| Displays | Bottom/top/left/right, 100%/200% scale, RTL, negative coordinates and hotplug remain usable |
| Crowded dock | Small screen/many apps trigger orderly shrinking or scrolling; enlarged edge icons stay visible and clickable |
| Session lifecycle | Disable/enable ten times, lock/unlock, suspend/resume and fresh login produce no growing errors or duplicate actors |
| Coexistence | A conflicting dock suspends this dock; disabling that conflict resumes it once |
| Rollback | Restore command recovers the former extension entry and saved values after a fresh login |

Measure ordinary delays separately from the deliberate immediate policies for
overview, fixed mode, active interaction and suppression. At the monitor edge,
allow approximately one 40 ms watcher interval plus scheduler latency; the
configured animation time follows the deadline. Animation completion is not
expected at exactly the delay boundary.

The original three-second delay complaint is covered by deterministic tests
of the scheduling path. Its live symptom cannot be declared resolved until
the corresponding native scenario passes. If a check fails, retain the two
verification outputs and record the failing row, monitor layout, and whether
it also occurs with other visual extensions disabled.

## Native adaptations and limits

- The agreed translucent graphite substitute is implemented; browser backdrop
  blur is not. This is the principal visual difference from the HTML.
- Native easing, system artwork and the trash image's margin adaptation prevent
  a claim of browser pixel identity.
- Top-panel styling is outside this extension. The mockup's decorative dot does
  not replace application running indicators.
- XML checks cannot prove the preferences window opens. Native input picking,
  CSS parsing, animation smoothness and performance require live acceptance.
- GNOME 48/49 and Arch/Ubuntu remain declared targets pending native runs.
  GNOME 45–47 and 51 are not advertised in metadata.

API decisions were cross-checked against primary source:
[GNOME 50.1 PointerWatcher](https://github.com/GNOME/gnome-shell/blob/50.1/js/ui/pointerWatcher.js),
[GNOME 50.1 layout/chrome](https://github.com/GNOME/gnome-shell/blob/50.1/js/ui/layout.js),
[GNOME 50.1 dash](https://github.com/GNOME/gnome-shell/blob/50.1/js/ui/dash.js),
and [Clutter clipping](https://gnome.pages.gitlab.gnome.org/mutter/clutter/method.Actor.set_clip.html).
PointerWatcher returns a removable watch object and reports coordinate changes;
this is why expiry-time sampling is required for a stationary pointer.
