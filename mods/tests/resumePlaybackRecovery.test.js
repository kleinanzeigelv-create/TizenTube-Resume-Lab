import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.window = { h5vcc: null, localStorage: { 'ytaf-configuration': '{}' } };
const { installResumePlaybackRecovery } = await import('../features/resumePlaybackRecovery.js');

function harness({ enabled = true, paused = false, videoPresent = true } = {}) {
    const handlers = new Map();
    const video = {
        currentTime: 23, paused, ended: false, playCalls: 0,
        play() { this.playCalls++; this.paused = false; return Promise.resolve(); }
    };
    let selected = videoPresent ? video : null;
    const doc = {
        hidden: false,
        addEventListener(name, fn) { handlers.set(name, fn); },
        removeEventListener(name) { handlers.delete(name); }
    };
    const pending = new Map();
    let nextId = 1;
    let time = 0;
    let reloads = 0;
    const setup = installResumePlaybackRecovery({
        doc, getVideo: () => selected, enabled: () => enabled,
        reload: () => { reloads++; },
        setTimer: (fn, delay) => {
            const id = nextId++;
            pending.set(id, { fn, due: time + delay });
            return id;
        },
        clearTimer: id => pending.delete(id),
        logger: { warn() {} }
    });
    function advance(ms) {
        const end = time + ms;
        for (;;) {
            const pair = [...pending].filter(([, x]) => x.due <= end)
                .sort((a, b) => a[1].due - b[1].due)[0];
            if (!pair) break;
            pending.delete(pair[0]);
            time = pair[1].due;
            pair[1].fn();
        }
        time = end;
    }
    function event(name, target = selected) {
        const fn = handlers.get(name);
        if (fn) fn(name === 'visibilitychange' ? undefined : { target });
    }
    function hidden() { doc.hidden = true; event('visibilitychange'); }
    function visible() { doc.hidden = false; event('visibilitychange'); }
    return {
        video, doc, hidden, visible, event, advance, setup,
        setEnabled(v) { enabled = v; },
        setVideo(v) { selected = v; },
        get reloads() { return reloads; },
        get timerCount() { return pending.size; },
        get listenerCount() { return handlers.size; }
    };
}
test('inactive until real background transition', () => {
    const h = harness(); h.visible(); h.advance(8000);
    assert.equal(h.reloads, 0); assert.equal(h.timerCount, 0); h.setup();
});
test('defaults to no action when opt-in is disabled', () => {
    const h = harness({ enabled: false });
    h.hidden(); h.visible(); h.advance(8000);
    assert.equal(h.reloads, 0);h.setup();
});
test('no active video means no recovery', () => {
    const h = harness({ paused: true });
    h.hidden(); h.visible(); h.advance(8000);
    assert.equal(h.reloads, 0);h.setup();
});
test('healthy playback continues without reload', () => {
    const h = harness();
    h.hidden();h.visible();h.advance(400);
    h.video.currentTime += 2;h.advance(5000);
    assert.equal(h.reloads, 0);assert.equal(h.video.playCalls,0);h.setup();
});
test('resume of auto-paused video tries play before fallback', () => {
    const h=harness();h.hidden();h.video.paused=true;h.visible();h.advance(400);
    assert.equal(h.video.playCalls,1);
    h.video.currentTime += 1;h.advance(5000);
    assert.equal(h.reloads,0);h.setup();
});
test('actually stalled decoder triggers one fallback reload', () => {
    const h=harness();h.hidden();h.visible();h.advance(5500);
    assert.equal(h.reloads,1);h.visible();h.advance(6000);
    assert.equal(h.reloads,1);h.setup();
});
test('later hidden event invalidates pending recovery', () => {
    const h=harness();h.hidden();h.visible();h.advance(400);h.hidden();
    h.advance(9000);assert.equal(h.reloads,0);h.setup();
});
test('video removed or replaced avoids unrelated reload', () => {
    const h=harness();h.hidden();h.visible();h.advance(400);
    h.setVideo({currentTime:0,paused:false,ended:false});
    h.advance(6000);assert.equal(h.reloads,0);h.setup();
});
test('video missing after return stays in safe no-op', () => {
    const h=harness();h.hidden();h.setVideo(null);h.visible();h.advance(8000);
    assert.equal(h.reloads,0);h.setup();
});
test('play error falls back after confirming stall', () => {
    const h=harness();h.hidden();h.video.paused=true;
    h.video.play=()=>{throw Error('codec unavailable');};
    h.visible();h.advance(5500);assert.equal(h.reloads,1);h.setup();
});
test('dispose cancels listeners and timers', () => {
    const h=harness();h.hidden();h.visible();h.advance(400);
    h.setup();h.advance(6000);
    assert.equal(h.reloads,0);assert.equal(h.listenerCount,0);assert.equal(h.timerCount,0);
});
test('ended media is never treated as recoverable playback', () => {
    const h = harness();
    h.event('ended');
    h.video.ended = true;
    h.hidden(); h.visible(); h.advance(7000);
    assert.equal(h.reloads, 0); h.setup();
});
test('pause after successful auto-resume cancels destructive fallback', () => {
    const h=harness();
    h.hidden();h.video.paused=true;h.visible();h.advance(400);
    assert.equal(h.video.playCalls,1);
    h.event('playing');h.video.paused=true;h.event('pause');
    h.advance(6500);
    assert.equal(h.reloads,0);assert.equal(h.timerCount,0);h.setup();
});
test('initial auto-pause without confirmed playback does not hide a stall', () => {
    const h=harness();
    h.hidden();h.video.paused=true;h.visible();h.advance(400);
    h.event('pause');h.advance(5500);
    assert.equal(h.reloads,1);h.setup();
});
test('video replaced before background cannot inherit stale playback state', () => {
    const h=harness();
    h.event('playing');
    const other={currentTime:7,paused:true,ended:false,playCalls:0,play() {
        this.playCalls++;this.paused=false;return Promise.resolve();
    }};
    h.setVideo(other);
    h.hidden();h.visible();h.advance(9000);
    assert.equal(other.playCalls,0);
    assert.equal(h.reloads,0);
    h.setup();
});
test('video replaced while hidden never gets autoplayed or reloads', () => {
    const h=harness();
    h.hidden();
    const other={currentTime:0,paused:true,ended:false,playCalls:0,play() {
        this.playCalls++;this.paused=false;return Promise.resolve();
    }};
    h.setVideo(other);
    h.visible();h.advance(10000);
    assert.equal(other.playCalls,0);
    assert.equal(h.reloads,0);
    h.setup();
});
test('runtime opt-in is read at return', () => {
    const h=harness({enabled:false});h.hidden();h.setEnabled(true);h.visible();
    h.advance(6000);assert.equal(h.reloads,1);h.setup();
});

