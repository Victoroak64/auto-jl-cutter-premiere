# Auto J/L Cutter for Premiere Pro

A CEP extension that turns every cut in your talking-head footage into
**J-cuts and L-cuts** at once. Audio clips alternate between two tracks, the
lines of speech overlap by as many frames as you choose, and **lips stay in
sync**. What you'd do clip by clip with the Rolling Edit tool becomes one click.

> The panel UI is in **English**. The step-by-step install guides ship in
> Portuguese ([`docs/COMECE-AQUI.html`](docs/COMECE-AQUI.html)) and English
> ([`docs/START-HERE.html`](docs/START-HERE.html)), and are included in every
> release zip.

---

## What it does

```
J-cut: you hear the next clip before you see it
VIDEO  [====== clip 1 ======][===== clip 2 =====]   ← the video cut stays put
A1     [====== line 1 ======]
A2                     [####===== line 2 =====]   ← line 2 starts under line 1

L-cut: the previous clip keeps talking over the new image
VIDEO  [===== clip 1 =====][====== clip 2 ======]   ← the new image arrives early
A1     [====== line 1 ==####]                       ← line 1 finishes on top
A2                     [====== line 2 ======]
```

- **Modes:** Interleave only · J-cut · L-cut · J + L with a **rhythm**
  (1 = J, L, J, L… · 2 = J, J, L, L…)
- **Scope:** whole timeline (cuts between pieces of the same file) or only the
  selected clips
- **Source and alternate tracks** of your choice
- **Overlap** in frames or milliseconds (converted with the real frame rate)
- Optional **crossfade** at the edges of every audio clip, and optional
  **backup sequence**
- **Analyze** previews everything without touching the timeline; **Apply**
  verifies every operation and reports what it did
- Clear warnings instead of silent failures: no cuts found, alternate track
  busy (including camera audio spread over two tracks), clips on other tracks
  crossing the cuts, pieces too short for the overlap

### Why the sequence gets shorter

Each J/L cut moves the **whole** incoming clip, video and audio together, so
the audio never drifts from the lips. For a J-cut, the incoming clip loses its
first N frames of picture (the video cut stays where it was) and its audio gets
those N frames back *before* the cut. Those frames are the actual start of the
next line, not the breath you cut out, so the two lines really overlap. The
L-cut is the mirror image. The cost of overlapping speech is N frames per cut.

## Requirements

- **Adobe Premiere Pro 2025 or 2026** (tested on 26.5)
- **macOS or Windows**
- **Any interface language**: the audio transition name is localized by
  Adobe, so the extension tries every known translation instead of trusting
  the reported locale

## Install

Grab the latest `.zip` from [Releases](../../releases/latest), extract it, then:

- **macOS**: open Terminal, type `bash ` (with a space), drag
  `INSTALL-mac.command` into the window and press Enter. Double-clicking is
  blocked by recent macOS versions for unsigned scripts.
- **Windows**: double-click `INSTALL-windows.bat`. If Defender says "Windows
  protected your PC", click **More info → Run anyway**.

Then fully quit and reopen Premiere and open
**Window → Extensions → Auto J/L Cutter**.

<details>
<summary>Manual install</summary>

Copy `src/` into your CEP extensions folder, renamed to `auto-jl-cutter`:

- macOS: `~/Library/Application Support/Adobe/CEP/extensions/`
- Windows: `%APPDATA%\Adobe\CEP\extensions\`

Then enable unsigned extensions:

```bash
# macOS
for i in 9 10 11 12 13 14 15; do defaults write com.adobe.CSXS.$i PlayerDebugMode 1; done
```
```bat
:: Windows
for %v in (9 10 11 12 13 14 15) do reg add "HKCU\Software\Adobe\CSXS.%v" /v PlayerDebugMode /t REG_SZ /d 1 /f
```
</details>

## How it works

```
client/   Chromium + Node.js — UI and all the math; never touches Premiere
  index.html          panel
  js/planner.js       pure logic: cuts, rhythm, overlap, limits, warnings
  js/main.js          orchestration: collect → plan → apply → verify
  js/matrix.js        visual details
host/main.jsx         ExtendScript (ES3) — reads the timeline, applies the plan
CSXS/manifest.xml     extension registration
```

The host collects the timeline in **integer frames**, the planner (plain
JavaScript, unit-tested in Node) turns it into an explicit plan, and the host
executes it step by step, re-reading the timeline after every operation:

| Step | API |
|---|---|
| remove N frames, rippling every track | QE `setInPoint`/`setOutPoint` (timecode) + `extract()`, last cut first |
| move an audio clip to another track | QE `moveToTrack(0, delta, "0", false)` |
| give the audio its N frames back | `trackItem.inPoint` then `start` (J) · `outPoint` then `end` (L) |
| crossfade | QE `addTransition(transition, atStart, "frames", "0", 0)` |

See [`docs/notes-en.md`](docs/notes-en.md) for the Premiere scripting gotchas
found while building it.

## Development

```bash
scripts/build.sh          # validates everything and builds dist/<package>.zip
node test/planner.test.js # planner unit tests (no dependencies)
```

`build.sh` checks JS syntax, **ES3 compliance of the ExtendScript, including
reserved words used as property names** (`p.extends` loads fine in Node and
even passes `acorn --ecma3`, but makes Premiere reject the whole file), the
manifest, panel ids vs. HTML, host functions vs. panel calls, the planner
tests, and CRLF line endings in the Windows installer.

For live debugging, keep a `.debug` file in `src/` (it's git-ignored and never
shipped) and open `http://localhost:8095` in Chrome while the panel is open.
Premiere caches extensions: **fully quit and reopen** after changing code.

## License

MIT — see [LICENSE](LICENSE).

## Independence

This is an independently written tool. It was inspired by the *idea* of J/L-cut
and audio-interleaving automation, which some commercial products implement,
but shares no code with any of them and is not affiliated with or endorsed by
any of their authors. Adobe, Premiere Pro, and related marks belong to Adobe
Inc.; this project is not affiliated with Adobe.
