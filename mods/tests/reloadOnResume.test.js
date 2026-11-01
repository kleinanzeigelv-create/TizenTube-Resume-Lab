import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.window = { h5vcc: null, localStorage: { 'ytaf-configuration': '{}' } };
const { installReloadOnResume } = await import('../features/reloadOnResume.js');

function harness({ hidden = false, enabled = true, throwOnReload = false } = {}) {
    const callbacks = new Map();
    const warnings = [];
    let reloads = 0;
    const config = { enabled };
    const doc = {
        hidden,
        addEventListener(type, cb) { callbacks.set(type, cb); },
        removeEventListener(type, cb) { if (callbacks.get(type) === cb) callbacks.delete(type); }
    };
    const dispose = installReloadOnResume({
        doc,
        reload: () => { reloads++; if (throwOnReload) throw new Error('not available'); },
        enabled: () => config.enabled,
        logger: { warn(...args) { warnings.push(args); } }
    });
    function emit(value) {
        doc.hidden = value;
        const listener = callbacks.get('visibilitychange');
        if (listener) listener();
    }
    return { emit, dispose, callbacks, warnings, config, get reloads() { return reloads; } };
}

test('opt-out: no reload after repeated switches', () => {
    const h = harness({ enabled: false });
    h.emit(true); h.emit(false); h.emit(true); h.emit(false);
    assert.equal(h.reloads, 0);
});
test('opt-in: reload only upon return to foreground', () => {
    const h = harness();
    h.emit(true);
    assert.equal(h.reloads, 0);
    h.emit(false);
    assert.equal(h.reloads, 1);
});
test('multiple foreground events do not loop reload', () => {
    const h = harness();
    h.emit(true); h.emit(false); h.emit(false); h.emit(true); h.emit(false);
    assert.equal(h.reloads, 1);
});
test('prelaunched hidden: first appearance never reloads', () => {
    const h = harness({ hidden: true });
    h.emit(true); h.emit(false);
    assert.equal(h.reloads, 0);
    h.emit(true); h.emit(false);
    assert.equal(h.reloads, 1);
});
test('runtime opt-in applies to next background transition', () => {
    const h = harness({ enabled: false });
    h.emit(true); h.emit(false);
    h.config.enabled = true;
    h.emit(true); h.emit(false);
    assert.equal(h.reloads, 1);
});
test('failed reload caught and not retried', () => {
    const h = harness({ throwOnReload: true });
    h.emit(true); h.emit(false); h.emit(false);
    assert.equal(h.reloads, 1);
    assert.equal(h.warnings.length, 1);
});
test('dispose prevents further callbacks', () => {
    const h = harness();
    h.dispose();
    h.emit(true); h.emit(false);
    assert.equal(h.reloads, 0);
    assert.equal(h.callbacks.size, 0);
});
