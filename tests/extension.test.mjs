import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Emitter, loadGjs} from './gjs-harness.mjs';

async function fixture({fail = false, conflict = false} = {}) {
    const manager = new Emitter(); const global = new Emitter();
    const states = new Map(conflict ? [['ubuntu-dock@ubuntu.com', {state: 1}]] : []);
    manager.lookup = id => states.get(id);
    let starts = 0, stops = 0, singleton;
    class DockManager {
        constructor() { starts++; singleton = this; if (fail) throw Error('injected failure after registration'); }
        static getDefault() { return singleton; }
        destroy() { stops++; singleton = null; }
    }
    class Extension {
        constructor() { this.path = '/test'; this.metadata = {'version-name': 'test'}; }
    }
    const messages = [];
    const ns = await loadGjs('extension.js', {
        './dependencies/gi.js': {Gio: {File: {new_for_path: () => ({query_exists: () => false})}}},
        './dependencies/shell/misc.js': {Config: {PACKAGE_VERSION: '50.1'},
            ExtensionUtils: {ExtensionState: {ACTIVE: 1, ACTIVATING: 2}}},
        './dependencies/shell/ui.js': {Main: {extensionManager: manager}},
        './dependencies/shell/extensions/extension.js': {Extension: {Extension}},
        './docking.js': {DockManager},
    }, {global, console: {log: m => messages.push(m), warn: m => messages.push(m), error: m => messages.push(m)}});
    const extension = new ns.default();
    return {extension, manager, global, messages, states, stats: () => ({starts, stops})};
}

test('missing custom logo uses fallback and enable/disable are idempotent', async () => {
    const f = await fixture(); f.extension.enable(); f.extension.enable();
    assert.equal(f.stats().starts, 1); assert.ok(f.messages.some(m => m.includes('apps-grid.svg')));
    f.extension.disable(); f.extension.disable();
    assert.equal(f.stats().stops, 1); assert.equal(f.manager.handlers.size, 0); assert.equal(f.global.handlers.size, 0);
});

test('failed startup releases manager, extension listener and shutdown listener', async () => {
    const f = await fixture({fail: true});
    assert.throws(() => f.extension.enable(), /injected failure/);
    assert.deepEqual(f.stats(), {starts: 1, stops: 1});
    assert.equal(f.manager.handlers.size, 0); assert.equal(f.global.handlers.size, 0);
    f.extension.disable();
});

test('conflicting dock suspends this extension, then resumes exactly once', async () => {
    const f = await fixture({conflict: true}); f.extension.enable(); assert.equal(f.stats().starts, 0);
    f.states.clear(); f.manager.emit('extension-state-changed', {uuid: 'ubuntu-dock@ubuntu.com'});
    f.manager.emit('extension-state-changed', {uuid: 'ubuntu-dock@ubuntu.com'}); assert.equal(f.stats().starts, 1);
    f.states.set('rice-dock@ib-hussain', {state: 1}); f.manager.emit('extension-state-changed', {uuid: 'rice-dock@ib-hussain'});
    assert.equal(f.stats().stops, 1); f.extension.disable();
    assert.equal(f.manager.handlers.size, 0); assert.equal(f.global.handlers.size, 0);
});

test('ten activation cycles do not accumulate listeners', async () => {
    const f = await fixture();
    for (let i = 0; i < 10; i++) {
        f.extension.enable(); assert.equal(f.manager.handlers.size, 1); assert.equal(f.global.handlers.size, 1);
        f.extension.disable(); assert.equal(f.manager.handlers.size, 0); assert.equal(f.global.handlers.size, 0);
    }
    assert.deepEqual(f.stats(), {starts: 10, stops: 10});
});
