# TizenTube Resume Lab

**Experimental, unofficial TizenTube fork for Samsung Tizen TV app-switch playback recovery.**

This repository is based on **[TizenTube](https://github.com/reisxd/TizenTube)** by
**Reis Can (@reisxd)** and its contributors. TizenTube runs as a website
modification module within **[TizenBrew](https://github.com/reisxd/TizenBrew)**,
also maintained by Reis Can and contributors. We are not affiliated with or
endorsed by the original projects, Samsung, Google or YouTube.

## What this test actually changes

On a Samsung Q60R (2019, Tizen 5), returning from Live TV, Moonlight or Samsung
DeX was reported to leave YouTube's navigation functional but its video frozen
or black until the app was fully restarted. This build adds **two optional,
disabled-by-default experiments**:

- **Adaptive playback recovery:** After an app visibility change, resume
  playback only when the same video had been playing. After checking media
  progress, optionally reload the hosted YouTube page if it appears stalled.
  Source change, video navigation, user pause and option changes cancel recovery
  to avoid acting on the wrong video.
- **Reload on resume:** An alternative to the adaptive strategy. On returning
  from the background, request a page reload. It takes precedence if both
  settings were enabled.

Other changes include safer configuration reads, bounded initialization retries
for missing YouTube internals, and guards around changing player structures.

**Not yet verified on a physical Samsung TV.** These are test hypotheses, not a
claim that the Tizen/Cobalt native decoder issue is fixed. Basic builds and
automated tests have passed; hardware compatibility and reliability remain
unknown.

## Installation of the verified experimental commit

TizenBrew can load a pinned GitHub module via the following identifier:

`gh/kleinanzeigelv-create/TizenTube-Resume-Lab@088c4912ab64`

This identifier pins the exact verified Git commit (`088c4912ab642c187e23a6609c1bfc6cbf6cbe1d`), rather than relying on a mutable branch or an unpublished Git tag. The module manifest and compiled script were verified accessible on jsDelivr with SHA-256 identical to the tested local build.

For an A/B test, keep your existing original TizenTube module installed.
Add this as a separate TizenBrew module and manually select which module to
launch. Do not set both variants to auto-launch. Never overwrite or uninstall
the original application just to perform the test.

In the test module's **Settings → Video player**, keep both recovery options
off for the initial control trial; then enable *adaptive recovery only* for a
test. If it does not work, disable adaptive recovery and test *reload on
resume* separately. Compare identical videos and switches to TV/Moonlight/DeX.
The original application is the rollback baseline.

See [German test instructions](docs/TESTANLEITUNG_DE.md).

### Intentionally excluded from this temporary variant

This module **does not ship a TizenTube DIAL background service**.
Accordingly, the module's homepage is `https://youtube.com/tv` without the
original DIAL URL parameter; casting / external YouTube-app launch is **out of
scope** for this trial. A full-featured release would need a separate test of
DIAL and native application lifecycle. It does **not** contain the separately
developed TizenBrew backend/UI patches; those are not installed by adding a
TizenTube module.

## Build and corresponding source

The corresponding modified JavaScript source is in `mods/`, with the
prebuilt `dist/userScript.js` for TizenBrew module loading. The upstream
`service/` and `standalone/` source is retained for attribution/completeness,
but the standalone app and DIAL background service are **not part of this
test module**.

To rebuild, use the build instructions and dependency declarations in
`mods/package.json` with a suitable Node.js installation, then run
`npm run build` in `mods/`. Upstream's dependencies are intentionally not
mass-upgraded for legacy Tizen compatibility. Exact prebuilt artifact checksum:

`dist/userScript.js` SHA-256:
`6e09f4f909dcb1ce0c80c65a0698c45aba6799dd0a13d9c86cd7eeb293626dc7`.

Local tests: `node --test mods/tests/*.test.js`.
The related TizenTube DIAL tests are `node --test service/tests/*.test.cjs`.

## Origin, modifications and AI assistance

This project derives from
[reisxd/TizenTube](https://github.com/reisxd/TizenTube)
(source baseline `f99945a` in the local engineering checkout). It retains
the original GPL-3.0-only license and copyright notices. See
[CHANGELOG.md](CHANGELOG.md) and [NOTICE.md](NOTICE.md) for the changes,
attribution and limitations.

Changes were developed with assistance from OpenAI's ChatGPT and reviewed
through local code inspection, automated tests and builds. AI assistance
does **not** certify safety, compatibility, performance or quality.
No claim of official approval is made.

## License and warranty

Licensed under the **GNU General Public License v3.0 only**, consistent with
the original TizenTube. See [LICENSE](LICENSE). The program is provided
**AS IS**, **without warranty** to the extent permitted by applicable law,
as described in GPLv3 §§15–17. There may be bugs, regressions and data loss;
you use this experimental version at your own risk. These notices do not
exclude mandatory statutory rights and are not individual legal advice.

**No private Samsung signing key, device certificate, credentials or personal
configuration is published in this repository.**
