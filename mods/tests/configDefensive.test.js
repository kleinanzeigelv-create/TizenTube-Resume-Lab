import test from 'node:test';
import assert from 'node:assert/strict';

let sequence = 0;
async function loadConfiguration(raw) {
    const storage = {};
    if (raw !== undefined) storage['ytaf-configuration'] = raw;
    globalThis.window = { h5vcc: null, localStorage: storage };
    const config = await import('../config.js?defensive-test=' + (++sequence));
    return { config, storage };
}
test('missing TV configuration returns defaults without writing storage', async () => {
    const {config, storage} = await loadConfiguration();
    assert.equal(config.configRead('enableReloadOnResume'), false);
    assert.equal(config.configRead('enableResumePlaybackRecovery'), false);
    assert.equal(config.configRead('enablePositionPreservingResume'), false);
    assert.equal(config.configRead('enableAdBlock'), true);
    assert.equal(storage['ytaf-configuration'], undefined);
});
test('JSON null, arrays and primitives do not crash configuration reads', async () => {
    for (const raw of ['null', '[]', '123', 'false', '"hello"']) {
        const {config, storage} = await loadConfiguration(raw);
        assert.equal(config.configRead('enableAdBlock'), true, raw);
        assert.equal(config.configRead('enableReloadOnResume'), false, raw);
        assert.equal(config.configRead('enablePositionPreservingResume'), false, raw);
        assert.equal(storage['ytaf-configuration'], raw, 'preserve original raw config');
    }
});
test('invalid JSON is preserved rather than automatically erased', async () => {
    const raw = '{ user configuration is damaged';
    const {config,storage} = await loadConfiguration(raw);
    assert.equal(config.configRead('enableAdBlock'), true);
    assert.equal(storage['ytaf-configuration'], raw);
});
test('valid user settings are not reset by loading a newer version', async () => {
    const raw = JSON.stringify({enableAdBlock: false,
        preferredVideoQuality:'720p', customKey:'keep',
        enableResumePlaybackRecovery:true});
    const {config, storage} = await loadConfiguration(raw);
    assert.equal(config.configRead('enableAdBlock'),false);
    assert.equal(config.configRead('preferredVideoQuality'),'720p');
    assert.equal(config.configRead('enableResumePlaybackRecovery'),true);
    assert.equal(config.configRead('enablePositionPreservingResume'),false);
    assert.equal(config.configRead('customKey'),'keep');
    assert.equal(storage['ytaf-configuration'],raw);
});
test('explicit settings changes still persist while preserving unknown keys', async () => {
    const {config,storage} = await loadConfiguration('{"customPreference":"keep"}');
    const previous = globalThis.CustomEvent;
    globalThis.CustomEvent = class CustomEvent {
        constructor(type, options) { this.type = type; this.detail = options.detail; }
    };
    try {
        config.configWrite('enableAdBlock',false);
        const saved = JSON.parse(storage['ytaf-configuration']);
        assert.equal(saved.enableAdBlock,false);
        assert.equal(saved.customPreference,'keep');
    } finally {
        if (previous === undefined) delete globalThis.CustomEvent;
        else globalThis.CustomEvent = previous;
    }
});
