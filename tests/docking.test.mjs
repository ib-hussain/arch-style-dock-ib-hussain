import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Actor, Emitter, runtime, SignalHandler, loadGjs} from './gjs-harness.mjs';

async function fixture() {
    const r = runtime();
    const gi = {...r.gi, Gio: {}, Meta: {}, Shell: {},
        GObject: {registerClass: (...args) => args.at(-1),
            ParamSpec: new Proxy({}, {get: () => () => ({})}), ParamFlags: {},
        }, St: {...r.gi.St, Bin: Actor}};
    const signals = {addSignalMethods(proto) {
        proto.connect = function (...args) { this.handlers ??= new Map(); this.nextId ??= 1; return Emitter.prototype.connect.call(this, ...args); };
        proto.disconnect = Emitter.prototype.disconnect;
        proto.emit = function (...args) { this.handlers ??= new Map(); return Emitter.prototype.emit.call(this, ...args); };
    }};
    const Utils = {GlobalSignalsHandler: SignalHandler};
    const ui = Object.fromEntries(['AppMenu', 'AppDisplay', 'Layout', 'OverviewControls', 'PointerWatcher',
        'SwitcherPopup', 'Workspace', 'WorkspacesView', 'WorkspaceSwitcherPopup'].map(k => [k, {}]));
    const imports = Object.fromEntries(['AppIconsDecorator', 'AppSpread', 'DockDash', 'DesktopIconsIntegration',
        'FileManager1API', 'Intellihide', 'LauncherAPI', 'Locations', 'Magnification',
        'NotificationsMonitor', 'Theming'].map(k => [k, {}]));
    const ns = await loadGjs('docking.js', {
        './dependencies/gi.js': gi, './dependencies/shell/ui.js': {...ui, Main: r.Main},
        './dependencies/shell/misc.js': {AnimationUtils: {}}, './imports.js': {...imports, Utils},
        './dependencies/shell/extensions/extension.js': {Extension: {gettext: x => x}},
    }, {global: r.global, imports: {signals}});
    ns.DockManager._singleton = {settings: r.settings};
    const dock = Object.setPrototypeOf(new Actor(), ns.DockedDash.prototype);
    Object.assign(dock, {_monitor: {x: 0, y: 0, width: 1920, height: 1080},
        _position: 2, _staticBox: {x1: 600, x2: 1200, y1: 980, y2: 1080},
        _dockState: ns.State.HIDDEN, _autohideIsEnabled: true, _intellihideIsEnabled: true,
        _intellihide: {getOverlapStatus: () => 1}, dash: {contains: () => false},
        _visibility: {update() { this.updates = (this.updates ?? 0) + 1; }},
    });
    r.global.stage.get_key_focus = () => null;
    r.settings.animationTime = .2;
    return {...r, ns, dock};
}

test('real dock policy retains intellihide-only mode and excludes neighbouring monitors', async () => {
    const f = await fixture(); f.dock._autohideIsEnabled = false;
    assert.equal(f.dock._visibilityDecision().visible, false);
    f.dock._intellihide.getOverlapStatus = () => 0;
    assert.equal(f.dock._visibilityDecision().visible, true);
    f.dock._intellihide.getOverlapStatus = () => 1;
    f.global.pointer = [700, 1079]; assert.equal(f.dock._visibilityDecision().visible, true);
    f.global.pointer = [700, 1081]; assert.equal(f.dock._visibilityDecision().visible, false);
});

test('real hide path reverses a showing animation without adding a second delay', async () => {
    const f = await fixture(); let removals = 0; let animation;
    f.dock._slider = {remove_all_transitions: () => removals++,
        ease_property: (key, target, options) => { animation = {key, target, ...options}; }};
    f.settings.hideDelay = 3; f.dock._dockState = f.ns.State.SHOWING;
    f.dock._hide(); assert.equal(removals, 1); assert.equal(animation.delay, 0);
    assert.equal(animation.target, 0); assert.equal(f.dock.getDockState(), f.ns.State.HIDING);
});

test('drag and menu latches clear independently and refresh the real controller', async () => {
    const f = await fixture(); f.dock._box = {sync_hover() {}};
    f.dock._onDragStart(); f.dock._onMenuOpened(); f.dock._onDragEnd();
    assert.equal(f.dock._dragActive, false); assert.equal(f.dock._menuOpen, true);
    assert.equal(f.dock._visibilityDecision().visible, true);
    f.dock._onMenuClosed(); assert.equal(f.dock._menuOpen, false);
    assert.equal(f.dock._visibilityDecision().visible, false);
    assert.equal(f.dock._visibility.updates, 4);
});

test('key-focus updates coalesce until the popup has reported its menu state', async () => {
    const f = await fixture(); let decision;
    f.dock._visibility.update = () => { decision = f.dock._visibilityDecision(); };
    f.Main.modalCount = 1; f.dock._queueVisibility(); f.dock._queueVisibility();
    assert.equal(f.timers.size, 1); assert.equal(decision, undefined);
    f.dock._menuOpen = true; f.flush(); assert.equal(decision.visible, true);
    assert.equal(f.dock._visibilityIdle, 0);
});