test('replacing the video during 400ms settle must not autoplay a new video', () => {
    const h = harness();
    h.hidden();h.visible();
    const replacement = {currentTime:0, paused:true, ended:false,
        playCalls:0, play(){ this.playCalls++;return Promise.resolve(); }};
    h.setVideo(replacement);
    h.advance(8000);
    assert.equal(replacement.playCalls,0);
    assert.equal(h.reloads,0);
    assert.equal(h.timerCount,0);
    h.setup();
});
test('same reused HTML video element with a different source does not reload', () => {
    const h = harness();
    h.video.currentSrc = 'blob:youtube-video-old';
    h.hidden();h.visible();
    h.video.currentSrc = 'blob:youtube-video-new';
    h.advance(8500);
    assert.equal(h.video.playCalls,0);
    assert.equal(h.reloads,0);
    h.setup();
});
test('same video source changing after watchdog scheduling never reloads new media', () => {
    const h = harness();
    h.video.currentSrc = 'blob:old';
    h.hidden();h.visible();h.advance(400);
    h.video.currentSrc = 'blob:new';
    h.advance(6000);
    assert.equal(h.reloads,0);
    h.setup();
});
test('media loadstart invalidates recovery even if YouTube reuses the video element', () => {
    const h = harness();
    h.hidden();h.visible();h.advance(400);
    h.event('loadstart');
    h.advance(9000);
    assert.equal(h.reloads,0);
    assert.equal(h.timerCount,0);
    h.setup();
});
test('media loadstart while backgrounded cancels resuming a different program', () => {
    const h = harness();
    h.hidden();
    h.event('loadstart');
    h.visible();h.advance(7000);
    assert.equal(h.reloads,0);
    assert.equal(h.video.playCalls,0);
    h.setup();
});
test('turning off recovery during the watchdog suppresses any fallback reload', () => {
    const h = harness();
    h.hidden();h.visible();h.advance(400);
    h.setEnabled(false);
    h.advance(6500);
    assert.equal(h.reloads,0);
    h.setup();
});
test('turning off recovery during settle prevents starting recovery timers or play', () => {
    const h = harness();
    h.hidden();h.video.paused=true;h.visible();
    h.setEnabled(false);
    h.advance(9000);
    assert.equal(h.video.playCalls,0);
    assert.equal(h.reloads,0);
    h.setup();
});
