// SPDX-License-Identifier: GPL-2.0-or-later
import {Clutter, GLib, St} from './dependencies/gi.js';
import {Main} from './dependencies/shell/ui.js';
import {Docking, Utils} from './imports.js';
import {hoverFrame, HOVER_DURATION, IMAGE_DURATION} from './dockModel.js';

const PREFIX = '[arch-style-dock@ib-hussain]';

/** Discrete image hover + animated layout margins from the production mockup. */
export class Magnification {
    constructor(dock) {
        this._dock = dock;
        this._dash = dock.dash;
        this._entries = [];
        this._active = null;
        this._idle = 0;
        this._destroyed = false;
        this._suspended = new Set();
        this._errors = new Set();
        this._signals = new Utils.GlobalSignalsHandler();
        this._itemSignals = new Utils.GlobalSignalsHandler();
        this._signals.add(
            [this._dash, 'icons-changed', () => this._queueSync()],
            [this._dash, 'icon-size-changed', () => this._queueSync()],
            [this._dash, 'destroy', () => this.destroy()],
            [dock, 'hiding', () => this.reset()],
            [dock, 'notify::mapped', () => { if (!dock.mapped) this.reset(); }],
            [this._dash, 'menu-opened', () => this._suspend('menu', true)],
            [this._dash, 'menu-closed', () => this._suspend('menu', false)],
            [Main.overview, 'item-drag-begin', () => this._suspend('drag', true)],
            [Main.overview, 'item-drag-end', () => this._suspend('drag', false)],
            [Main.overview, 'item-drag-cancelled', () => this._suspend('drag', false)],
            [St.Settings.get(), 'notify::enable-animations', () => this._queueSync()]);
        for (const key of ['magnification-enabled', 'magnification-strength']) {
            this._signals.add(Docking.DockManager.settings, `changed::${key}`,
                () => this._queueSync());
        }
        this._queueSync();
    }

    _guard(name, callback) {
        if (this._destroyed)
            return;
        try {
            callback();
        } catch (error) {
            if (!this._errors.has(name)) {
                this._errors.add(name);
                console.error(`${PREFIX} magnification=${name} error=${String(error).replace(/\s+/g, ' ')}`);
            }
        }
    }

