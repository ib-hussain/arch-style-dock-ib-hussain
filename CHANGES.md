# Changes in 0.2.0

- Replaced competing lavender/frosted/glossy shelf rules and the dynamic
  transparency path with one graphite profile. Radius follows the displayed
  icon size, including automatic shrinking.
- Replaced continuous magnification polling with the new mockup's discrete
  neighbour profile. Animate image scale/lift and item margins together,
  include Show Applications and trash, and preserve unscaled indicators.
- Reserved hover space in the viewport while keeping the background at shelf
  height. Fixed-mode workspace struts track the shelf instead of the enlarged
  hover area.
- Consolidated visibility into one cancellable deadline with expiry-time
  pointer sampling. Removed competing dwell paths and the additional animation
  hide delay; retained intellihide-only operation and bounded edge wake to the
  correct monitor, including negative coordinates.
- Made menu, drag, keyboard, modal, overview, fullscreen and pressure decisions
  explicit. Coalesced focus changes so popup grabs can report their state before
  a visibility decision.
- Added cleanup for partial startup, watcher handles, pending work, per-icon
  subscriptions, preference signals and monitor subscriptions. Prevented
  repeated intellihide enable calls from accumulating window handlers.
- Added appearance controls and removed obsolete theme controls from the
  visible preferences. Indicator colours no longer depend on a hidden
  legacy theme switch.
- Corrected the GSettings override namespace and isolated enum IDs. Applied
  mockup defaults through an explicit installer option instead of resetting
  unrelated user settings.
- Made the missing custom logo non-fatal, supplied an Applications fallback,
  and restored missing upstream SVG assets.
- Added release/session diagnostics, source/schema/style validation,
  regression tests, a deterministic runtime package, an atomic installer and
  a rollback helper that preserves symlink targets.

See `VALIDATION.md` for the limits of automated evidence. This release does
not add compositor backdrop blur or modify GNOME's top panel.
