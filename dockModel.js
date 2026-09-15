// SPDX-License-Identifier: GPL-2.0-or-later
// Geometry and timing shared by the GJS adapter and the regression tests.
// St.Side values: top=0, right=1, bottom=2, left=3.

export const HOVER_DURATION = 200;
export const IMAGE_DURATION = 300;

export function hoverFrame(index, active, size = 50, strength = 0.5, side = 2) {
    const distance = active < 0 ? Infinity : Math.abs(index - active);
    const weight = [1, 0.4, 0.2][distance] ?? 0;
    const amount = Math.max(0, Math.min(1.5, strength));
    const scale = 1 + amount * weight;
    // CSS scale(s) translateY(y) also scales the translation. The mockup's
    // transform is on the image (centre pivot), not the bottom-anchored li.
    const lift = ([10, 6, 0][distance] ?? 0) * size / 50 * amount / 0.5 * scale;
    return {
        scale,
        x: side === 3 ? lift : side === 1 ? -lift : 0,
        y: side === 0 ? lift : side === 2 ? -lift : 0,
        margin: distance === 0 ? 13 * size / 50 * amount / 0.5 : 0,
    };
}

export function hoverHeadroom(size, strength) {
    const frame = hoverFrame(0, 0, size, strength);
    return Math.ceil(size * (frame.scale - 1) / 2 + Math.abs(frame.y) + 4);
}

export function pointerZones(x, y, monitor, box, side, shown, tolerance = 4) {
    const insideMonitor = !!monitor && x >= monitor.x && y >= monitor.y &&
        x < monitor.x + monitor.width && y < monitor.y + monitor.height;
    if (!insideMonitor)
        return {edge: false, inside: false};
    const edge = [y < monitor.y + 2, x >= monitor.x + monitor.width - 2,
        y >= monitor.y + monitor.height - 2, x < monitor.x + 2][side];
    const validBox = box && [box.x1, box.x2, box.y1, box.y2].every(Number.isFinite) &&
        box.x2 > box.x1 && box.y2 > box.y1;
    return {
        edge: !!edge,
        inside: !!(shown && validBox && x >= box.x1 - tolerance &&
            x <= box.x2 + tolerance && y >= box.y1 - tolerance && y <= box.y2 + tolerance),
    };
}

export function visibilityDecision(s) {
    const result = (visible, reason, immediate = false) => ({visible, reason, immediate});
    if (s.manualhide)
        return result(false, 'manual', true);
    if (s.overview)
        return result(true, 'overview', true);
    if (s.fixed)
        return result(true, 'fixed', true);
    if (s.menu || s.drag || s.keyboard || s.focus)
        return result(true, 'interaction', true);
    if (s.modal || (s.fullscreen && !s.autohideInFullscreen))
        return result(false, 'suppressed', true);
    if (s.requiresVisibility)
        return result(true, 'attention', true);
    if (!s.autohide && !s.intellihide)
        return result(true, 'always-visible', true);
    if (s.intellihide && !s.overlap)
        return result(true, 'unobstructed');
    const wake = s.edge && (!s.pressureRequired || s.pressureSensed);
    return result(!!(s.inside || wake), wake ? 'edge' : s.inside ? 'pointer' : 'away');
}

/** One cancellable deadline. Repeated window/pointer updates never postpone it. */
export class VisibilityController {
    constructor({schedule, cancel, decide, delay, apply, initial = false}) {
        Object.assign(this, {schedule, cancel, decide, delay, apply});
        this.target = initial;
        this.pending = null;
        this.timer = null;
        this.destroyed = false;
    }

    update() {
        if (this.destroyed)
            return;
        const decision = this.decide();
        if (decision.visible === this.target) {
            this.cancelPending();
            return;
        }
        if (decision.immediate) {
            this.cancelPending();
            this.commit(decision);
            return;
        }
        if (this.pending === decision.visible)
            return;
        this.cancelPending();
        const delay = Math.max(0, Number(this.delay(decision.visible)) || 0);
        if (!delay) {
            this.commit(decision);
            return;
        }
        this.pending = decision.visible;
        this.timer = this.schedule(delay, () => {
            this.timer = null;
            const pending = this.pending;
            this.pending = null;
            if (this.destroyed)
                return;
            // PointerWatcher only reports movement. Always sample again at
            // expiry, including after a menu, fullscreen or mode change.
            const current = this.decide();
            if (current.visible === pending)
                this.commit(current);
            else
                this.update();
        });
    }

    commit(decision) {
        // Update after apply: a failed animation must be retryable.
        this.apply(decision.visible, decision.reason);
        this.target = decision.visible;
    }

    cancelPending() {
        if (this.timer !== null)
            this.cancel(this.timer);
        this.timer = null;
        this.pending = null;
    }

    destroy() {
        this.destroyed = true;
        this.cancelPending();
    }
}
