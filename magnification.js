// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-

import {Clutter} from './dependencies/gi.js';
import {PointerWatcher} from './dependencies/shell/ui.js';
import {Docking, Utils} from './imports.js';

const Labels = Object.freeze({
    SETTINGS: Symbol('magnification-settings'),
});

const WATCH_INTERVAL_MS = 40;   // ~25 Hz
const ANIM_DURATION = 90;       // ms
const LIFT_FACTOR = 0.32;       // peak lift = iconSize * LIFT_FACTOR * weight

/**
 * macOS-style dock magnification, driven by PointerWatcher.
 *
 * Why not `motion-event` on the dash container? On GNOME 50 the container
 * is not reactive, so motion events only bubble from reactive children
 * (individual app icons). Sweeping across the dock misses the gaps. The
 * PointerWatcher polls the pointer at a fixed cadence and sees every frame.
 *
 * Weight function: (1 - d/R)^2 with a hard cutoff at R. At R=70 and normal
 * icon pitches, the icon under the cursor peaks at 1+strength; the immediate
 * neighbour gets ~4% extra; the second neighbour gets ~0. That's the "only
 * one or two icons visibly grow" behaviour.
 *
 * Base centres are recomputed every frame from the layout (container.x +
 * container.width/2) so they never include the icon's own scale. This is
 * cheap — a dozen actors, two property reads each.
 */
export class Magnification {
    constructor(dock) {
        this._dock = dock;
        this._dash = dock.dash;
        this._signalsHandler = new Utils.GlobalSignalsHandler();
        this._active = false;
        this._icons = [];
        this._baseCenters = [];
        this._pointerWatchId = 0;
        this._frameErrorLogged = false;

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

    _settings() {
        return Docking.DockManager.settings;
    }

    _readBool(key, fallback) {
        try {
            const value = this._settings()[key];
            return value === undefined || value === null
                ? fallback : Boolean(value);
        } catch {
            return fallback;
        }
    }

    _readNumber(key, fallback) {
        try {
            const value = Number(this._settings()[key]);
            return Number.isFinite(value) ? value : fallback;
        } catch {
            return fallback;
        }
    }

    _bindSettings() {
        const settings = this._settings();
        ['magnification-enabled',
         'magnification-strength',
         'magnification-radius',
        ].forEach(key => {
            this._signalsHandler.addWithLabel(Labels.SETTINGS, settings,
                `changed::${key}`, () => this._sync());
        });
        this._signalsHandler.addWithLabel(Labels.SETTINGS, this._dash,
            'destroy', () => this._disable());
    }

    _sync() {
        const enabled = this._readBool('magnificationEnabled', true);
        if (enabled && !this._active)
            this._enable();
        else if (!enabled && this._active)
            this._disable();
    }

    _enable() {
        if (this._active)
            return;
        this._active = true;
        try {
            this._pointerWatchId = PointerWatcher.getPointerWatcher().addWatch(
                WATCH_INTERVAL_MS, () => this._frame());
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
            if (this._pointerWatchId) {
                PointerWatcher.getPointerWatcher()._removeWatch(this._pointerWatchId);
                this._pointerWatchId = 0;
            }
            this._reset();
        } catch (e) {
            console.error(`[arch-style-dock] magnification disable failed: ${e}`);
        }
    }

    _frame() {
        if (!this._active)
            return;
        try {
            this._measure();
            this._apply();
        } catch (e) {
            if (!this._frameErrorLogged) {
                this._frameErrorLogged = true;
                console.error(`[arch-style-dock] magnification frame failed: ${e}`);
            }
        }
    }

    _measure() {
        const box = this._dash._box;
        if (!box)
            return;
        const containers = box.get_children().filter(c =>
            c.child && c.child.icon && !c.animatingOut);
        this._icons = containers.map(c => c.child);
        const [boxX] = box.get_transformed_position();
        // c.x and c.width are the layout position/size within `box`,
        // i.e. they do NOT include the icon's own scale/translation.
        this._baseCenters = containers.map(c => boxX + c.x + c.width / 2);
    }

    _apply() {
        if (!this._icons || this._icons.length === 0)
            return;

        const [pointerX] = global.get_pointer();
        const strength = this._readNumber('magnificationStrength', 0.6);
        const radius = this._readNumber('magnificationRadius', 70);
        const iconSize = this._readNumber('dashMaxIconSize', 48);
        const liftPeak = iconSize * LIFT_FACTOR;

        for (let i = 0; i < this._icons.length; i++) {
            const icon = this._icons[i];
            const center = this._baseCenters[i];
            if (!icon || center === undefined)
                continue;
            const d = Math.abs(pointerX - center);
            // Gaussian falloff, matching the HTML mockup. At R=70, an
            // adjacent icon (56 px away) gets weight ≈ 0.53 and the second
            // neighbour (112 px) gets ≈ 0.08 — the "one or two visibly grow"
            // behaviour that read as beautiful in the mockup.
            const w = Math.exp(-((d / radius) ** 2));
            const scale = 1 + strength * w;
            const lift = liftPeak * w;

            icon.set_pivot_point(0.5, 1.0);
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
                icon.ease({
                    scale_x: 1,
                    scale_y: 1,
                    translation_y: 0,
                    duration: 120,
                    mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                });
            } catch {
                // Actor may have been destroyed mid-frame; ignore.
            }
        }
    }
}
