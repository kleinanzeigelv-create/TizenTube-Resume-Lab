"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../service.js"), "utf8");

function environment() {
    const result = { launches: [], contexts: 0, polls: [], state: null };
    const appsContext = [];
    const tizen = {
        systeminfo: { getCapability: name =>
            name.includes("tizenid") ? "fake-TV-ID" : "fake model" },
        ApplicationControl: function (...args) { this.args = args; },
        ApplicationControlData: function (...args) { this.args = args; },
        application: {
            getAppInfo: () => ({ packageId: "TEST" }),
            launchAppControl(...args) { result.launches.push(args); },
            getAppsContext(callback) { result.contexts++; callback(appsContext); }
        }
    };
    let delegate;
    const FakeDialServer = function (options) {
        delegate = options.delegate;
        result.state = options;
        this.start = () => {};
    };
    const app = { use() {}, listen() {} };
    const express = () => app;
    const cors = () => () => {};
    const fakeRequire = id => {
        if (id === "@patrickkfkan/peer-dial") return { Server: FakeDialServer };
        if (id === "express") return express;
        if (id === "cors") return cors;
        if (id === "uuid") return { v5: () => "test-uuid" };
        throw Error("Unexpected require: " + id);
    };
    const sandbox = {
        require: fakeRequire, console: { log() {} }, tizen, global: { isTizenTube: false },
        setInterval(fn, ms) { result.polls.push({fn, ms}); }
    };
    vm.runInNewContext(source, sandbox, { filename: "service.js", timeout: 1000 });
    assert.equal(result.polls.length, 1);
    const dial = {
        launch(name, data) {
            let called = 0, value;
            delegate.launchApp(name, data, output => {called++;value=output;});
            return {called, value};
        },
        stop(name, pid) {
            let called = 0, value;
            delegate.stopApp(name, pid, output => {called++;value=output;});
            return {called, value};
        }
    };
    return {result,delegate,dial,appsContext,tizen};
}

test("unknown DIAL app name returns safely instead of dereferencing undefined", () => {
    const h = environment();
    const x = h.dial.launch("UnknownApp", "");
    assert.equal(x.called, 1);
    assert.equal(x.value, "");
    assert.equal(h.result.launches.length, 0);
});
test("undefined or null launch data do not crash discovery service", () => {
    const h = environment();
    assert.equal(h.dial.launch("YouTube", undefined).value, "run");
    assert.equal(h.dial.launch("YouTube", null).value, "run");
    assert.equal(h.result.launches.length, 2);
});
test("original YouTube DIAL launch semantics are preserved", () => {
    const h = environment();
    assert.equal(h.dial.launch("YouTube", "v=test123&source=example").value, "run");
    assert.equal(h.result.launches.length, 1);
    const [,appid] = h.result.launches[0];
    assert.equal(appid, "TEST.TizenBrewStandalone");
});
test("Yumi data-only command skips launching another native app", () => {
    const h = environment();
    assert.equal(h.dial.launch("YouTube", "yumi=1&session=abc").value, "");
    assert.equal(h.result.launches.length, 0);
    assert.equal(h.delegate.getApp("YouTube").state, "running");
});
test("failure to launch native app is reported without stale running state", () => {
    const h = environment();
    h.tizen.application.launchAppControl = () => { throw Error("TV rejected request"); };
    assert.equal(h.dial.launch("YouTube", "video=abc").value, "");
    const app = h.delegate.getApp("YouTube");
    assert.equal(app.state, "stopped");
    assert.equal(app.pid, null);
});
test("idle DIAL service does not poll TV application contexts", () => {
    const h = environment();
    const timer = h.result.polls[0];
    assert.equal(timer.ms, 5000);
    timer.fn(); timer.fn(); timer.fn();
    assert.equal(h.result.contexts, 0);
});
test("running DIAL service detects native app disappearance at original cadence", () => {
    const h = environment();
    h.dial.launch("YouTube", "video=abc");
    h.result.polls[0].fn();
    assert.equal(h.result.contexts, 1);
    assert.equal(h.delegate.getApp("YouTube").state, "stopped");
    h.result.polls[0].fn();
    assert.equal(h.result.contexts, 1);
});
test("running DIAL service handles unexpected app-context API failure", () => {
    const h = environment();
    h.dial.launch("YouTube", "video=abc");
    h.tizen.application.getAppsContext = () => { throw Error("temporarily unavailable"); };
    assert.doesNotThrow(() => h.result.polls[0].fn());
});
test("DIAL stop remains idempotent for matching and unknown process IDs", () => {
    const h = environment();
    h.dial.launch("YouTube", "v=abc");
    assert.equal(h.dial.stop("YouTube", "wrong").value, false);
    assert.equal(h.dial.stop("YouTube", "run").value, true);
    assert.equal(h.dial.stop("YouTube", "run").value, false);
});
