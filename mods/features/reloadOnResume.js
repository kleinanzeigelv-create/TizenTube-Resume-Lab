import { configRead } from '../config.js';

/**
 * Experimental, API-independent fallback for broken Tizen 5 decoder resume.
 * Reloads the YouTube page only after a foreground -> hidden -> foreground
 * transition and only if the user explicitly opts in. This does NOT restart
 * the native app process or preserve video playback position.
 */
export function installReloadOnResume({ doc, reload, enabled, logger = console }) {
    let seenForeground = doc.hidden === false;
    let wasBackgrounded = false;
    let reloadRequested = false;

    function onVisibilityChange() {
        if (doc.hidden) {
            if (seenForeground) wasBackgrounded = true;
            return;
        }
        seenForeground = true;
        if (!wasBackgrounded || reloadRequested || enabled() !== true) return;
        reloadRequested = true;
        try {
            reload();
        } catch (error) {
            logger.warn('[TizenTube lifecycle] Resume reload unavailable', error);
        }
    }

    doc.addEventListener('visibilitychange', onVisibilityChange);
    return () => doc.removeEventListener('visibilitychange', onVisibilityChange);
}

export function setupReloadOnResume() {
    return installReloadOnResume({
        doc: document,
        reload: () => window.location.reload(),
        enabled: () => configRead('enableReloadOnResume')
    });
}
