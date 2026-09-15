// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-

import {Gio} from './dependencies/gi.js';
import {Config, ExtensionUtils} from './dependencies/shell/misc.js';
import {Main} from './dependencies/shell/ui.js';
import {Extension} from './dependencies/shell/extensions/extension.js';

import {DockManager} from './docking.js';

const LOG_PREFIX = '[arch-style-dock@ib-hussain]';
const CONFLICTING_DOCKS = Object.freeze([
    'ubuntu-dock@ubuntu.com',
    'dash-to-dock@micxgx.gmail.com',
    'rice-dock@ib-hussain',
]);
const ACTIVE_STATES = new Set([
    ExtensionUtils.ExtensionState.ACTIVE ?? ExtensionUtils.ExtensionState.ENABLED,
    ExtensionUtils.ExtensionState.ACTIVATING ?? ExtensionUtils.ExtensionState.ENABLING,
].filter(state => state !== undefined));

// Exported for compatibility with the Dash-to-Dock module layout.
export let dockManager = null;

function errorDetails(error) {
    return String(error?.stack ?? error?.message ?? error).replace(/\s+/g, ' ');
}

export default class ArchStyleDockExtension extends Extension.Extension {
    enable() {
        const phase = (name, fn) => {
            try {
                fn();
            } catch (error) {
                console.error(`${LOG_PREFIX} phase=${name} result=fail`);
                console.error(`${LOG_PREFIX} ${errorDetails(error)}`);
                throw error;
            }
        };

        if (this._enabled)
            return;
        this._enabled = true;
        this._extensionListenerId = 0;
        this._shutdownId = 0;

        try {
            phase('logo-check', () => {
                const logoFile = Gio.File.new_for_path(`${this.path}/media/logo.png`);
                if (!logoFile.query_exists(null))
                    console.log(`${LOG_PREFIX} logo=apps-grid.svg (custom logo.png absent)`);
            });

            phase('extension-listener', () => {
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
            });

            phase('shutdown-listener', () => {
                this._shutdownId = global.connect('shutdown', () => this.disable());
            });

            console.log(
                `${LOG_PREFIX} release=${this.metadata['version-name']} ` +
                `gnome=${Config.PACKAGE_VERSION} session-start=${new Date().toISOString()}`);

            phase('dock-manager', () => this._conditionallyEnableDock());

            console.log(`${LOG_PREFIX} phase=enable result=ok`);
        } catch (error) {
            try {
                this.disable();
            } catch { /* best effort */ }
            throw error;
        }
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
            // Constructors can fail after installing signals/injections.
            DockManager.getDefault()?.destroy();
            dockManager = null;
            console.error(
                `${LOG_PREFIX} dock manager failed to start: ${errorDetails(error)}`);
            throw error;
        }
    }

    disable() {
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