    _queueSync() {
        if (this._destroyed || this._idle)
            return;
        this._idle = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            this._idle = 0;
            this._guard('sync', () => this._sync());
            return GLib.SOURCE_REMOVE;
        });
    }

    _sync() {
        this.reset(true);
        this._itemSignals.clear();
        this._entries = this._dash._box.get_children()
            .filter(slot => slot.child?.icon && !slot.animatingOut && slot.visible)
            .map(slot => ({slot, button: slot.child, base: slot.child.icon}));
        const showApps = this._dash._showAppsIcon;
        if (showApps.visible) {
            const entry = {slot: showApps, button: showApps.toggleButton, base: showApps.icon};
            if (Docking.DockManager.settings.showAppsAtTop)
                this._entries.unshift(entry);
            else
                this._entries.push(entry);
        }
        for (const entry of this._entries) {
            const {slot, button, base} = entry;
            entry.trash = !!button._archDockTrash;
            entry.texture = base.icon;
            entry.margins = [slot.margin_left, slot.margin_right, slot.margin_top, slot.margin_bottom];
            if (entry.texture) {
                entry.reactive = entry.texture.reactive;
                entry.pivot = entry.texture.get_pivot_point();
                entry.texture.reactive = true; // Enlarged pixels stay clickable; events bubble to the button.
                entry.texture.set_pivot_point(0.5, 0.5);
                this._itemSignals.add(entry.texture, 'destroy', () => {
                    entry.texture = null;
                    this._queueSync();
                });
            }
            const pointer = () => this._guard('pointer', () => this._pointer());
            this._itemSignals.add(
                [button, 'motion-event', () => { pointer(); return Clutter.EVENT_PROPAGATE; }],
                [button, 'notify::hover', () => this._queuePointer()],
                [button, 'key-focus-in', () => this._guard('focus', () => this._focus(entry))],
                [button, 'key-focus-out', () => this._queuePointer()],
                [base._iconBin, 'notify::child', () => this._queueSync()],
                [slot, 'destroy', () => {
                    entry.slot = null;
                    entry.texture = null;
                    this._queueSync();
                }]);
        }
        this._pointer(true);
    }

    _queuePointer() {
        if (this._pointerIdle || this._destroyed)
            return;
        // Coalesce hover leave/enter into one decision between adjacent icons.
        this._pointerIdle = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            this._pointerIdle = 0;
            this._guard('pointer', () => this._pointer());
            return GLib.SOURCE_REMOVE;
        });
    }

    _suspend(reason, suspended) {
        if (suspended)
            this._suspended.add(reason);
        else
            this._suspended.delete(reason);
        this.reset();
        if (!suspended)
            this._queuePointer();
    }

    _pointer(force = false) {
        const [x, y] = global.get_pointer();
        let selected = null;
        // Measure the unscaled bin, never the transformed image, as the base
        // target. Keep that target while its image lifts away from the cursor.
        for (const entry of this._entries) {
            if (!entry.slot?.mapped || !entry.texture || !entry.button.hover)
                continue;
            const bin = entry.base._iconBin;
            const [bx, by] = bin.get_transformed_position();
            const [bw, bh] = bin.get_transformed_size();
            const [tx, ty] = entry.texture.get_transformed_position();
            const [tw, th] = entry.texture.get_transformed_size();
            const contains = (px, py, w, h) => x >= px && x <= px + w && y >= py && y <= py + h;
            if (contains(bx, by, bw, bh) || contains(tx, ty, tw, th)) {
                selected = entry;
                break;
            }
        }
        selected ??= this._entries.find(entry => entry.slot && entry.button.has_key_focus()) ?? null;
        this._focus(selected, force);
    }

    _focus(entry, force = false) {
        const {settings} = Docking.DockManager;
        if (!settings.magnificationEnabled || settings.magnificationStrength <= 0 ||
            this._suspended.size || !this._dock.mapped ||
            this._dock.getDockState() === Docking.State.HIDDEN ||
            this._dock.getDockState() === Docking.State.HIDING)
            entry = null;
        if (this._active === entry && !force)
            return;
        this._active = entry;
        const active = this._entries.indexOf(entry);
        const factor = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        const duration = St.Settings.get().enable_animations ? HOVER_DURATION : 0;
        this._entries.forEach((item, index) => {
            if (!item.slot || !item.texture)
                return;
            const frame = hoverFrame(index, active, this._dash.iconSize,
                settings.magnificationStrength, this._dock.position);
            const scale = frame.scale * (item.trash ? 0.94 : 1);
            // In the mockup the bin's 10px image margin moves its centre by
            // 5px. Mirror that small nudge along the dock's primary axis.
            const nudge = item.trash && item === entry ? 5 * this._dash.iconSize / 50 * factor : 0;
            item.texture.ease({
                scale_x: scale, scale_y: scale,
                translation_x: frame.x * factor + (this._dock.isHorizontal ? nudge : 0),
                translation_y: frame.y * factor + (this._dock.isHorizontal ? 0 : nudge),
                duration: duration ? (item.trash ? HOVER_DURATION : IMAGE_DURATION) : 0,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });
            const [left, right, top, bottom] = item.margins;
            const margin = frame.margin * factor;
            const margins = {
                margin_left: left + (this._dock.isHorizontal ? margin : 0),
                margin_right: right + (this._dock.isHorizontal ? margin : 0),
                margin_top: top + (this._dock.isHorizontal ? 0 : margin),
                margin_bottom: bottom + (this._dock.isHorizontal ? 0 : margin),
            };
            if (item.trash && item !== entry) {
                const leading = this._dock.isHorizontal ?
                    (this._dock._rtl ? 'margin_right' : 'margin_left') : 'margin_top';
                margins[leading] += 20 * factor;
            }
            item.slot.ease({
                ...margins,
                duration, mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });
        });
    }

    reset(restore = false) {
        this._active = null;
        for (const entry of this._entries) {
            if (entry.texture) {
                for (const key of ['scale-x', 'scale-y', 'translation-x', 'translation-y'])
                    entry.texture.remove_transition(key);
                const scale = entry.trash && !restore ? 0.94 : 1;
                entry.texture.set({scale_x: scale, scale_y: scale, translation_x: 0, translation_y: 0});
                if (restore) {
                    entry.texture.reactive = entry.reactive;
                    entry.texture.set_pivot_point(...entry.pivot);
                }
            }
            if (entry.slot && entry.margins) {
                for (const key of ['margin-left', 'margin-right', 'margin-top', 'margin-bottom'])
                    entry.slot.remove_transition(key);
                const [margin_left, margin_right, margin_top, margin_bottom] = entry.margins;
                entry.slot.set({margin_left, margin_right, margin_top, margin_bottom});
                if (entry.trash && !restore) {
                    const leading = this._dock.isHorizontal ?
                        (this._dock._rtl ? 'margin_right' : 'margin_left') : 'margin_top';
                    entry.slot[leading] += 20 * St.ThemeContext.get_for_stage(global.stage).scale_factor;
                }
            }
        }
    }

    destroy() {
        if (this._destroyed)
            return;
        this._destroyed = true;
        for (const key of ['_idle', '_pointerIdle']) {
            if (this[key])
                GLib.source_remove(this[key]);
            this[key] = 0;
        }
        this.reset(true);
        this._itemSignals.destroy();
        this._signals.destroy();
        this._entries = [];
        this._dash = null;
        this._dock = null;
    }
}
