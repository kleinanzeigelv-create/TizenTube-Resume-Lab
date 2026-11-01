# Changelog — experimental fork

## 1.15.2-resume-test.5 (pre-release; hardware acceptance pending)

Source derived from [reisxd/TizenTube](https://github.com/reisxd/TizenTube),
local baseline `f99945a`, with additional changes:

- Opt-in page reload on return from app background.
- Opt-in adaptive playback recovery: check previous playback state, attempt
  resume and reload only after a bounded stall check.
- Cancel pending recovery for user pause, video element/source changes,
  source `loadstart`, and disabling the experimental option.
- Bound repetitive startup checks for missing YouTube-private objects.
- Guard fragile YouTube-private player patches and parser assumptions.
- Preserve valid settings, tolerate invalid/non-object JSON settings, do not
  erase existing raw invalid data until explicitly changed.
- Harden DIAL service source for unknown app IDs, absent launch arguments and
  idle context polling (service is **not included** in this trial module).
- Include automated regression tests.

The separate engineering workspace also contains TizenBrew service/UI fixes,
but those **are not included** in this repository or in this module's
prebuilt script. Do not mistake the TizenTube test module for a fully patched
TizenBrew app.

All changes are experimental; no physical-TV acceptance has been completed.
