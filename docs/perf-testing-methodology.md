# Gooey-Border Perf Testing — Approach, Tools & Per-Device Methodology

How the gooey-border shader work is benchmarked on real devices: the A/B config
approach, the capture/analysis tooling, and the (different) iOS vs Android
procedures. Written from the field-texture POC runs (2026-06-26) but the workflow
generalizes to any shader-cost change on this demo.

Related: per-run results live in `temp/testing/reports/`; the executable plan is
`temp/testing/FIELD-TEXTURE-TEST-PLAN.md`; tool docs are in `temp/testing/README.md`
(iOS analyzer) and `temp/testing/perfetto/` (Android). Background on the cliff:
`docs/handoffs/gooey-border-fragment-fill-handoff-2026-06-25.md`.

---

## 1. Test approach

**Goal.** Decide between rendering strategies (e.g. brute-force metaballs vs the
two-pass field-texture path) by measuring frame cadence under a controlled,
repeatable animation load on a real 120Hz device in a **Release** build.

**A/B config matrix.** Each "config" is a single flag change in
`src/components/border-shader/constants.ts`, rebuilt and captured independently:

| lever | constant | what it isolates |
|---|---|---|
| render path | `USE_FIELD_TEXTURE` | brute-force vs field-texture |
| brute-force stress | `SUPERSAMPLE_SCALE` | fragment fill = `balls × (PixelRatio·SS)²` |
| field density | `FIELD_SCALE` | ball-loop raster cost (and edge sharpness) |

**Controls held fixed.** 128 balls (BORDER 64 + MOVING 64 — do not change, it moves
`MAX_META_BALLS` and drags in marshalling confounds), light mode (the field path is
light-only for now), Release build, ~15–20s of active animation per capture with
border↔blob transitions exercised mid-capture.

**Forcing vs finding a cliff.** The light shader is ~⅓ the per-pixel cost of the
shimmer shader, so at 128 balls it may not naturally cliff. Two strategies:
- **Android** held the 60Hz budget at `SS=1`, so a cliff was *forced* with
  `SUPERSAMPLE_SCALE=1.5` (≈20× fill) to get a janky brute-force reference.
- **iOS (ProMotion)** cliffs *naturally* at `SS=1` — see §4 — so no forcing needed.

**Primary metrics** (mirror the diagnosis checklist): `miss_60 %` (fraction of
frames over the 16.67ms / 60Hz budget) and `p90 ms`; `fps_eff` and `miss_120 %`
secondary. The frame-interval **histogram** is the most diagnostic single view — a
spike in the 16–18ms band is the ProMotion/refresh-rate fallback signature.

---

## 2. Tools

| concern | Android | iOS |
|---|---|---|
| build/install | `expo run:android --variant release` | `expo run:ios --configuration Release --device <udid>` |
| device control | `adb` (launch, swipe, screenshot, refresh pin) | manual (physical taps) + `devicectl` |
| trace capture | `perfetto` via `temp/testing/perfetto/capture.sh` | `xctrace record` + custom `Skia_Shader_GPU_Template` |
| analyzer | `temp/testing/perfetto/analyze.py` (needs `pandas`+`perfetto`) | `temp/testing/analyze-trace.py` (stdlib only) |
| in-app readout | `FpsOverlay` (`SHOW_FPS_OVERLAY=true`) — same metrics, for eyeballing between captures |

Both analyzers emit the **same metric vocabulary** (fps_eff, p50/p90/p99, miss_60,
miss_120, histogram) so Android (Perfetto) and iOS (Instruments) numbers are
directly comparable. The on-screen `FpsOverlay` mirrors them too — use it to confirm
the scenario is in the expected regime before spending a formal capture.

**Environment notes.**
- `ANDROID_HOME` is exported inline per build (the non-interactive shell doesn't
  source `~/.zshrc`); no `local.properties` is written.
- The iOS analyzer is stdlib-only. The Android analyzer needs `pandas` + `perfetto`
  (installed into the `mamba` base env); it uses a bundled `tp_shell` so trace
  processing never reaches the network.

---

## 3. Android methodology (Galaxy S24, automated)

Fully scriptable end-to-end — no human in the loop.

1. **Flag** the config in `constants.ts`; `bunx tsc --noEmit` sanity (the
   `temp/scratch-*` TS errors are pre-existing and unrelated).
2. **Build + install:** `ANDROID_SERIAL=<serial> bunx expo run:android --variant release`.
   First build is a full native compile (~1–2 min); subsequent JS-only flag changes
   re-bundle and reinstall in ~20s (native cached).
3. **Pin refresh to 120Hz** (capture.sh does this): `settings put system
   min/peak_refresh_rate 120` — without it the S24 drops adaptively to 60/80Hz and
   masks the cliff. Force light mode: `cmd uimode night no`.
4. **Launch** via deep link: `am start -a android.intent.action.VIEW -d
   "quattro4maggi://gooey-border" com.meltohamy.quattro4maggi`.
5. **Capture** 15s: `./temp/testing/perfetto/capture.sh temp/field-c{N}-{lever}.pftrace`,
   with `adb shell input swipe` calls scheduled mid-capture to toggle border↔blob.
