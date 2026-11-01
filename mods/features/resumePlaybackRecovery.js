import { configRead } from '../config.js';

/**
 * Opt-in, low-impact Tizen TV video playback recovery experiment.
 *
 * When an actively playing HTML video is backgrounded, the player may be
 * suspended by Tizen. On resume try HTMLMediaElement.play() and check that
 * currentTime advances. Reload the page ONLY if playback remains stalled.
 *
 * Deliberately does not call privileged Tizen APIs from the hosted YouTube
 * page, touch global app settings, persist account state or seek the video.
 *
 * Limitations: some Cobalt players do not expose a normal HTML <video>,
 * and a page reload may reset the current video/position. Default OFF.
 */
export function installResumePlaybackRecovery({
    doc,
    getVideo,
    enabled,
    reload,
    setTimer,
    clearTimer,
    logger = console,
    settleMs = 400,
    watchdogMs = 5000
}) {
    let playingBeforeHide = false;
    let backgrounded = false;
    let backgroundVideo = null;
    let backgroundSource = null;
    let lastPlayingVideo = null;
    let recoveryPending = false;
    let resumedPlayingObserved = false;
    let reloadIssued = false;
    let settleTimer = null;
    let watchdogTimer = null;
    let epoch = 0;
    let disposed = false;

    function mediaSource(video) {
        if (!video) return null;
        // Cobalt may expose no stable src. Only compare sources when both
        // are defined, rather than treating absence of a URL as a change.
        const value = video.currentSrc || video.src;
        return typeof value === 'string' && value ? value : null;
    }

    function isSameMedia(video) {
        if (!video || video !== backgroundVideo) return false;
        const currentSource = mediaSource(video);
        return !backgroundSource || !currentSource || backgroundSource === currentSource;
    }

    function cancelTimers() {
        if (settleTimer !== null) clearTimer(settleTimer);
        if (watchdogTimer !== null) clearTimer(watchdogTimer);
        settleTimer = null;
        watchdogTimer = null;
        recoveryPending = false;
    }

    function onMediaPlaying(event) {
        if (!disposed && !doc.hidden && event.target === getVideo()) {
            playingBeforeHide = true;
            lastPlayingVideo = event.target;
            if (recoveryPending) resumedPlayingObserved = true;
        }
    }
    function onMediaPause(event) {
        if (disposed || doc.hidden || event.target !== getVideo()) return;
        if (recoveryPending && resumedPlayingObserved) {
            // Playback had resumed: respect a later pause instead of reloading.
            epoch++;
            cancelTimers();
            playingBeforeHide = false;
            lastPlayingVideo = null;
        } else if (!recoveryPending) {
            playingBeforeHide = false;
            lastPlayingVideo = null;
        }
    }

    function onMediaLoadStart(event) {
        if (disposed || event.target !== getVideo()) return;
        // YouTube can reuse the SAME <video> element for another video.
        // Any source switch invalidates the prior playback recovery.
        if (backgrounded || recoveryPending) {
            epoch++;
            cancelTimers();
            playingBeforeHide = false;
            lastPlayingVideo = null;
            backgroundSource = null;
            backgroundVideo = null;
        }
    }

    function onMediaEnded(event) {
        if (!disposed && event.target === getVideo()) {
            playingBeforeHide = false;
            lastPlayingVideo = null;
        }
    }

    function onVisibilityChange() {
        if (disposed) return;
        if (doc.hidden) {
            resumedPlayingObserved = false;
            epoch++;
            cancelTimers();
            const video = getVideo();
            backgroundVideo = video;
            backgroundSource = mediaSource(video);
            // An unrelated previous video must not authorize playback or a
            // forced reload after the user has navigated to another video.
            playingBeforeHide = !!(video && !video.ended &&
                ((!video.paused) || (video === lastPlayingVideo && playingBeforeHide)));
            backgrounded = true;
            return;
        }
        if (!backgrounded) return;
        backgrounded = false;
        if (!playingBeforeHide || !isSameMedia(getVideo()) ||
            !enabled() || reloadIssued) return;
        const ticket = ++epoch;
        resumedPlayingObserved = false;
        recoveryPending = true;
        settleTimer = setTimer(() => {
            settleTimer = null;
            if (disposed || doc.hidden || ticket !== epoch) return;
            const video = getVideo();
            if (!isSameMedia(video) || video.ended || !enabled()) {
                recoveryPending = false;
                return;
            }
            const initialTime = Number(video.currentTime);
            if (!Number.isFinite(initialTime)) {
                recoveryPending = false;
                return;
            }
            // Some engines automatically pause the player in background.
            // Only resume if it was observed playing before backgrounding.
            let attemptedPlay = false;
            if (video.paused) {
                attemptedPlay = true;
                try {
                    const attempted = video.play();
                    if (attempted && typeof attempted.catch === 'function') {
                        attempted.catch(() => {
                            // Rejection is not itself proof of decoder loss.
                            // The watchdog below makes that decision.
                        });
                    }
                } catch (error) {
                    logger.warn('[TizenTube lifecycle] Resume play failed', error);
                }
            }
            watchdogTimer = setTimer(() => {
                watchdogTimer = null;
                recoveryPending = false;
                if (disposed || doc.hidden || ticket !== epoch ||
                    !isSameMedia(getVideo()) || video.ended ||
                    reloadIssued || !enabled()) return;
                const now = Number(video.currentTime);
                if (Number.isFinite(now) && now >= initialTime + 0.25) return;
                // Guard against reloading a video the user has paused after
                // resuming. An initially auto-paused video is still eligible.
                if (video.paused && !attemptedPlay) return;
                reloadIssued = true;
                try {
                    reload();
                } catch (error) {
                    logger.warn('[TizenTube lifecycle] Fallback reload failed', error);
                }
            }, watchdogMs);
        }, settleMs);
    }

    doc.addEventListener('visibilitychange', onVisibilityChange);
    doc.addEventListener('playing', onMediaPlaying, true);
    doc.addEventListener('pause', onMediaPause, true);
    doc.addEventListener('ended', onMediaEnded, true);
    doc.addEventListener('loadstart', onMediaLoadStart, true);
    return () => {
        disposed = true;
        epoch++;
        cancelTimers();
        doc.removeEventListener('visibilitychange', onVisibilityChange);
        doc.removeEventListener('playing', onMediaPlaying, true);
        doc.removeEventListener('pause', onMediaPause, true);
        doc.removeEventListener('ended', onMediaEnded, true);
        doc.removeEventListener('loadstart', onMediaLoadStart, true);
    };
}

export function setupResumePlaybackRecovery() {
    return installResumePlaybackRecovery({
        doc: document,
        getVideo: () => document.querySelector('video'),
        // Forced reload takes precedence if both experiments were enabled.
        enabled: () => configRead('enableResumePlaybackRecovery') && !configRead('enableReloadOnResume'),
        reload: () => window.location.reload(),
        setTimer: (fn, ms) => setTimeout(fn, ms),
        clearTimer: id => clearTimeout(id)
    });
}
