# Rice Dock

Rice Dock is Ibrahim Hussain's cross-distribution GNOME dock. It is based on
Ubuntu Dock / Dash-to-Dock 106 and is intended to run unchanged on Ubuntu and
Arch Linux with GNOME Shell 48 or 50.

## Rice-specific behavior

- The Show Applications actor is constructed directly from `media/logo.png`.
  No symbolic icon or CSS background is left underneath it.
- Ubuntu Dock and upstream Dash-to-Dock are runtime conflicts. Rice Dock
  suspends itself while either one is active and resumes when the conflict is
  disabled.
- Lifecycle and error messages use the journal prefix
  `[rice-dock@ib-hussain]`.
- Existing settings remain under
  `org.gnome.shell.extensions.dash-to-dock`, so the curated rice settings and
  Ubuntu Dock settings are reusable.

Replace `media/logo.png` before installation to use a different distribution
logo. Keep the filename unchanged.

When changing `_stylesheet.scss`, regenerate the checked-in runtime stylesheet:

```bash
sass --no-source-map _stylesheet.scss stylesheet.css
```

## Logs

After logging out and back in:

```bash
journalctl --user -b -o cat | grep -F '[rice-dock@ib-hussain]'
```

## Upstream and license

The dock engine is derived from the Ubuntu Dock branch of
https://github.com/micheleg/dash-to-dock at upstream version 106. It remains
licensed under GPL-2.0-or-later; see `COPYING`.
