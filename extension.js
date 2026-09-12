// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-

import {Gio} from './dependencies/gi.js';
import {Config, ExtensionUtils} from './dependencies/shell/misc.js';
import {Main} from './dependencies/shell/ui.js';
import {Extension} from './dependencies/shell/extensions/extension.js';

import {DockManager} from './docking.js';

const LOG_PREFIX = '[rice-dock@ib-hussain]';
const CONFLICTING_DOCKS = Object.freeze([
    'ubuntu-dock@ubuntu.com',
    'dash-to-dock@micxgx.gmail.com',
]);
const ACTIVE_STATES = new Set([
    ExtensionUtils.ExtensionState.ACTIVE,
    ExtensionUtils.ExtensionState.ACTIVATING,
]);

// Exported for compatibility with the Dash-to-Dock module layout.
export let dockManager = null;

function errorDetails(error) {
    return error?.stack ?? error?.message ?? String(error);
}

export default class RiceDockExtension extends Extension.Extension {
    enable() {
        this._enabled = true;
        this._extensionListenerId = 0;
        this._shutdownId = 0;

        const logoFile = Gio.File.new_for_path(`${this.path}/media/logo.png`);
        if (!logoFile.query_exists(null)) {
            const error = new Error(`Required logo is missing: ${logoFile.get_path()}`);
            console.error(`${LOG_PREFIX} ${error.message}`);
            this._enabled = false;
            throw error;
        }

        this._extensionListenerId = Main.extensionManager.connect(
            'extension-state-changed',
            (_manager, extension) => {
                if (!CONFLICTING_DOCKS.includes(extension?.uuid))
                    return;

                try {
                    this._conditionallyEnableDock();
                } catch (error) {
                    console.error(
                        `${LOG_PREFIX} conflict-state transition failed: ` +
                        errorDetails(error));
                }
            });

        // GNOME 50 does not guarantee disable() during Shell shutdown.
        this._shutdownId = global.connect('shutdown', () => this.disable());

        console.log(
            `${LOG_PREFIX} enabling on GNOME ${Config.PACKAGE_VERSION}; ` +
            `logo=${logoFile.get_path()}`);
        this._conditionallyEnableDock();
    }

    _activeConflicts() {
        return CONFLICTING_DOCKS.filter(uuid => {
            const extension = Main.extensionManager.lookup(uuid);
            return extension && ACTIVE_STATES.has(extension.state);
        });
    }

    _conditionallyEnableDock() {
        if (!this._enabled)
            return;

        const conflicts = this._activeConflicts();
        if (conflicts.length > 0) {
            if (dockManager) {
                dockManager.destroy();
                dockManager = null;
            }

            console.warn(
                `${LOG_PREFIX} dock suspended while conflicting extension(s) ` +
                `are active: ${conflicts.join(', ')}`);
            return;
        }

        if (dockManager)
            return;

        try {
            dockManager = new DockManager(this);
            console.log(`${LOG_PREFIX} dock manager started`);
        } catch (error) {
            dockManager = null;
            console.error(
                `${LOG_PREFIX} dock manager failed to start: ${errorDetails(error)}`);
            throw error;
        }
    }

    disable() {
        if (!this._enabled && !dockManager)
            return;

        this._enabled = false;

        if (this._shutdownId) {
            try {
                global.disconnect(this._shutdownId);
            } catch (error) {
                console.warn(
                    `${LOG_PREFIX} could not disconnect shutdown handler: ` +
                    errorDetails(error));
            }
            this._shutdownId = 0;
        }

        if (this._extensionListenerId) {
            try {
                Main.extensionManager.disconnect(this._extensionListenerId);
            } catch (error) {
                console.warn(
                    `${LOG_PREFIX} could not disconnect extension listener: ` +
                    errorDetails(error));
            }
            this._extensionListenerId = 0;
        }

        try {
            dockManager?.destroy();
        } catch (error) {
            console.error(
                `${LOG_PREFIX} dock manager cleanup failed: ${errorDetails(error)}`);
        } finally {
            dockManager = null;
        }

        console.log(`${LOG_PREFIX} disabled`);
    }
}