6. **Screenshot** for the quality axis: `adb exec-out screencap -p > …png`.
7. **Analyze:** `python3 temp/testing/perfetto/analyze.py temp/field-c*.pftrace`.

Notes: Argent's screenshot/gesture backend targets simulators, not physical Android
— use raw `adb` for screenshots and swipes. Watch for **thermal drift** across a long
session (fps_eff trends down); capture each config fresh after its own build, and a
cooldown tightens absolute numbers.

## 4. iOS methodology (iPhone 16 Pro, ProMotion — semi-manual)

Build + trace are automated; **navigation and swiping are done by hand** on the
device (Argent gestures don't drive a physical iPhone).

1. **Prereqs:** device unlocked, trusting the Mac, **Developer Mode on**, connected
   via USB (wireless install of a Release build is slow/flaky). Signing is Automatic
   (team set in the Xcode project). Note: `xctrace list devices` cosmetically shows
   iOS 17+/26 devices as "Offline" while they're usable — `devicectl list devices`
   reports the true "available (paired)" state.
2. **Build + install:** `bunx expo run:ios --configuration Release --device <udid>`.
   First build includes pods + signing (slow); later flag changes are fast.
3. **Hand-off:** user opens the app, navigates to Gooey Border (light mode), holds
   there, signals ready.
4. **Capture** 20s by **attaching** to the running app (clean steady-state, no
   cold-start frames):
   ```
   xcrun xctrace record --template "Skia_Shader_GPU_Template" \
     --device <udid> --attach quattro4maggi --time-limit 20s \
     --output temp/field-c{N}-{lever}-ios.trace
   ```
   User does several border↔blob swipes during the 20s.
5. **Analyze:** `./temp/testing/analyze-trace.py temp/field-c*-ios.trace`.

**ProMotion is the key difference.** The panel only runs stable refresh divisors
(120 / 60 / 40 / 30Hz). The moment a frame misses the 8.33ms (120Hz) budget, iOS
drops the **whole panel** to 60Hz, so that frame lands at 16.67ms. A modest fill
overshoot therefore reads as a **2× framerate collapse**, not a gentle degradation
— which is why a shader that only had mild 120Hz *pressure* on Android (held 60Hz
fine) fully cliffs on iOS. Practical consequences seen in the field-texture runs:
- brute-force at `SS=1` cliffs naturally (67 fps / 46% miss_60) — no SS lever needed;
- there is a **hard field-density ceiling** (`FIELD_SCALE` ~0.4 → 120fps, ~0.75 →
  re-cliff at 90fps / 26% miss_60). Edge sharpness can't be bought past that ceiling
  with more field resolution without re-introducing jank.

**Known limitation:** the `Skia_Shader_GPU_Template` GPU-counter profile is "not
supported on target device," so no Shader Timeline / per-shader GPU duration. Frame
cadence, Metal encoder submits, and hangs all record fine, and the analyzer doesn't
consume GPU counters — the cadence numbers are unaffected.

---

## 5. Reading the output

`analyze.py` / `analyze-trace.py` per trace report: present count, span, `fps_eff`,
`mean/p50/p90/p99/max` frame delta, `miss_120 %`, `miss_60 %`, hitch counts, and a
7-bucket ASCII histogram. Multi-trace mode appends a side-by-side comparison.

Decision reading (from the test plan):

| outcome | reading |
|---|---|
| **Win** | brute-force janky; field ≤~0.3% miss_60 at equal sharpness |
| **Overhead too high** | field not better than brute-force at equal sharpness |
| **Quality floor** | field edge visibly grainy and/or no perf gain from denser field |

Always save the comparison dump next to the traces
(`temp/field-results-{platform}.txt`) and a short write-up in
`temp/testing/reports/`.

---

## 6. Reproduce from cold

```bash
# Android (S24, automated)
export ANDROID_HOME=$HOME/Library/Android/sdk
# edit constants.ts → set USE_FIELD_TEXTURE / SUPERSAMPLE_SCALE / FIELD_SCALE
ANDROID_SERIAL=<serial> bunx expo run:android --variant release
adb shell am start -a android.intent.action.VIEW -d "quattro4maggi://gooey-border" com.meltohamy.quattro4maggi
./temp/testing/perfetto/capture.sh temp/field-c{N}-{lever}.pftrace   # swipe mid-capture
python3 temp/testing/perfetto/analyze.py temp/field-c*.pftrace

# iOS (iPhone 16 Pro, semi-manual)
# edit constants.ts as above
bunx expo run:ios --configuration Release --device <udid>
# user: open app → Gooey Border (light) → ready
xcrun xctrace record --template "Skia_Shader_GPU_Template" \
  --device <udid> --attach quattro4maggi --time-limit 20s \
  --output temp/field-c{N}-{lever}-ios.trace                          # swipe during the 20s
./temp/testing/analyze-trace.py temp/field-c*-ios.trace
```

After a run, restore `constants.ts` to baseline (`USE_FIELD_TEXTURE=false`,
`SUPERSAMPLE_SCALE=1`, `FIELD_SCALE=0.4`).
</content>
