// Minimal GJS boundary doubles. They exercise real modules, not rendering.
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';

export class Emitter {
    handlers = new Map(); nextId = 1;
    connect(signal, callback) { const id = this.nextId++; this.handlers.set(id, {signal, callback}); return id; }
    connect_after(...args) { return this.connect(...args); }
    disconnect(id) { this.handlers.delete(id); }
    emit(signal, ...args) {
        for (const [id, h] of [...this.handlers])
            if (h.signal === signal && this.handlers.has(id)) h.callback(this, ...args);
    }
}

export class Actor extends Emitter {
    constructor(props = {}) {
        super(); Object.assign(this, {x: 0, y: 0, width: 50, height: 50,
            scale_x: 1, scale_y: 1, translation_x: 0, translation_y: 0,
            margin_left: 0, margin_right: 0, margin_top: 0, margin_bottom: 0,
            reactive: false, visible: true, mapped: true, hover: false,
            pivot: [0, 0], style: null, children: [], transitions: new Map()}, props);
    }
    set(props) { Object.assign(this, props); }
    get_pivot_point() { return this.pivot; }
    set_pivot_point(...point) { this.pivot = point; }
    get_transformed_position() {
        return [this.x + this.translation_x + this.width * this.pivot[0] * (1 - this.scale_x),
            this.y + this.translation_y + this.height * this.pivot[1] * (1 - this.scale_y)];
    }
    get_transformed_size() { return [this.width * this.scale_x, this.height * this.scale_y]; }
    ease(props) { this.lastEase = props; const {duration, mode, ...values} = props; this.set(values); }
    remove_transition(name) { this.transitions.delete(name); }
    get_children() { return this.children; }
    has_key_focus() { return !!this.focus; }
    destroy() { this.emit('destroy'); this.handlers.clear(); this.mapped = false; }
    get_style() { return this.style; }
    set_style(style) { this.style = style; }
    add_style_class_name() {}
    remove_style_class_name() {}
    add_style_pseudo_class() {}
    remove_style_pseudo_class() {}
}

export class SignalHandler {
    entries = [];
    constructor(parent) { if (parent) this.parentId = parent.connect('destroy', () => this.destroy()); this.parent = parent; }
    add(...args) {
        if (!Array.isArray(args[0])) args = [args];
        for (const [object, signal, fn] of args) {
            if (!object?.connect) throw Error(`Invalid signal source for ${signal}`);
            const entry = [object, object.connect(signal, fn), 0];
            entry[2] = object.connect('destroy', () => {
                object.disconnect(entry[1]); object.disconnect(entry[2]);
                this.entries = this.entries.filter(e => e !== entry);
            });
            this.entries.push(entry);
        }
    }
    clear() { for (const [object, id, destroyId] of this.entries) { object.disconnect(id); object.disconnect(destroyId); } this.entries = []; }
    destroy() { this.clear(); if (this.parentId) this.parent.disconnect(this.parentId); this.parentId = 0; }
}

export function runtime() {
    let next = 1; const timers = new Map();
    const GLib = {PRIORITY_DEFAULT: 0, PRIORITY_DEFAULT_IDLE: 0, SOURCE_REMOVE: false,
        idle_add: (_, fn) => { const id = next++; timers.set(id, fn); return id; },
        source_remove: id => timers.delete(id)};
    const flush = () => {
        let count = 0;
        while (timers.size) {
            if (++count > 100) throw Error('Idle callback loop');
            const [id, fn] = timers.entries().next().value; timers.delete(id); fn();
        }
    };
    const stage = new Actor(); const overview = new Emitter();
    const shellSettings = new Emitter(); shellSettings.enable_animations = true;
    const themeContext = new Emitter(); themeContext.scale_factor = 1;
    const settings = new Emitter(); Object.assign(settings, {magnificationEnabled: true,
        magnificationStrength: .5, showAppsAtTop: true, dashMaxIconSize: 50, dockRoundness: .32});
    const Docking = {DockManager: {settings}, State: {HIDDEN: 0, SHOWING: 1, SHOWN: 2, HIDING: 3}};
    const gi = {Clutter: {AnimationMode: {EASE_OUT_QUAD: 1}, EVENT_PROPAGATE: false,
        ActorAlign: {FILL: 0, START: 1, END: 2}}, GLib,
        St: {Side: {TOP: 0, RIGHT: 1, BOTTOM: 2, LEFT: 3}, Settings: {get: () => shellSettings},
            ThemeContext: {get_for_stage: () => themeContext}}};
    const global = new Emitter(); global.stage = stage; global.pointer = [0, 0]; global.get_pointer = () => global.pointer;
    const Main = {overview};
    return {gi, Main, global, Docking, settings, timers, flush, shellSettings, themeContext};
}

export async function loadGjs(file, mocks, globals = {}) {
    const context = vm.createContext({console, ...globals}); const modules = new Map();
    async function load(path) {
        if (modules.has(path)) return modules.get(path);
        const source = await readFile(path, 'utf8');
        const module = new vm.SourceTextModule(source, {context, identifier: path}); modules.set(path, module);
        await module.link(async (specifier, referencing) => {
            if (Object.hasOwn(mocks, specifier)) {
                const key = `mock:${specifier}`;
                if (!modules.has(key)) {
                    const exports = mocks[specifier];
                    const m = new vm.SyntheticModule(Object.keys(exports), function () {
                        for (const [name, value] of Object.entries(exports)) this.setExport(name, value);
                    }, {context}); modules.set(key, m);
                }
                return modules.get(key);
            }
            return load(resolve(referencing.identifier, '..', specifier));
        });
        return module;
    }
    const m = await load(resolve(file)); await m.evaluate(); return m.namespace;
}
