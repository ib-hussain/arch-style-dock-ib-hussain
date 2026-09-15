import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Actor, Emitter, SignalHandler, runtime, loadGjs} from './gjs-harness.mjs';

test('graphite and dynamic radius survive old theme settings; shelf and hover space are separate', async () => {
    const r = runtime();
    Object.assign(r.settings, {applyCustomTheme: true, transparencyMode: 3, customBackgroundColor: true, backgroundColor: '#ffffff'});
    const button = new Actor({style: 'color: red;'}); const apps = new Actor();
    const dash = new Actor({iconSize: 50, _background: new Actor(), _boxContainer: new Actor(), showAppsButton: apps, getAppIcons: () => [button]});
    const dock = new Actor({dash, position: 2, isHorizontal: true});
    const {ThemeManager} = await loadGjs('theming.js', {
        './dependencies/gi.js': r.gi, './dependencies/shell/ui.js': {Main: r.Main},
        './imports.js': {Docking: r.Docking, Utils: {GlobalSignalsHandler: SignalHandler}},
    }, {global: r.global, imports: {signals: {addSignalMethods: proto => { proto.emit = () => {}; }}}});
    const manager = new ThemeManager(dock);
    assert.match(dash._background.style, /rgba\(83,83,83,0.35\)/);
    assert.match(dash._background.style, /border-radius: 16px/);
    assert.match(dash._background.style, /height: 68px/);
    assert.equal(dash._background.y_expand, false);
    assert.ok(dash._hoverHeadroom >= 28); assert.match(button.style, /^color: red;/);
    dash.iconSize = 100; dash.emit('icon-size-changed'); assert.match(dash._background.style, /border-radius: 32px/);
    r.settings.magnificationEnabled = false; manager.updateCustomTheme(); assert.equal(dash._hoverHeadroom, 0);
    manager.destroy(); manager.destroy();
    assert.equal(button.style, 'color: red;'); assert.equal(dash._background.style, null);
    assert.equal(r.settings.handlers.size, 0); assert.equal(r.themeContext.handlers.size, 0);
});
