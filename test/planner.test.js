// Run: node "test/planner.test.js"   (no dependencies)
// Fixture = the real timeline from the spike v0.0.2 test (IMG_6791, 30 fps).
var assert = require("assert");
var P = require("../src/client/js/planner.js");

var M = "/Bruto/IMG_6791.MOV";
function base() {
	return {
		fps: 30, srcLabel: "A1", altLabel: "A2",
		clips: [
			{ start: 0, end: 91, inPoint: 17, outPoint: 108, media: M, selected: false },
			{ start: 91, end: 178, inPoint: 243, outPoint: 330, media: M, selected: false },
			{ start: 178, end: 248, inPoint: 372, outPoint: 442, media: M, selected: false }
		],
		altClips: [], otherCrossing: []
	};
}
function opts(o) {
	var d = { scope: "timeline", mode: "J", rhythm: 1, overlap: 4, unit: "frames", timing: "keep", crossfade: false, crossfadeFrames: 3 };
	for (var k in o) d[k] = o[k];
	return d;
}
var testes = 0;
function t(nome, fn) { fn(); testes++; console.log("ok  " + nome); }

t("no cuts → clear error, never a false success", function () {
	var d = base(); d.clips = [d.clips[0]];
	var r = P.plan(d, opts({}));
	assert.strictEqual(r.ok, false);
	assert.ok(/No cuts found/.test(r.errors[0]));
});

t("selection with nothing selected → error", function () {
	var r = P.plan(base(), opts({ scope: "selection" }));
	assert.strictEqual(r.ok, false);
	assert.ok(/Nothing is selected/.test(r.errors[0]));
});

t("interleave: only every other clip moves; first stays on source", function () {
	var r = P.plan(base(), opts({ mode: "interleave" }));
	assert.deepStrictEqual(r.moves.map(function (m) { return m.k; }), [1]);
	assert.strictEqual(r.edges.length, 0);
	assert.strictEqual(r.summary.alreadyCorrect, 2);
});

// Model decided with Victor (out/2026): J/L moves the WHOLE incoming clip,
// so speech overlaps, lips stay in sync and the sequence gets shorter.
//   J: remove the incoming clip's first N frames (video cut stays put), then
//      give its AUDIO those N frames back, before the cut → speech starts early.
//   L: remove the outgoing clip's last N frames (incoming image arrives early),
//      then give its AUDIO those N frames back → previous speech runs over.
t("J: trims the incoming head [cut, cut+N], then its audio starts N before the video", function () {
	var r = P.plan(base(), opts({ mode: "J" }));
	assert.deepStrictEqual(r.extracts, [[178, 182], [91, 95]]); // last first
	// clip 1 keeps starting at 91 (video cut stays), clip 2 moves to 174 (178-4)
	assert.deepStrictEqual(r.moves, [{ k: 1, start: 91, end: 174 }]);
	assert.deepStrictEqual(r.edges, [
		{ k: 1, track: "alt", edge: "head", at: 91, frames: 4 },
		{ k: 2, track: "src", edge: "head", at: 174, frames: 4 }
	]);
	assert.strictEqual(r.summary.jCuts, 2);
	assert.strictEqual(r.summary.shortensBy, 8);
});

t("L: trims the outgoing tail [cut-N, cut], then its audio runs N past the video", function () {
	var r = P.plan(base(), opts({ mode: "L" }));
	assert.deepStrictEqual(r.extracts, [[174, 178], [87, 91]]);
	assert.deepStrictEqual(r.moves, [{ k: 1, start: 87, end: 170 }]);
	assert.deepStrictEqual(r.edges, [
		{ k: 0, track: "src", edge: "tail", at: 87, frames: 4 },
		{ k: 1, track: "alt", edge: "tail", at: 170, frames: 4 }
	]);
	assert.strictEqual(r.summary.shortensBy, 8);
});

t("the audio gets back exactly the frames removed (speech, never the cut-out breath)", function () {
	["J", "L"].forEach(function (m) {
		var r = P.plan(base(), opts({ mode: m }));
		var removido = 0, devolvido = 0;
		r.extracts.forEach(function (e) { removido += e[1] - e[0]; });
		r.edges.forEach(function (e) { devolvido += e.frames; });
		assert.strictEqual(devolvido, removido, m);
	});
});

