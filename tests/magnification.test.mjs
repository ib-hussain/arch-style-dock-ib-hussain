import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Actor, SignalHandler, runtime, loadGjs} from './gjs-harness.mjs';

async function fixture(side = 2, trash = false) {
    const r = runtime();
    const entries = Array.from({length: 5}, (_, i) => {
        const texture = new Actor({x: 100 + i * 50, y: 600});
        const base = new Actor({icon: texture, _iconBin: new Actor({x: texture.x, y: texture.y})});
        const button = new Actor({icon: base});
        return {texture, base, button, slot: new Actor({child: button})};
    });
    const apps = entries.slice(1); const show = entries[0];
    if (trash) entries.at(-1).button._archDockTrash = true;
    Object.assign(show.slot, {icon: show.base, toggleButton: show.button});
    const dash = new Actor({_box: new Actor({children: apps.map(e => e.slot)}), _showAppsIcon: show.slot, iconSize: 50});
    const dock = new Actor({dash, position: side, isHorizontal: side % 2 === 0, state: 2,
        getDockState() { return this.state; }});
    const {Magnification} = await loadGjs('magnification.js', {
        './dependencies/gi.js': r.gi,
        './dependencies/shell/ui.js': {Main: r.Main},
        './imports.js': {Docking: r.Docking, Utils: {GlobalSignalsHandler: SignalHandler}},
    }, {global: r.global});
    const m = new Magnification(dock); r.flush();
    const focus = index => {
        entries.forEach((e, i) => { e.button.hover = i === index; });
        r.global.pointer = index < 0 ? [0, 0] : [entries[index].texture.x + 25, 625];
        if (index >= 0) entries[index].button.emit('motion-event');
        else { entries[0].button.emit('notify::hover'); r.flush(); }
    };
    return {...r, entries, dash, dock, m, focus};
}

test('production adapter animates images and spacing together, including Show Applications', async () => {
    const f = await fixture(); f.focus(2);
    assert.deepEqual(f.entries.map(e => e.texture.scale_x), [1.1, 1.2, 1.5, 1.2, 1.1]);
    assert.equal(f.entries[2].slot.margin_left, 13); assert.equal(f.entries[2].slot.margin_right, 13);
    assert.equal(f.entries[2].texture.translation_y, -15);
    assert.equal(f.entries[2].texture.lastEase.duration, 300);
    assert.equal(f.entries[2].slot.lastEase.duration, 200);
    assert.equal(f.entries[2].button.scale_x, 1); // running indicators belong to the unscaled button
    f.focus(0); assert.equal(f.entries[0].texture.scale_x, 1.5);
    f.focus(-1); assert.ok(f.entries.every(e => e.texture.scale_x === 1 && e.slot.margin_left === 0));
    f.m.destroy();
});

test('trash keeps its separate size, separator spacing and shorter image transition', async () => {
    const f = await fixture(2, true); const bin = f.entries.at(-1);
    assert.equal(bin.texture.scale_x, .94); assert.equal(bin.slot.margin_left, 20);
    f.focus(4); assert.equal(bin.texture.scale_x, 1.5 * .94);
    assert.equal(bin.slot.margin_left, 13); assert.equal(bin.slot.margin_right, 13);
    assert.equal(bin.texture.translation_x, 5); assert.equal(bin.texture.lastEase.duration, 200);
    f.focus(-1); assert.equal(bin.texture.scale_x, .94); assert.equal(bin.slot.margin_left, 20);
    f.dock._rtl = true; f.dash.emit('icons-changed'); f.flush();
    assert.equal(bin.slot.margin_left, 0); assert.equal(bin.slot.margin_right, 20);
    f.m.destroy(); assert.equal(bin.slot.margin_right, 0); assert.equal(bin.texture.scale_x, 1);
});

test('closing a menu does not resume magnification during an active drag', async () => {
    const f = await fixture(); f.focus(2);
    f.dash.emit('menu-opened'); f.Main.overview.emit('item-drag-begin');
    f.dash.emit('menu-closed'); f.flush(); assert.equal(f.entries[2].texture.scale_x, 1);
    f.Main.overview.emit('item-drag-end'); f.flush(); assert.equal(f.entries[2].texture.scale_x, 1.5);
    f.m.destroy();
});

test('no magnification across the desktop at the same x coordinate', async () => {
    const f = await fixture(); f.focus(2); f.global.pointer = [225, 50];
    f.entries[2].button.emit('motion-event');
    assert.ok(f.entries.every(e => e.texture.scale_x === 1)); f.m.destroy();
});

test('monitor scale and vertical orientation affect margins and lift', async () => {
    const f = await fixture(3); f.themeContext.scale_factor = 2; f.focus(2);
    assert.equal(f.entries[2].texture.translation_x, 30);
    assert.equal(f.entries[2].slot.margin_top, 26); assert.equal(f.entries[2].slot.margin_left, 0);
    f.m.destroy();
});

test('reduced motion applies final state with zero-duration transitions', async () => {
    const f = await fixture(); f.shellSettings.enable_animations = false; f.focus(2);
    assert.equal(f.entries[2].texture.lastEase.duration, 0); f.m.destroy();
});

test('keyboard focus uses the same profile and menus/drag/hiding reset it', async () => {
    const f = await fixture(); f.entries[1].button.emit('key-focus-in');
    assert.equal(f.entries[1].texture.scale_x, 1.5);
    f.dash.emit('menu-opened'); assert.equal(f.entries[1].texture.scale_x, 1);
    f.focus(2); assert.equal(f.entries[2].texture.scale_x, 1);
    f.dash.emit('menu-closed'); f.flush(); assert.equal(f.entries[2].texture.scale_x, 1.5);
    f.Main.overview.emit('item-drag-begin'); assert.equal(f.entries[2].texture.scale_x, 1);
    f.Main.overview.emit('item-drag-cancelled'); f.flush();
    f.dock.state = 3; f.dock.emit('hiding'); f.focus(2); assert.equal(f.entries[2].texture.scale_x, 1);
    f.m.destroy();
});

test('texture replacement, app removal, disable and repeated destroy leave no subscriptions or idle work', async () => {
    const f = await fixture(); f.focus(2);
    const old = f.entries[2].texture; old.destroy();
    f.entries[2].base.icon = new Actor({x: 200, y: 600}); f.flush();
    f.entries[3].slot.destroy();
    f.dash._box.children = f.dash._box.children.filter(a => a !== f.entries[3].slot); f.flush();
    f.settings.magnificationEnabled = false; f.settings.emit('changed::magnification-enabled'); f.flush();
    assert.equal(f.entries[2].base.icon.scale_x, 1);
    f.dash.emit('icons-changed'); assert.equal(f.timers.size, 1);
    f.m.destroy(); f.m.destroy(); assert.equal(f.timers.size, 0);
    for (const source of [f.settings, f.dash, f.dock, f.Main.overview, f.shellSettings])
        assert.equal(source.handlers.size, 0);
    for (const e of f.entries) assert.equal(e.button.handlers.size, 0);
});
