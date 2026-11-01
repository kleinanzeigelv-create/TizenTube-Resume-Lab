// Enable features that aren't enabled by default due to YT seeing the TV as a low-end device
import { configRead, configChangeEmitter } from '../config.js';
import { createStartupRetry } from '../utils/startupRetry.js';
const startupRetry = createStartupRetry();

configChangeEmitter.addEventListener('configChange', (event) => {
    enableFeatures();
});


function enableFeatures() {
    if (!window._yttv) return startupRetry.retry(enableFeatures);
    startupRetry.finish();
    const yttvValues = Object.values(window._yttv);

    // Enable preview mode
    yttvValues.find(a => a instanceof Map && a.has("ENABLE_PREVIEWS_WITH_SOUND"))?.set("ENABLE_PREVIEWS_WITH_SOUND", configRead('enablePreviews'));
}

if (document.readyState === 'complete') {
    enableFeatures();
} else window.addEventListener('load', enableFeatures);
