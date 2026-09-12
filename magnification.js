// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-

import {Clutter} from './dependencies/gi.js';

import {Docking, Utils} from './imports.js';

const Labels = Object.freeze({
    MOTION: Symbol('magnification-motion'),
    SETTINGS: Symbol('magnification-settings'),
});

const ANIM_DURATION = 90;          // ms — must be fast enough to feel live
const LIFT_FACTOR = 0.32;          // translation_y = -iconSize * LIFT_FACTOR * weight

/**
 * macOS-style dock magnification.
 *
 * Design notes:
 *  - We hook `motion-event` on the dash's icon container, not on individual
 *    icons. One handler, N transforms per frame, no per-icon signal soup.
 *  - Weight function is (1 - d/R)^2 with a hard cutoff at R. Neighbours two
 *    slots away get weight ≈ 0.04 at R=70 — the "one or two adjacent icons
 *    barely move" behaviour that feels right.
 *  - Every actor transform is wrapped in try/catch. A bad frame must not take
 *    down the dock.
 *  - Settings reads use a safe getter that returns defaults if a key is
 *    missing or malformed.
 */
export class Magnification {
    constructor(dock) {
        this._dock = dock;
        this._dash = dock.dash;
        this._signalsHandler = new Utils.GlobalSignalsHandler();
        this._active = false;
        this._icons = [];
        this._baseCenters = [];

        this._bindSettings();
        this._sync();
    }

    destroy() {
        this._disable();
        this._signalsHandler?.destroy();
        this._signalsHandler = null;
        this._icons = null;
        this._baseCenters = null;
        this._dash = null;
        this._dock = null;
    }

    /* ------------------------------------------------------------------ */
    /* Settings                                                            */
    /* ------------------------------------------------------------------ */

    _settings() {
        return Docking.DockManager.settings;
    }

    _readBool(key, fallback) {
        try {
            const value = this._settings()[key];
            return value === undefined || value === null ? fallback : Boolean(value);
        } catch (e) {
            console.warn(`[arch-style-dock] magnification: bad read of ${key}: ${e}`);
            return fallback;
        }
    }

    _readNumber(key, fallback) {
        try {
            const value = Number(this._settings()[key]);
            return Number.isFinite(value) ? value : fallback;
        } catch (e) {
            console.warn(`[arch-style-dock] magnification: bad read of ${key}: ${e}`);
            return fallback;
        }
    }

    _bindSettings() {
        const settings = this._settings();
        ['magnification-enabled',
         'magnification-strength',
         'magnification-radius',
         'dash-max-icon-size',
        ].forEach(key => {
            this._signalsHandler.addWithLabel(Labels.SETTINGS, settings,
                `changed::${key}`, () => this._sync());
        });
        // Icon list rebuilds whenever the dash repopulates.
        this._signalsHandler.addWithLabel(Labels.SETTINGS, this._dash,
            'icon-size-changed', () => this._measure());
    }

    _sync() {
        const enabled = this._readBool('magnificationEnabled', true);
        if (enabled && !this._active)
            this._enable();
        else if (!enabled && this._active)
            this._disable();
    }

    /* ------------------------------------------------------------------ */
    /* Lifecycle                                                           */
    /* ------------------------------------------------------------------ */

    _enable() {
        if (this._active)
            return;

        this._active = true;

        try {
            const container = this._dash._dashContainer;
            if (!container) {
                console.warn('[arch-style-dock] magnification: dash container not ready');
                this._active = false;
                return;
            }

            this._signalsHandler.addWithLabel(Labels.MOTION, container,
                'motion-event', () => this._onMotion());
            this._signalsHandler.addWithLabel(Labels.MOTION, container,
                'leave-event', () => this._reset());
            this._signalsHandler.addWithLabel(Labels.MOTION, this._dash,
                'destroy', () => this._disable());

            this._measure();
        } catch (e) {
            console.error(`[arch-style-dock] magnification enable failed: ${e}`);
            this._active = false;
        }
    }

    _disable() {
        if (!this._active)
            return;

        this._active = false;
        try {
            this._signalsHandler.removeWithLabel(Labels.MOTION);
            this._reset();
        } catch (e) {
            console.error(`[arch-style-dock] magnification disable failed: ${e}`);
        }
    }

    /* ------------------------------------------------------------------ */
    /* Geometry                                                            */
    /* ------------------------------------------------------------------ */

    _measure() {
        if (!this._active)
            return;

        try {
            const icons = this._dash.getAppIcons();
            this._icons = icons;

            // Scale factor: stage coordinates are in device pixels, pointer
            // coordinates are physical pixels. Normalise both to logical.
            // const scale = Clutter.get_default_text_direction && // sanity
            //     St?.ThemeContext ? 1 : 1; // placeholder, see below

            this._baseCenters = icons.map(icon => {
                const [x] = icon.get_transformed_position();
                const [w] = icon.get_transformed_size();
                return x + w / 2;
            });
        } catch (e) {
            console.error(`[arch-style-dock] magnification measure failed: ${e}`);
            this._icons = [];
            this._baseCenters = [];
        }
    }

    /* ------------------------------------------------------------------ */
    /* Frame                                                               */
    /* ------------------------------------------------------------------ */

    _onMotion() {
        if (!this._active)
            return Clutter.EVENT_PROPAGATE;

        try {
            this._apply();
        } catch (e) {
            // A bad frame must never break the dock or flood the log.
            if (!this._frameErrorLogged) {
                this._frameErrorLogged = true;
                console.error(`[arch-style-dock] magnification frame failed: ${e}`);
            }
        }
        return Clutter.EVENT_PROPAGATE;
    }

    _apply() {
        if (!this._icons || this._icons.length === 0)
            return;

        const [pointerX] = global.get_pointer();
        const strength = this._readNumber('magnificationStrength', 0.6);
        const radius = this._readNumber('magnificationRadius', 70);
        const iconSize = this._readNumber('dashMaxIconSize', 48);
        const liftPeak = iconSize * LIFT_FACTOR;

        // Recompute base centers only if the icon list changed size.
        // (get_transformed_position during animation includes the current
        // scale, which would feed back into itself — so we do a fresh read
        // only when we're idle. In steady state the baseCenters cached at
        // measure() are correct.)
        for (let i = 0; i < this._icons.length; i++) {
            const icon = this._icons[i];
            const center = this._baseCenters[i];
            if (!icon || center === undefined)
                continue;

            const d = Math.abs(pointerX - center);
            const w = d < radius ? (1 - d / radius) ** 2 : 0;
            const scale = 1 + strength * w;
            const lift = liftPeak * w;

            icon.set_pivot_point(0.5, 1.0);
            icon.remove_all_transitions();
            icon.ease({
                scale_x: scale,
                scale_y: scale,
                translation_y: -lift,
                duration: ANIM_DURATION,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });
        }
    }

    _reset() {
        if (!this._icons)
            return;
        for (const icon of this._icons) {
            if (!icon)
                continue;
            try {
                icon.set_pivot_point(0.5, 1.0);
                icon.remove_all_transitions();
                icon.ease({
                    scale_x: 1,
                    scale_y: 1,
                    translation_y: 0,
                    duration: 120,
                    mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                });
            } catch {
                // Actor may have been destroyed mid-frame.
            }
        }
    }
}

