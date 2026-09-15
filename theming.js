// SPDX-License-Identifier: GPL-2.0-or-later
import {Clutter, St} from './dependencies/gi.js';
import {Main} from './dependencies/shell/ui.js';
import {Docking, Utils} from './imports.js';
import {hoverHeadroom} from './dockModel.js';

const {signals: Signals} = imports;
export const PositionStyleClass = Object.freeze(['top', 'right', 'bottom', 'left']);

/** One graphite profile. Old theme/transparency settings cannot overwrite it. */
export class ThemeManager {
    constructor(dock) {
        this._actor = dock;
        this._dash = dock.dash;
        this._baseStyles = new Map();
        this._signals = new Utils.GlobalSignalsHandler();
        this._actor.add_style_class_name('dashtodock');
        this._actor.add_style_class_name('arch-style-dock');
        this._signals.add(
            [dock, 'destroy', () => this.destroy()],
            [this._dash, 'icons-changed', () => this.updateCustomTheme()],
            [this._dash, 'icon-size-changed', () => this.updateCustomTheme()],
            [St.ThemeContext.get_for_stage(global.stage), 'changed', () => this.updateCustomTheme()],
            [Main.overview, 'showing', () => dock.add_style_pseudo_class('overview')],
            [Main.overview, 'hidden', () => dock.remove_style_pseudo_class('overview')]);
        for (const key of ['dock-roundness', 'dash-max-icon-size', 'magnification-enabled',
            'magnification-strength', 'dock-fixed', 'extend-height']) {
            this._signals.add(Docking.DockManager.settings, `changed::${key}`,
                () => this.updateCustomTheme());
        }
        this.updateCustomTheme();
    }

    updateCustomTheme() {
        if (this._destroyed)
            return;
        try {
            this._adjustTheme();
        } catch (error) {
            if (!this._errorLogged) {
                this._errorLogged = true;
                console.error(`[arch-style-dock@ib-hussain] theme error=${String(error).replace(/\s+/g, ' ')}`);
            }
        }
    }

    _adjustTheme() {
        const {settings} = Docking.DockManager;
        const size = this._dash.iconSize || settings.dashMaxIconSize;
        const radius = Math.round(size * settings.dockRoundness);
        const headroom = settings.magnificationEnabled
            ? hoverHeadroom(size, settings.magnificationStrength) : 0;
        this._dash._hoverHeadroom = headroom;
        const side = this._actor.position;
        const opposite = (side + 2) % 4;
        const horizontal = this._actor.isHorizontal;
        const edge = settings.dockExtended ? 0 : 20;
        const padding = [0, 0, 0, 0];
        padding[side] = 9 + edge;
        padding[opposite] = 9 + headroom;
        const buttonStyle = `padding: ${padding.map(n => `${n}px`).join(' ')};`;
        const clearance = Math.ceil(size * settings.magnificationStrength * 0.2) + 1;
        const contentStyle = horizontal ? `padding: 0 ${clearance}px;` : `padding: ${clearance}px 0;`;
        if (this._dash._boxContainer.get_style() !== contentStyle)
            this._dash._boxContainer.set_style(contentStyle);
        const buttons = [...this._dash.getAppIcons(), this._dash.showAppsButton];
        for (const button of buttons) {
            if (!this._baseStyles.has(button)) {
                this._baseStyles.set(button, button.get_style() ?? '');
                this._signals.add(button, 'destroy', () => this._baseStyles.delete(button));
            }
            const style = `${this._baseStyles.get(button)}; ${buttonStyle}`;
            if (button.get_style() !== style)
                button.set_style(style);
        }

        // Reserve real space inside the viewport for enlarged pixels. The
        // background occupies only the shelf and does not grow vertically.
        const background = this._dash._background;
        background.set({
            x_expand: horizontal,
            y_expand: !horizontal,
            x_align: horizontal ? Clutter.ActorAlign.FILL :
                side === St.Side.LEFT ? Clutter.ActorAlign.START : Clutter.ActorAlign.END,
            y_align: !horizontal ? Clutter.ActorAlign.FILL :
                side === St.Side.TOP ? Clutter.ActorAlign.START : Clutter.ActorAlign.END,
        });
        const style = `background-color: rgba(83,83,83,0.35); background-image: none; ` +
            `border: 1px solid rgba(255,255,255,0.18); border-radius: ${radius}px; ` +
            `${horizontal ? 'height' : 'width'}: ${size + 18}px; ` +
            `margin: 0; margin-${PositionStyleClass[side]}: ${edge}px; padding: 0;`;
        if (background.get_style() !== style)
            background.set_style(style);
    }

    destroy() {
        if (this._destroyed)
            return;
        this._destroyed = true;
        this._signals.destroy();
        for (const [button, style] of this._baseStyles)
            button.set_style(style || null);
        this._baseStyles.clear();
        this._dash._background.set_style(null);
        this._dash._boxContainer.set_style(null);
        this.emit('destroy');
    }
}
Signals.addSignalMethods(ThemeManager.prototype);
