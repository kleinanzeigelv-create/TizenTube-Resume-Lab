import { configRead } from '../config.js';

/*
 * Experimental YouTube TV player session reconstruction, never full-page reload.
 * The on-screen status only reflects requests and player-state events; the
 * user's actual picture/audio must verify decoder recovery.
 */
export function installSessionRecreateOnResume({
    doc, getPlayer, enabled, report = () => {},
    schedule = (fn, ms) => setTimeout(fn, ms),
    unschedule = id => clearTimeout(id),
    settleMs = 650, confirmMs = 7000
}) {
    let visible = doc.hidden === false;
    let saved = null;
    let generation = 0;
    let settleTimer = null;
    let confirmTimer = null;
    let pending = null;
    let disposed = false;

    function notify(code) {
        try { report(code); } catch (_) {}
    }
    function clearTimers() {
        if (settleTimer !== null) unschedule(settleTimer);
        if (confirmTimer !== null) unschedule(confirmTimer);
        settleTimer = null;
        confirmTimer = null;
    }
    function currentSnapshot(player) {
        if (!player || typeof player.getVideoData !== 'function' ||
            typeof player.getCurrentTime !== 'function') return null;
        const video = player.getVideoData();
        const id = video && video.video_id;
        const time = player.getCurrentTime();
        if (typeof id !== 'string' || !id ||
            !Number.isFinite(time) || time < 0 || time > 864000) return null;
        const state = typeof player.getPlayerStateObject === 'function'
            ? player.getPlayerStateObject() : null;
        if (state && (state.isEnded || state.isAdPlaying)) return null;
        return { player, id, time };
    }
    function isOriginal(snapshot) {
        const current = getPlayer();
        if (!current || current !== snapshot.player ||
            typeof current.getVideoData !== 'function') return false;
        return current.getVideoData()?.video_id === snapshot.id;
    }
    function clearPending() {
        if (pending && pending.player &&
            typeof pending.player.removeEventListener === 'function')
            pending.player.removeEventListener('onStateChange', pending.listener);
        pending = null;
    }
    function restore() {
        const snapshot = saved;
        saved = null;
        if (disposed || doc.hidden || !enabled() || !snapshot) return;
        let current;
        try {
            if (!isOriginal(snapshot)) {
                notify('YT_SESSION_CHANGED_VIDEO');
                return;
            }
            current = getPlayer();
            if (typeof current.loadVideoById !== 'function') {
                notify('YT_SESSION_API_UNAVAILABLE');
                return;
            }
            const ticket = generation;
            let observedState = false;
            const listener = () => {
                if (disposed || doc.hidden || generation !== ticket ||
                    !enabled()) return;
                try {
                    if (!isOriginal(snapshot)) {
                        clearPending();
                        clearTimers();
                        notify('YT_SESSION_CHANGED_VIDEO');
                        return;
                    }
                    const state = typeof current.getPlayerStateObject === 'function'
                        ? current.getPlayerStateObject() : null;
                    if (state && (state.isPlaying || state.isPaused || state.isBuffering)) {
                        observedState = true;
                        // Keep the intended paused-on-return semantics. This
                        // is only allowed after a new state transition.
                        if (state.isPlaying && typeof current.pauseVideo === 'function') {
                            const at = current.getCurrentTime();
                            if (Number.isFinite(at) && at >= snapshot.time - 1) {
                                current.pauseVideo();
                                notify('YT_SESSION_STATE_RECEIVED');
                                clearPending();
                                clearTimers();
                            }
                        } else if (state.isPaused) {
                            notify('YT_SESSION_STATE_RECEIVED');
                            clearPending();
                            clearTimers();
                        }
                    }
                } catch (_) {
                    notify('YT_SESSION_STATE_ERROR');
                    clearPending();
                    clearTimers();
                }
            };
            pending = { player: current, listener };
            if (typeof current.addEventListener === 'function')
                current.addEventListener('onStateChange', listener);
            // Install the watchdog before calling the player: some players
            // synchronously emit the first onStateChange event during load.
            confirmTimer = schedule(() => {
                confirmTimer = null;
                if (disposed || doc.hidden || generation !== ticket || !enabled()) return;
                const status = observedState ? 'YT_SESSION_STATE_ONLY' :
                    'YT_SESSION_NO_STATE_EVENT';
                clearPending();
                notify(status);
            }, confirmMs);
            notify('YT_SESSION_RECREATE_REQUESTED');
            current.loadVideoById({ videoId: snapshot.id, startSeconds: snapshot.time });
        } catch (_) {
            clearPending();
            clearTimers();
            notify('YT_SESSION_RECREATE_FAILED');
        }
    }
    function onVisibilityChange() {
        if (disposed) return;
        ++generation;
        clearTimers();
        clearPending();
        if (doc.hidden) {
            if (!visible) return;
            visible = false;
            saved = null;
            if (!enabled()) return;
            try {
                saved = currentSnapshot(getPlayer());
                if (!saved) {
                    notify('YT_SESSION_SNAPSHOT_UNAVAILABLE');
                    return;
                }
                // Do not leave streaming actively consuming the decoder
                // after TV suspends the web app.
                const state = typeof saved.player.getPlayerStateObject === 'function'
                    ? saved.player.getPlayerStateObject() : null;
                if (state && state.isPlaying &&
                    typeof saved.player.pauseVideo === 'function')
                    saved.player.pauseVideo();
            } catch (_) {
                saved = null;
                notify('YT_SESSION_SNAPSHOT_FAILED');
            }
            return;
        }
        visible = true;
        if (!saved || !enabled()) { saved = null; return; }
        settleTimer = schedule(() => {
            settleTimer = null;
            restore();
        }, settleMs);
    }
    doc.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
        disposed = true;
        ++generation;
        clearTimers();
        clearPending();
        saved = null;
        doc.removeEventListener('visibilitychange', onVisibilityChange);
    };
}

function localStatus(code) {
    if (!document.body) return;
    const id = 'tt-session-recreate-status';
    let node = document.getElementById(id);
    if (!node) {
        node = document.createElement('div');
        node.id = id;
        node.style.cssText = 'position:fixed;top:12px;right:12px;' +
            'z-index:2147483647;background:#111;color:#fff;' +
            'font:14px sans-serif;padding:9px;border:1px solid #999;' +
            'max-width:70vw;pointer-events:none';
        document.body.appendChild(node);
    }
    node.textContent = 'TizenTube Session Lab: ' + code;
    if (node._removeTimer) clearTimeout(node._removeTimer);
    node._removeTimer = setTimeout(() => {
        node._removeTimer = null;
        if (node.parentNode) node.parentNode.removeChild(node);
    }, 18000);
}

export function setupSessionRecreateOnResume() {
    return installSessionRecreateOnResume({
        doc: document,
        getPlayer: () => document.querySelector('.html5-video-player'),
        enabled: () => configRead('enableSessionRecreateOnResume') &&
            !configRead('enablePositionPreservingResume') &&
            !configRead('enableResumePlaybackRecovery') &&
            !configRead('enableReloadOnResume'),
        report: localStatus
    });
}
