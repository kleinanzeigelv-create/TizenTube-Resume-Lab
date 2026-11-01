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
    let stateTimer = null;
    let stateListener = null;
    let statePlayer = null;
    let epoch = 0;
    let disposed = false;

    function clearTimer() {
        if (timer !== null) unschedule(timer);
        if (stateTimer !== null) unschedule(stateTimer);
        timer = null;
        stateTimer = null;
        if (statePlayer && stateListener &&
            typeof statePlayer.removeEventListener === 'function') {
            try { statePlayer.removeEventListener('onStateChange', stateListener); } catch (_) {}
        }
        statePlayer = null;
        stateListener = null;
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
                typeof player.getCurrentTime !== 'function') return null;
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
            if (typeof current.loadVideoById !== 'function') {
                emit('YT_SESSION_API_UNAVAILABLE');
                return;
            }
            // Hardware V6 showed seekTo() was called but the decoder stayed
            // frozen. Request a new media session for the SAME video and time,
            // without a page reload. YouTube TV may not implement this API.
            const ticket = epoch;
            let observedState = false;
            let resetAttempted = false;
            let resetting = false;
            const listener = () => {
                if (resetting) return;
                if (disposed || doc.hidden || ticket !== epoch || !enabled()) return;
                try {
                    if (getYoutubePlayer() !== current ||
                        current.getVideoData()?.video_id !== saved.id) {
                        clearTimer();
                        emit('YT_SESSION_CHANGED_VIDEO');
                        return;
                    }
                    const state = typeof current.getPlayerStateObject === 'function'
                        ? current.getPlayerStateObject() : null;
                    if (!state) return;
                    if (state.isPlaying || state.isPaused || state.isBuffering)
                        observedState = true;
                    if (state.isPlaying && typeof current.pauseVideo === 'function') {
                        const at = typeof current.getCurrentTime === 'function'
                            ? current.getCurrentTime() : NaN;
                        if (Number.isFinite(at) && at >= saved.time - 1) {
                            current.pauseVideo();
                            clearTimer();
                            emit('YT_SESSION_STATE_RECEIVED');
                        }
                    } else if (state.isPaused) {
                        clearTimer();
                        emit('YT_SESSION_STATE_RECEIVED');
                    }
                } catch (_) {
                    clearTimer();
                    emit('YT_SESSION_STATE_FAILED');
                }
            };
            if (typeof current.addEventListener === 'function') {
                statePlayer = current;
                stateListener = listener;
                current.addEventListener('onStateChange', listener);
            }
            stateTimer = schedule(() => {
                stateTimer = null;
                if (disposed || doc.hidden || ticket !== epoch || !enabled()) return;
                try {
                    // Never reset a new title, a replaced player or a session
                    // that demonstrably progressed after the original request.
                    if (getYoutubePlayer() !== current ||
                        current.getVideoData()?.video_id !== saved.id) {
                        clearTimer();
                        emit('YT_SESSION_CHANGED_VIDEO');
                        return;
                    }
                    const at = current.getCurrentTime();
                    if (Number.isFinite(at) && at > saved.time + 1.5) {
                        clearTimer();
                        emit('YT_SESSION_TIME_PROGRESS');
                        return;
                    }
                    // Only one bounded, opt-in resource reset per return.
                    // Releasing the existing native stream is different from
                    // reloading the entire page or restarting TizenBrew.
                    if (resetAttempted ||
                        typeof current.stopVideo !== 'function') {
                        clearTimer();
                        emit(resetAttempted ? 'YT_SESSION_RESET_STILL_STALLED' :
                            'YT_SESSION_RESET_API_UNAVAILABLE');
                        return;
                    }
                    resetAttempted = true;
                    resetting = true;
                    current.stopVideo();
                    resetting = false;
                    emit('YT_SESSION_RESET_REQUESTED');
                    current.loadVideoById({
                        videoId: saved.id, startSeconds: saved.time
                    });
                    stateTimer = schedule(() => {
                        stateTimer = null;
                        if (disposed || doc.hidden || ticket !== epoch || !enabled()) return;
                        clearTimer();
                        emit('YT_SESSION_RESET_UNCONFIRMED');
                    }, 5000);
                } catch (_) {
                    clearTimer();
                    emit('YT_SESSION_RESET_FAILED');
                }
            }, 7000);
            emit('YT_SESSION_RECREATE_REQUESTED');
            current.loadVideoById({ videoId: saved.id, startSeconds: saved.time });
        } catch (_) {
            clearTimer();
            emit('YT_SESSION_RECREATE_FAILED');
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
