const dial = require("@patrickkfkan/peer-dial");
const express = require('express');
const cors = require('cors');
const uuid = require('uuid');
const app = express();

const corsOptions = {
    origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
    optionsSuccessStatus: 204
};

app.use(cors(corsOptions));

const PORT = global.isTizenTube ? 8095 : 8085;
const apps = {
    "YouTube": {
        name: "YouTube",
        state: "stopped",
        allowStop: true,
        pid: null,
        additionalData: {},
        launch(launchData) {
            const tbPackageId = tizen.application.getAppInfo().packageId;
            tizen.application.launchAppControl(
                new tizen.ApplicationControl(
                    "http://tizen.org/appcontrol/operation/view",
                    null,
                    null,
                    null,
                    [
                        new tizen.ApplicationControlData("module", [JSON.stringify(
                            {
                                moduleName: '@foxreis/tizentube',
                                moduleType: 'npm',
                                args: launchData
                            }
                        )])
                    ]
                ), `${tbPackageId}.${global.isTizenTube ? 'TizenTubeStandalone' : 'TizenBrewStandalone'}`);
        }
    }
};

const dialServer = new dial.Server({
    expressApp: app,
    port: PORT,
    prefix: "/dial",
    manufacturer: 'Reis Can',
    modelName: 'TizenBrew',
    friendlyName: `TizenTube (${tizen.systeminfo.getCapability('http://tizen.org/system/model_name')})`,
    uuid: uuid.v5(tizen.systeminfo.getCapability('http://tizen.org/system/tizenid'), '4bcbc514-bdd6-4163-8215-316526fd1d9b'),
    delegate: {
        getApp(appName) {
            return apps[appName];
        },
        launchApp(appName, launchData, callback) {
            // Discovery clients can ask for unknown app names or omit the
            // launch payload. Never crash the long-running DIAL service.
            const app = Object.prototype.hasOwnProperty.call(apps, appName)
                ? apps[appName] : null;
            if (!app) {
                callback("");
                return;
            }
            const safeData = typeof launchData === 'string' ? launchData : '';
            const parsedData = safeData.split('&').reduce((acc, cur) => {
                const parts = cur.split('=');
                if (parts[0]) acc[parts[0]] = parts.slice(1).join('=');
                return acc;
            }, Object.create(null));

            if (parsedData.yumi) {
                app.additionalData = parsedData;
                app.state = "running";
                callback("");
                return;
            }
            try {
                app.state = "starting";
                app.launch(safeData);
                app.pid = "run";
                app.state = "running";
                callback(app.pid);
            } catch (error) {
                // Do not claim DIAL playback started if Tizen rejected
                // the app-control request.
                app.pid = null;
                app.state = "stopped";
                callback("");
            }
        },
        stopApp(appName, pid, callback) {
            console.log(`Got request to stop ${appName} with pid: ${pid}`);
            const app = apps[appName];
            if (app && app.pid === pid) {
                app.pid = null;
                app.state = "stopped";
                callback(true);
            } else {
                callback(false);
            }
        }
    }
});


setInterval(() => {
    // Idle TVs need no application-context scan. Continue checking at
    // the original 5-second rate while a DIAL launch is active.
    if (apps.YouTube.state === "stopped") return;
    try {
        tizen.application.getAppsContext((appsContext) => {
            if (!Array.isArray(appsContext)) return;
            const tbPackageId = tizen.application.getAppInfo().packageId;
            const app = appsContext.find(app => app && app.appId ===
                `${tbPackageId}.${global.isTizenTube ? 'TizenTubeStandalone' : 'TizenBrewStandalone'}`);
            if (!app) {
                apps.YouTube.state = "stopped";
                apps.YouTube.pid = null;
                apps.YouTube.additionalData = {};
            }
        });
    } catch (error) {
        // Temporary TV application-manager errors must not terminate
        // YouTube discovery or affect current playback.
    }
}, 5000);

app.listen(PORT, () => {
    dialServer.start();
});