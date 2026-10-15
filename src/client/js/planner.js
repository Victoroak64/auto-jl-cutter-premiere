// ============================================================
// Auto J/L Cutter — planner (pure logic, no Premiere API).
//
// Takes what the host collected from the timeline (integer frames only,
// armadilha 3.3) plus the editor's settings, and returns an explicit plan:
// which ranges to extract (Shorten), which clips change track, which audio
// edges get extended and by how much, where the crossfades go, and every
// warning the editor must see. The host just executes and verifies it.
//
// Runs in the CEP panel (window.JLPlanner) and in Node for tests.
// ============================================================
(function (root) {
	"use strict";

	function msToFrames(ms, fps) { return Math.round((Number(ms) || 0) * fps / 1000); }

	// cut type for the v-th valid cut
	function cutType(mode, v, rhythm) {
		if (mode === "J") return "J";
		if (mode === "L") return "L";
		if (mode === "mixed") {
			var r = Math.max(1, Math.floor(rhythm) || 1);
			return Math.floor(v / r) % 2 === 0 ? "J" : "L";
		}
		return "none";
	}

	function plural(n, um, varios) { return n + " " + (n === 1 ? um : varios); }

	function plan(data, opts) {
		var fps = data.fps;
		var N = opts.unit === "ms" ? msToFrames(opts.overlap, fps) : Math.round(Number(opts.overlap) || 0);
		if (opts.mode === "interleave") N = 0;
		var fade = opts.crossfade ? Math.max(0, Math.round(Number(opts.crossfadeFrames) || 0)) : 0;
		// J/L always moves the WHOLE clip (sync kept, sequence shorter) — decided with Victor, out/2026.
		// The removed frames are the real start (J) or end (L) of the speech, so the
		// audio extension brings speech back, not the breath that was cut out.
		var shorten = N > 0;

		var out = {
			ok: true, errors: [], warnings: [], notes: [],
			frames: N, fps: fps, mode: opts.mode, timing: shorten ? "shorten" : "keep",
			extracts: [], moves: [], edges: [], fades: [],
			cuts: [], summary: {}
		};

		// ---- 1. scope ----
		var all = data.clips.slice().sort(function (a, b) { return a.start - b.start; });
		var scope = [];
		for (var i = 0; i < all.length; i++) {
			if (opts.scope === "selection" ? all[i].selected : true) scope.push(all[i]);
		}
		if (opts.scope === "selection" && scope.length === 0) {
			out.ok = false;
			out.errors.push("Nothing is selected on " + data.srcLabel + ". Select the clips you want, or switch Scope to Whole timeline.");
			return out;
		}
		if (N < 0) { out.ok = false; out.errors.push("Overlap can't be negative."); return out; }

		// ---- 2. cuts (adjacent; whole timeline also needs the same file) ----
		var valid = [], v = 0;
		var skippedOtherFile = 0, skippedGap = 0;
		for (i = 1; i < scope.length; i++) {
			var a = scope[i - 1], b = scope[i];
			var adjacent = a.end === b.start;
			var sameFile = a.media && a.media === b.media;
			if (!adjacent) { skippedGap++; continue; }
			if (opts.scope !== "selection" && !sameFile) { skippedOtherFile++; continue; }
			valid.push({ index: valid.length + 1, at: b.start, o: i - 1, n: i, type: cutType(opts.mode, v, opts.rhythm) });
			v++;
		}
		if (valid.length === 0) {
			out.ok = false;
			out.errors.push(scope.length < 2
				? "No cuts found. Cut your clip first — the plugin works on the cuts between clips."
				: "No cuts found between clips of the same file. Cut your clip first, or use Scope: Selection to include cuts between different files.");
			return out;
		}
		if (skippedOtherFile) out.notes.push(plural(skippedOtherFile, "junction between different files was", "junctions between different files were") + " left alone (Whole timeline only treats cuts of the same file).");
		if (skippedGap) out.notes.push(plural(skippedGap, "gap between clips was", "gaps between clips were") + " ignored (not a cut).");
		if (opts.mode === "mixed") {
			var r = Math.max(1, Math.floor(opts.rhythm) || 1);
			if (r >= valid.length) out.warnings.push("Rhythm " + r + " but only " + plural(valid.length, "cut", "cuts") + ": only J-cuts will be applied.");
		}

		// working copy of every clip in scope (frames), track 0 = source, 1 = alternate
		var c = [];
		for (i = 0; i < scope.length; i++) {
			c.push({ k: i, start: scope[i].start, end: scope[i].end, inP: scope[i].inPoint, outP: scope[i].outPoint, track: i % 2, origStart: scope[i].start, cutHead: 0, cutTail: 0 });
		}

		// ---- 3. Shorten: plan the extracts and the new layout ----
		if (shorten) {
			for (i = 0; i < valid.length; i++) {
				var cut = valid[i], o = c[cut.o], n = c[cut.n];
				if (cut.type === "none") continue;
				// J trims the HEAD of the incoming clip; L trims the TAIL of the outgoing one
				var victim = cut.type === "J" ? n : o;
				var resta = (victim.end - victim.start) - victim.cutHead - victim.cutTail - N;
				if (resta < 1) {
					cut.skipped = "clip too short to remove " + N + " frames";
					continue;
				}
				if (cut.type === "J") { victim.cutHead += N; cut.extract = [cut.at, cut.at + N]; }
				else { victim.cutTail += N; cut.extract = [cut.at - N, cut.at]; }
			}
			// apply the removals in original coordinates, then shift everything after
			var removidos = [];
			for (i = 0; i < valid.length; i++) if (valid[i].extract) removidos.push(valid[i].extract);
			removidos.sort(function (x, y) { return x[0] - y[0]; });
			for (i = 0; i < c.length; i++) {
				var antes = 0;
				for (var j = 0; j < removidos.length; j++) {
					if (removidos[j][1] <= c[i].origStart) antes += removidos[j][1] - removidos[j][0];
				}
				var len = (c[i].end - c[i].start) - c[i].cutHead - c[i].cutTail;
				c[i].inP += c[i].cutHead;
				c[i].outP -= c[i].cutTail;
				c[i].start = c[i].origStart - antes;
				c[i].end = c[i].start + len;
			}
			// the host runs the extracts from the LAST to the first so coordinates stay valid
			removidos.sort(function (x, y) { return y[0] - x[0]; });
			out.extracts = removidos;
			for (i = 0; i < valid.length; i++) valid[i].at = c[valid[i].n].start;
		}

		// ---- 4. track moves (every other clip; the first stays on the source) ----
		for (i = 1; i < c.length; i += 2) out.moves.push({ k: i, start: c[i].start, end: c[i].end });

		// ---- 5. edge extensions, clamped by media and by neighbours on the same track ----
		var ext = [];
		for (i = 0; i < c.length; i++) ext.push({ head: 0, tail: 0 });
		for (i = 0; i < valid.length; i++) {
			var ct = valid[i];
			if (ct.type === "none" || ct.skipped || N === 0) continue;
			if (ct.type === "J") {
				var nn = c[ct.n];
				ext[ct.n].head = Math.min(N, nn.inP); // media before the in point
				if (ext[ct.n].head < N) ct.reduced = "only " + ext[ct.n].head + " frames of media before this clip";
			} else {
				ext[ct.o].tail = N; // media after the out point: the host clamps and reports
			}
		}
		// neighbours on the same track: clip i and clip i+2 share the gap of clip i+1
		for (i = 0; i + 2 < c.length; i++) {
			var gap = c[i + 2].start - c[i].end;
			var pedidoT = ext[i].tail, pedidoH = ext[i + 2].head;
			if (pedidoT + pedidoH > gap) {
				var h = Math.min(pedidoH, Math.max(gap - Math.min(pedidoT, Math.floor(gap / 2)), 0));
				var t = Math.min(pedidoT, gap - h);
				ext[i + 2].head = h; ext[i].tail = Math.max(t, 0);
				out.notes.push("Clip " + (i + 2) + " is very short, so the overlaps around it were reduced.");
			}
		}
		// alternate track already holding clips in the way
		var altOcupados = 0;
		var ini = c[0].start - N, fim = c[c.length - 1].end + N;
		var dualMono = 0;
		for (i = 0; i < (data.altClips || []).length; i++) {
			var ac = data.altClips[i];
			if (ac.end > ini && ac.start < fim) altOcupados++;
			for (j = 0; j < scope.length; j++) {
				if (ac.start === scope[j].start && ac.end === scope[j].end && ac.media === scope[j].media) { dualMono++; break; }
			}
		}
		if (altOcupados) {
			var msg = data.altLabel + " already has " + plural(altOcupados, "clip", "clips") + " in this range. Moving audio there may overwrite them.";
			if (dualMono) msg += " It looks like your camera audio uses two tracks (" + data.srcLabel + " + " + data.altLabel + "): pick another empty track as Alternate.";
			out.warnings.push(msg);
			out.blocking = true;
		}
		if (shorten && data.otherCrossing) {
			var cruzam = 0;
			for (i = 0; i < data.otherCrossing.length; i++) {
				var oc = data.otherCrossing[i];
				for (j = 0; j < out.extracts.length; j++) {
					if (oc.start < out.extracts[j][1] && oc.end > out.extracts[j][0]) { cruzam++; break; }
				}
			}
			if (cruzam) {
				out.warnings.push(plural(cruzam, "clip on another track crosses", "clips on other tracks cross") + " the cuts and will be shortened too (J/L cuts ripple every track).");
				out.blocking = true;
			}
		}

		for (i = 0; i < c.length; i++) {
			var trk = c[i].track === 1 ? "alt" : "src";
			if (ext[i].head) out.edges.push({ k: i, track: trk, edge: "head", at: c[i].start, frames: ext[i].head });
			if (ext[i].tail) out.edges.push({ k: i, track: trk, edge: "tail", at: c[i].end, frames: ext[i].tail });
		}

		// ---- 6. crossfades: a light fade at both edges of every audio clip in scope ----
		if (fade > 0) {
			for (i = 0; i < c.length; i++) {
				var s = c[i].start - ext[i].head, e = c[i].end + ext[i].tail;
				var f = Math.min(fade, Math.floor((e - s) / 2));
				if (f > 0) out.fades.push({ k: i, track: c[i].track === 1 ? "alt" : "src", start: s, end: e, frames: f });
			}
		}

		// ---- 7. per-cut report + summary ----
		var nJ = 0, nL = 0, nRed = 0, nSkip = 0;
		for (i = 0; i < valid.length; i++) {
			var x = valid[i];
			var aplicado = x.type === "J" ? ext[x.n].head : x.type === "L" ? ext[x.o].tail : 0;
			if (x.skipped) { nSkip++; aplicado = 0; }
			else if (x.type === "J") nJ++;
			else if (x.type === "L") nL++;
			if (!x.skipped && x.type !== "none" && aplicado < N) nRed++;
			out.cuts.push({ cut: x.index, at: x.at, type: x.type, requested: x.type === "none" ? 0 : N, planned: aplicado, skipped: x.skipped || null, note: x.reduced || null });
		}
		out.summary = {
			clipsInScope: c.length,
			cuts: valid.length,
			moved: out.moves.length,
			alreadyCorrect: c.length - out.moves.length,
			jCuts: nJ, lCuts: nL,
			withLessOverlap: nRed, skipped: nSkip,
			crossfades: out.fades.length,
			shortensBy: shorten ? out.extracts.length * N : 0
		};
		return out;
	}

	var api = { plan: plan, msToFrames: msToFrames, cutType: cutType };
	// both: in CEP with --enable-nodejs `module` can exist inside the panel too
	if (typeof module !== "undefined" && module.exports) module.exports = api;
	if (typeof window !== "undefined") window.JLPlanner = api;
	else if (root) root.JLPlanner = api;
})(this);
