/**
 * Limited, backoff-based initialization for older TV web engines.
 * Functions that depend on YouTube's private runtime must not poll at
 * 250 ms indefinitely when that runtime never becomes available.
 */
export function createStartupRetry({
    schedule = (callback, delay) => setTimeout(callback, delay),
    cancel = timer => clearTimeout(timer),
    now = () => Date.now(),
    maxWaitMs = 120000,
    initialDelayMs = 250,
    maxDelayMs = 4000
} = {}) {
    let started = null;
    let nextDelay = initialDelayMs;
    let pending = null;
    let done = false;
    function retry(callback) {
        if (done || pending !== null) return false;
        if (started === null) started = now();
        const remaining = maxWaitMs - (now() - started);
        if (remaining <= 0) { done = true; return false; }
        const delay = Math.min(remaining, nextDelay);
        nextDelay = Math.min(maxDelayMs, nextDelay * 2);
        pending = schedule(() => {
            pending = null;
            if (!done) callback();
        }, delay);
        return true;
    }
    function finish() {
        done = true;
        if (pending !== null) {
            cancel(pending);
            pending = null;
        }
    }
    return { retry, finish };
}
