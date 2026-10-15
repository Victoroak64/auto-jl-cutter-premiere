# Premiere scripting notes (Auto J/L Cutter)

Things learned while building this extension, tested on Premiere 26.5 (2026).
The QE DOM is undocumented; everything here was probed and verified.

## Moving a clip to another track
`qeTrackItem.moveToTrack(videoDelta, audioDelta, "0", false)` moves by a
**relative** number of tracks. Moving only the audio half of a linked clip
leaves the video where it was and keeps the link.

## Trimming / extending an edge without moving the clip
Set the source point first, then the timeline position:
- head: `item.inPoint = t` then `item.start = t2`
- tail: `item.outPoint = t` then `item.end = t2`

The linked video does not move. Right after a trim, `getLinkedItems()` on the
**old** object may throw; re-fetch the clip from `track.clips` before checking.

## Removing frames with ripple on every track
`qe.project.getActiveSequence()` → `setInPoint(tc)`, `setOutPoint(tc)` with
**timecode strings** (a bare number is read as a frame number), then
`extract()`. Run several ranges **from the last to the first** so earlier
coordinates stay valid. Locking a track (`qeTrack.setLock(true)`) does keep it
out of the extract, but it then drifts out of sync with everything after it.

## Sequence duration
`seq.end` is a **string of ticks**, not a `Time` object:
`Number(seq.end) / 254016000000` gives seconds.

## Language
`$.locale` reports the **OS** locale, not Premiere's interface language
(`en_US` on a Portuguese Premiere). Transition names are localized, so try
every known translation and validate the result (`getAudioTransitionByName`
returns a truthy stub for unknown names; check `String(t.name)`).

## ES3
ExtendScript rejects the **whole file** for a reserved word used as a property
name (`p.extends`, `{ class: 1 }`), and every `evalScript` then returns just
`"EvalScript error."`. Node and `acorn --ecma3` both accept it, so
`scripts/check-es3.js` exists.
