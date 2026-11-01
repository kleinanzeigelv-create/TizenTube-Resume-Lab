import { configRead } from '../config.js';

/*
 * Experimental, position-preserving TV lifecycle recovery.
 *
 * Unlike page reload, this never navigates, changes persistent playback
 * settings, seeks a different video, or automatically launches a new title.
 * AVPlay is used only when its active state establishes that it owns a
 * media session. Otherwise an explicitly supported YouTube player API is
 * tried; no guessed private Cobalt/Starboard hooks are called.
 *
 * Public APIs do not prove which backend youtube.com/tv uses on Tizen 5.
 * The on-screen diagnostic contains only capability / result codes.
 */
export function installPositionPreservingResume({
    doc, enabled, getAVPlay, getYoutubePlayer, schedule, unschedule,
    report = () => {}, logger = console, delayMs = 350
}) {
    let visibleBefore = doc.hidden === false;
    let snapshot = null;
    let timer = null;
    let epoch = 0;
    let disposed = false;

    function clearTimer() {
        if (timer !== null) unschedule(timer);
        timer = null;
    }
    function emit(code) {
        try { report(code); } catch (_) { /* diagnostics cannot break playback */ }
    }
    function avplaySnapshot() {
        let api;
        try {
            api = getAVPlay();
            if (!api || typeof api.getState !== 'function' ||
                typeof api.suspend !== 'function' ||
                (typeof api.restoreAsync !== 'function' &&
                 typeof api.restore !== 'function')) return null;
            const state = api.getState();
            if (state !== 'PLAYING' && state !== 'PAUSED') return null;
            api.suspend(); // Samsung-prescribed resource release, saves position
            return { kind: 'avplay', api };
        } catch (_) {
            emit('AVPLAY_SUSPEND_FAILED');
            return { kind: 'unavailable' }; // never mix native and web recovery
        }
    }
    function youtubeSnapshot() {
        let player;
        try {
            player = getYoutubePlayer();
            if (!player ||
                typeof player.getVideoData !== 'function' ||
                typeof player.getCurrentTime !== 'function' ||
                typeof player.seekTo !== 'function') return null;
            const data = player.getVideoData();
            const id = data && data.video_id;
            const time = player.getCurrentTime();
            if (typeof id !== 'string' || !id ||
                !Number.isFinite(time) || time < 0 || time > 864000) return null;
            const state = typeof player.getPlayerStateObject === 'function'
                ? player.getPlayerStateObject() : null;
            if (state && (state.isEnded || state.isAdPlaying)) return null;
            if (state && state.isPlaying === true &&
                typeof player.pauseVideo === 'function') {
                player.pauseVideo(); // retain video ID and position
            }
            return { kind: 'youtube', player, id, time };
        } catch (_) {
            emit('YT_PLAYER_SNAPSHOT_FAILED');
            return { kind: 'unavailable' };
        }
    }
    function restoreAVPlay(saved) {
        const api = saved.api;
        try {
            if (typeof api.restoreAsync === 'function') {
                api.restoreAsync(null, 0, false,
                    () => emit('AVPLAY_RESTORE_OK'),
                    () => emit('AVPLAY_RESTORE_FAILED'));
                emit('AVPLAY_RESTORE_REQUESTED');
            } else {
                api.restore(); // no URL/seek means original stored position
                emit('AVPLAY_RESTORE_OK');
            }
        } catch (_) {
            emit('AVPLAY_RESTORE_FAILED');
        }
    }
    function restoreYoutube(saved) {
        try {
            const current = getYoutubePlayer();
            if (current !== saved.player ||
                typeof current.getVideoData !== 'function' ||
                current.getVideoData()?.video_id !== saved.id) {
                emit('YT_DIFFERENT_VIDEO');
                return;
            }
            // seekTo(seconds, allowSeekAhead) requests a fresh segment and may
            // reinitialize a stalled decoder without resetting the video ID.
            // It is a guarded best effort, not a validated Samsung workaround.
            current.seekTo(saved.time, true);
            emit('YT_SEEK_REQUESTED');
        } catch (_) {
            emit('YT_SEEK_FAILED');
        }
    }
    function onVisibilityChange() {
        if (disposed) return;
        ++epoch;
        clearTimer();
        if (doc.hidden) {
            // Duplicate hidden notifications must not erase a valid capture.
            if (!visibleBefore) return;
            visibleBefore = false;
            if (!enabled()) {
                snapshot = null;
                return;
            }
            snapshot = avplaySnapshot() || youtubeSnapshot() ||
                { kind: 'unavailable' };
            return;
        }
        visibleBefore = true;
        const saved = snapshot;
        snapshot = null;
        if (!saved || !enabled()) return;
        const ticket = epoch;
        timer = schedule(() => {
            timer = null;
            if (disposed || doc.hidden || !enabled() || ticket !== epoch) return;
            if (saved.kind === 'avplay') restoreAVPlay(saved);
            else if (saved.kind === 'youtube') restoreYoutube(saved);
            else emit('NO_SUPPORTED_PLAYER');
        }, delayMs);
    }
    doc.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
        disposed = true;
        ++epoch;
        clearTimer();
        snapshot = null;
        doc.removeEventListener('visibilitychange', onVisibilityChange);
    };
}

function showLocalStatus(code) {
    // No video IDs, filenames, credentials, URLs or network traffic.
    if (!document.body) return;
    const id = 'tt-position-resume-debug';
    let node = document.getElementById(id);
    if (!node) {
        node = document.createElement('div');
        node.id = id;
        node.style.cssText =
            'position:fixed;top:12px;right:12px;z-index:2147483647;' +
            'background:#111;color:white;font:14px sans-serif;' +
            'padding:9px;border:1px solid #999;max-width:65vw;' +
            'pointer-events:none';
        document.body.appendChild(node);
    }
    node.textContent = 'TizenTube Resume Lab: ' + code;
    if (node._ttRemoveTimer) clearTimeout(node._ttRemoveTimer);
    node._ttRemoveTimer = setTimeout(() => {
        node._ttRemoveTimer = null;
        if (node.parentNode) node.parentNode.removeChild(node);
    }, 18000);
}

export function setupPositionPreservingResume() {
    return installPositionPreservingResume({
        doc: document,
        enabled: () => configRead('enablePositionPreservingResume') &&
            !configRead('enableReloadOnResume') &&
            !configRead('enableResumePlaybackRecovery'),
        getAVPlay: () => window.webapis?.avplay,
        getYoutubePlayer: () => document.querySelector('.html5-video-player'),
        schedule: (fn, ms) => setTimeout(fn, ms),
        unschedule: id => clearTimeout(id),
        report: showLocalStatus
    });
}