t("mixed rhythm 1 → J, L ; rhythm 2 → J, J", function () {
	var r1 = P.plan(base(), opts({ mode: "mixed", rhythm: 1 }));
	assert.deepStrictEqual(r1.cuts.map(function (c) { return c.type; }), ["J", "L"]);
	var r2 = P.plan(base(), opts({ mode: "mixed", rhythm: 2 }));
	assert.deepStrictEqual(r2.cuts.map(function (c) { return c.type; }), ["J", "J"]);
	assert.ok(/only J-cuts/.test(r2.warnings[0]));
});

t("cutType rhythm 2 pattern over 6 cuts", function () {
	var s = "";
	for (var v = 0; v < 6; v++) s += P.cutType("mixed", v, 2);
	assert.strictEqual(s, "JJLLJJ");
});

t("milliseconds converted with the real fps", function () {
	assert.strictEqual(P.msToFrames(208.5, 23.976), 5);
	var r = P.plan(base(), opts({ unit: "ms", overlap: 133 }));
	assert.strictEqual(r.frames, 4);
});

t("interleave never removes frames", function () {
	var r = P.plan(base(), opts({ mode: "interleave" }));
	assert.strictEqual(r.extracts.length, 0);
	assert.strictEqual(r.summary.shortensBy, 0);
});

t("whole timeline ignores junctions between different files", function () {
	var d = base(); d.clips[2].media = "/other.mov";
	var r = P.plan(d, opts({}));
	assert.strictEqual(r.summary.cuts, 1);
	assert.ok(/different files/.test(r.notes[0]));
	var s = P.plan(markAll(d), opts({ scope: "selection" }));
	assert.strictEqual(s.summary.cuts, 2);
});
function markAll(d) { d.clips.forEach(function (c) { c.selected = true; }); return d; }

t("a clip too short to lose N frames is skipped (and no audio is extended there)", function () {
	var d = base(); d.clips[1].end = 94; d.clips[2].start = 94; // incoming clip = 3 frames
	var r = P.plan(d, opts({ mode: "J" }));
	assert.strictEqual(r.summary.skipped, 1);
	assert.strictEqual(r.extracts.length, 1);
	assert.strictEqual(r.edges.length, 1);
});

t("mixed J then L on the same short clip: the second one is skipped, never overcut", function () {
	var d = base(); d.clips[1].end = 96; d.clips[2].start = 96; // middle clip = 5 frames
	var r = P.plan(d, opts({ mode: "mixed", rhythm: 1 }));
	assert.strictEqual(r.summary.jCuts, 1);
	assert.strictEqual(r.summary.skipped, 1);
});

t("alternate track busy → blocking warning; dual-mono camera audio explained", function () {
	var d = base();
	d.altClips = [{ start: 0, end: 91, media: M }];
	var r = P.plan(d, opts({}));
	assert.strictEqual(r.blocking, true);
	assert.ok(/two tracks/.test(r.warnings[0]));
});

t("shorten warns about clips on other tracks crossing the cuts", function () {
	var d = base(); d.otherCrossing = [{ start: 50, end: 120 }];
	var r = P.plan(d, opts({}));
	assert.ok(/will be shortened too/.test(r.warnings[0]));
});

t("crossfade at both edges, clamped to half the clip", function () {
	var r = P.plan(base(), opts({ mode: "interleave", crossfade: true, crossfadeFrames: 3 }));
	assert.strictEqual(r.fades.length, 3);
	var d = base(); d.clips[0].end = 4; d.clips[1].start = 4;
	var r2 = P.plan(d, opts({ mode: "interleave", crossfade: true, crossfadeFrames: 3 }));
	assert.strictEqual(r2.fades[0].frames, 2);
});

t("neighbours on the same track never collide (short middle clip)", function () {
	var d = base(); d.clips[1].end = 96; d.clips[2].start = 96; // middle clip = 5 frames
	var r = P.plan(d, opts({ mode: "mixed", rhythm: 1, overlap: 4 })); // L at cut 2 needs the gap? (J then L)
	var tail0 = 0, head2 = 0;
	r.edges.forEach(function (e) { if (e.k === 0 && e.edge === "tail") tail0 = e.frames; if (e.k === 2 && e.edge === "head") head2 = e.frames; });
	assert.ok(tail0 + head2 <= 5);
});

console.log("\n" + testes + " tests passed");
