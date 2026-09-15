import assert from 'node:assert/strict';
import {test} from 'node:test';
import {hoverFrame, hoverHeadroom, pointerZones, visibilityDecision, VisibilityController} from '../dockModel.js';

class Clock {
    now = 0;
    next = 0;
    tasks = new Map();
    schedule = (delay, fn) => { const id = this.next++; this.tasks.set(id, {at: this.now + delay, fn}); return id; };
    cancel = id => this.tasks.delete(id);
    tick(ms) {
        const end = this.now + ms;
        while (true) {
            const job = [...this.tasks].sort((a, b) => a[1].at - b[1].at)[0];
            if (!job || job[1].at > end) break;
            this.now = job[1].at; this.tasks.delete(job[0]); job[1].fn();
        }
        this.now = end;
    }
}

test('mockup scale and effective CSS translation, including both boundaries', () => {
    assert.deepEqual(Array.from({length: 7}, (_, i) => hoverFrame(i, 3).scale), [1, 1.1, 1.2, 1.5, 1.2, 1.1, 1]);
    assert.equal(hoverFrame(3, 3).y, -15);
    assert.ok(Math.abs(hoverFrame(2, 3).y + 7.2) < 1e-10);
    assert.equal(hoverFrame(3, 3).margin, 13);
    assert.equal(hoverFrame(2, 3).margin, 0);
    assert.equal(hoverFrame(0, 0).scale, 1.5);
    assert.equal(hoverFrame(14, 14).scale, 1.5);
    assert.equal(hoverFrame(0, -1).scale, 1);
});

test('all sides lift away from the edge and scale dimensions with icon size', () => {
    assert.deepEqual([0, 1, 2, 3].map(s => {
        const f = hoverFrame(0, 0, 100, .5, s); return [f.x, f.y];
    }), [[0, 30], [-30, 0], [0, -30], [30, 0]]);
    assert.equal(hoverFrame(0, 0, 100).margin, 26);
    for (const size of [16, 22, 48, 50, 64, 128]) {
        for (const strength of [0, .5, 1, 1.5]) {
            const f = hoverFrame(0, 0, size, strength);
            assert.ok(hoverHeadroom(size, strength) >= size * (f.scale - 1) / 2 - f.y);
        }
    }
});

test('strength zero removes scale, translation and spacing together', () => {
    const f = hoverFrame(0, 0, 50, 0);
    assert.equal(f.scale, 1); assert.equal(Math.abs(f.y), 0); assert.equal(f.margin, 0);
});

test('edge wake is bounded to its monitor on all four sides', () => {
    const m = {x: 100, y: 100, width: 1920, height: 1080};
    const points = [[500, 100], [2019, 500], [500, 1179], [100, 500]];
    points.forEach(([x, y], side) => assert.equal(pointerZones(x, y, m, null, side, false).edge, true));
    assert.equal(pointerZones(500, 1180, m, null, 2, false).edge, false);
    assert.equal(pointerZones(500, 99, m, null, 0, false).edge, false);
    assert.equal(pointerZones(99, 500, m, null, 3, false).edge, false);
    assert.equal(pointerZones(2020, 500, m, null, 1, false).edge, false);
});

test('hidden dock cannot wake over its old rectangle; negative monitor coordinates work', () => {
    const m = {x: -1920, y: -1080, width: 1920, height: 1080};
    const b = {x1: -200, x2: 0, y1: -200, y2: -20};
    assert.equal(pointerZones(-100, -100, m, b, 2, false).inside, false);
    assert.equal(pointerZones(-100, -100, m, b, 2, true).inside, true);
    assert.equal(pointerZones(-100, -1, m, b, 2, false).edge, true);
});

test('visibility policy covers modes, interactions, pressure, modal and fullscreen', () => {
    const base = {autohide: true, overlap: true};
    const cases = [
        [{}, false], [{edge: true}, true], [{inside: true}, true],
        [{manualhide: true, overview: true}, false], [{overview: true}, true],
        [{fixed: true}, true], [{menu: true}, true], [{drag: true}, true],
        [{keyboard: true}, true], [{focus: true}, true], [{requiresVisibility: true}, true],
        [{autohide: false}, true], [{autohide: false, intellihide: true}, false],
        [{autohide: false, intellihide: true, overlap: false}, true],
        [{intellihide: true, overlap: false}, true], [{modal: true, edge: true}, false],
        [{fullscreen: true, edge: true}, false],
        [{fullscreen: true, autohideInFullscreen: true, edge: true}, true],
        [{edge: true, pressureRequired: true}, false],
        [{edge: true, pressureRequired: true, pressureSensed: true}, true],
    ];
    cases.forEach(([s, expected]) => assert.equal(visibilityDecision({...base, ...s}).visible, expected, JSON.stringify(s)));
});

function rig() {
    const clock = new Clock(); const events = []; const state = {visible: false};
    const controller = new VisibilityController({schedule: clock.schedule, cancel: clock.cancel,
        decide: () => ({...state}), delay: () => 3000,
        apply: visible => events.push({at: clock.now, visible})});
    return {clock, events, state, controller};
}

test('3-second show and hide delays are applied exactly once, with a stationary pointer', () => {
    const {clock, events, state, controller} = rig();
    state.visible = true; controller.update(); clock.tick(2999); assert.equal(events.length, 0);
    clock.tick(1); assert.deepEqual(events, [{at: 3000, visible: true}]);
    state.visible = false; controller.update(); clock.tick(2999); assert.equal(events.length, 1);
    clock.tick(1); assert.deepEqual(events[1], {at: 6000, visible: false});
});

test('repeated restacks do not restart or bypass the pending deadline', () => {
    const {clock, events, state, controller} = rig();
    state.visible = true; controller.update();
    for (let i = 0; i < 30; i++) { clock.tick(100); controller.update(); }
    assert.deepEqual(events, [{at: 3000, visible: true}]);
    assert.equal(clock.tasks.size, 0);
});

test('stale pointer state is rechecked at expiry even without watcher notifications', () => {
    const {clock, events, state, controller} = rig();
    state.visible = true; controller.update(); clock.tick(2500);
    state.visible = false; clock.tick(500);
    assert.equal(events.length, 0); assert.equal(clock.tasks.size, 0);
});

test('opening menu cancels pending hide; closing it starts one fresh delay', () => {
    const {clock, events, state, controller} = rig();
    Object.assign(state, {visible: true, immediate: true}); controller.update();
    Object.assign(state, {visible: false, immediate: false}); controller.update(); clock.tick(1000);
    Object.assign(state, {visible: true, immediate: true}); controller.update(); clock.tick(4000);
    assert.equal(events.length, 1);
    Object.assign(state, {visible: false, immediate: false}); controller.update(); clock.tick(3000);
    assert.deepEqual(events[1], {at: 8000, visible: false});
});

test('rapid reversal cancels pending show and destruction removes timer id zero', () => {
    const {clock, state, controller, events} = rig();
    state.visible = true; controller.update(); assert.ok(clock.tasks.has(0));
    state.visible = false; controller.update(); assert.equal(clock.tasks.size, 0);
    state.visible = true; controller.update(); controller.destroy(); controller.destroy();
    clock.tick(10000); controller.update(); assert.equal(events.length, 0); assert.equal(clock.tasks.size, 0);
});

test('failed apply remains retryable', () => {
    let calls = 0;
    const c = new VisibilityController({decide: () => ({visible: true, immediate: true}),
        apply: () => { if (++calls === 1) throw Error('animation failed'); }});
    assert.throws(() => c.update()); assert.equal(c.target, false);
    c.update(); assert.equal(c.target, true);
});
