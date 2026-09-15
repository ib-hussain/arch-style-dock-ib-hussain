# Upstream provenance

- Base project: Dash-to-Dock / Ubuntu Dock.
- Repository: https://github.com/micheleg/dash-to-dock
- Supplied fork provenance: branch `ubuntu-dock`, version 106.
- Commit identified by the supplied repository: `3e8c2a54192b29cbc20605ed278c6ca939d32a62`.
- Repaired fork release: Arch Style Dock 0.2.0, extension version 2.
- Licence: GPL-2.0-or-later; see `COPYING` and source headers.

The uploaded source was already a modified fork; this repair does not claim
that its complete base tree was independently diffed against upstream.
The missing `media/glossy.svg`, `media/highlight_stacked_bg.svg` and
`media/highlight_stacked_bg_h.svg` were restored from the identified commit.
`media/apps-grid.svg` is an original fallback supplied with this repair under
the same GPL-2.0-or-later licence. No original `media/logo.png` was included;
an installed copy is preserved when available.

The repair changes native styling, magnification, visibility scheduling,
lifecycle cleanup, preferences, diagnostics and standalone packaging. The
extension UUID, schema ID, path and enum IDs are specific to Arch Style Dock.
Upstream application actions and integration modules are retained. Historical
`rice-*` actor classes remain where they isolate the Show Applications artwork
from third-party Shell themes; these are not another extension identity.

The user's HTML references and wallpaper are retained as development inputs.
They are excluded from the installable extension ZIP. Their external artwork
is not copied into native application icons or assigned a new licence here.
