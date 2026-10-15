// ============================================================
//  Auto J/L Cutter — host (ExtendScript, ES3)
//  Collects the timeline, executes the plan built by client/js/planner.js
//  and VERIFIES every operation with the official DOM (armadilha 3.9).
//  Every public function returns JSON.stringify({ ok, ... }).
//  Mechanisms validated in the spike (out/2026, Premiere 26.5):
//    move track  -> qe moveToTrack(0, delta, "0", false)
//    J (head)    -> inPoint, then start      (video stays put)
//    L (tail)    -> outPoint, then end
//    crossfade   -> qe addTransition(tr, atStart, "frames", "0", 0)
//    shorten     -> qe setInPoint/setOutPoint (timecode) + extract(), nothing locked
// ============================================================

var TICKS = 254016000000;

function _json(o) { return JSON.stringify(o); }
function _parse(s) { try { return JSON.parse(s); } catch (e) { return {}; } }
function _run(fn) {
	try { return _json(fn()); }
	catch (e) { return _json({ ok: false, erro: e.toString(), line: e.line }); }
}

function _seq() { return app.project ? app.project.activeSequence : null; }
function _fps(seq) { return TICKS / Number(seq.getSettings().videoFrameRate.ticks); }

function _sec(t) {
	if (t === null || t === undefined) return null;
	if (typeof t === "number") return t;
	if (typeof t.seconds === "number") return t.seconds;
	if (typeof t.ticks !== "undefined") return Number(t.ticks) / TICKS;
	return Number(t);
}
function _f(t, fps) { return Math.round(_sec(t) * fps); }
// armadilha 3.18: seq.end é string de ticks
function _seqEndF(seq, fps) { return Math.round(Number(seq.end) / TICKS * fps); }

function _setF(item, prop, frame, fps) {
	var t = new Time();
	t.seconds = frame / fps;
	item[prop] = t;
}

function _pad(n) { return n < 10 ? "0" + n : String(n); }
// armadilha 3.2: frame -> timecode usa o fps nominal inteiro
function _tc(frame, fps) {
	var fi = Math.round(fps), ff = frame % fi, ts = Math.floor(frame / fi);
	return _pad(Math.floor(ts / 3600)) + ":" + _pad(Math.floor(ts / 60) % 60) + ":" + _pad(ts % 60) + ":" + _pad(ff);
}

function _clips(track) {
	var out = [];
	for (var i = 0; i < track.clips.numItems; i++) out.push(track.clips[i]);
	out.sort(function (a, b) { return _sec(a.start) - _sec(b.start); });
	return out;
}
// sempre buscar de novo: objeto antigo pode responder errado depois de um trim
function _clipAt(track, frame, fps, campo) {
	var l = _clips(track);
	for (var i = 0; i < l.length; i++) if (_f(l[i][campo || "start"], fps) === frame) return l[i];
	return null;
}
function _media(c) {
	try { return String(c.projectItem.getMediaPath()) || String(c.projectItem.nodeId); }
	catch (e) { try { return String(c.projectItem.nodeId); } catch (e2) { return ""; } }
}

function _qeSec(valor, fps) {
	try {
		if (valor === null || valor === undefined) return null;
		if (typeof valor === "number") return valor;
		if (typeof valor === "object") {
			if (typeof valor.secs === "number") return valor.secs;
			if (typeof valor.seconds === "number") return valor.seconds;
			if (typeof valor.ticks !== "undefined") return Number(valor.ticks) / TICKS;
		}
		var p = String(valor).split(":");
		if (p.length === 4) return +p[0] * 3600 + +p[1] * 60 + +p[2] + (+p[3] / Math.round(fps));
		var n = Number(valor);
		return isNaN(n) ? null : n;
	} catch (e) { return null; }
}
function _qeSeq() { app.enableQE(); return qe.project.getActiveSequence(); }
function _qeItemAt(trackIdx, frame, fps) {
	var t = _qeSeq().getAudioTrackAt(trackIdx);
	for (var i = 0; i < t.numItems; i++) {
		var it = t.getItemAt(i);
		try { if (String(it.type) === "Empty") continue; } catch (e) {}
		var s = _qeSec(it.start, fps);
		if (s !== null && Math.round(s * fps) === frame) return it;
	}
	return null;
}

// ---------- status (polled by the panel every 2 s) ----------
function jl_status() {
	return _run(function () {
		var seq = _seq();
		if (!seq) return { ok: true, sequence: null };
		var sel = 0;
		try { sel = seq.getSelection().length; } catch (e) {}
		return {
			ok: true, sequence: String(seq.name), sequenceId: String(seq.sequenceID),
			fps: _fps(seq), audioTracks: seq.audioTracks.numTracks, selected: sel
		};
	});
}

// ---------- collect: everything the planner needs, in frames ----------
function jl_collect(s) {
	return _run(function () {
		var a = _parse(s), seq = _seq();
		if (!seq) throw new Error("Open a sequence to get started.");
		var fps = _fps(seq), src = Number(a.src), alt = Number(a.alt);
		if (src === alt) throw new Error("Source and Alternate must be different tracks.");
		if (src >= seq.audioTracks.numTracks || alt >= seq.audioTracks.numTracks) throw new Error("That audio track doesn't exist in this sequence.");
		function lista(track, comSelecao) {
			var l = _clips(track), out = [];
			for (var i = 0; i < l.length; i++) {
				var c = l[i], sel = false;
				if (comSelecao) { try { sel = c.isSelected(); } catch (e) {} }
				out.push({ start: _f(c.start, fps), end: _f(c.end, fps), inPoint: _f(c.inPoint, fps), outPoint: _f(c.outPoint, fps), media: _media(c), selected: sel, name: String(c.name) });
			}
			return out;
		}
		var outros = [], i, j, l;
		for (i = 1; i < seq.videoTracks.numTracks; i++) {
			l = _clips(seq.videoTracks[i]);
			for (j = 0; j < l.length; j++) outros.push({ start: _f(l[j].start, fps), end: _f(l[j].end, fps) });
		}
		for (i = 0; i < seq.audioTracks.numTracks; i++) {
			if (i === src || i === alt) continue;
			l = _clips(seq.audioTracks[i]);
			for (j = 0; j < l.length; j++) outros.push({ start: _f(l[j].start, fps), end: _f(l[j].end, fps) });
		}
		return {
			ok: true, sequence: String(seq.name), sequenceId: String(seq.sequenceID), fps: fps,
			srcLabel: "A" + (src + 1), altLabel: "A" + (alt + 1),
			clips: lista(seq.audioTracks[src], true),
			altClips: lista(seq.audioTracks[alt], false),
			otherCrossing: outros,
			durationFrames: _seqEndF(seq, fps)
		};
	});
}

// ---------- backup (receita da base, Parte 4) ----------
function _backup(seq) {
	var idOriginal = seq.sequenceID, nome = seq.name, antes = {}, i;
	for (i = 0; i < app.project.sequences.numSequences; i++) antes[app.project.sequences[i].sequenceID] = true;
	seq.clone();
	var nova = null;
	for (i = 0; i < app.project.sequences.numSequences; i++) {
		if (!antes[app.project.sequences[i].sequenceID]) { nova = app.project.sequences[i]; break; }
	}
	if (!nova) throw new Error("Couldn't create the backup sequence. Nothing was changed.");
	var d = new Date();
	try { nova.name = nome + " - backup " + _pad(d.getDate()) + "-" + _pad(d.getMonth() + 1) + " " + _pad(d.getHours()) + "h" + _pad(d.getMinutes()); } catch (e) {}
	// CRÍTICO: o clone pode virar a ativa — voltar para a original ou cancelar
	if (app.project.activeSequence.sequenceID !== idOriginal) {
		try { app.project.openSequence(idOriginal); } catch (e2) {}
	}
	if (app.project.activeSequence.sequenceID !== idOriginal) throw new Error("The backup was created but Premiere didn't switch back to your sequence. Nothing was changed — open it again and retry.");
	return String(nova.name);
}

// ---------- transitions (nome localizado; armadilhas 3.4, 3.5, 3.17) ----------
var NOMES_FADE = {
	en: ["Constant Power", "Constant Gain", "Exponential Fade"],
	pt: ["Potência constante", "Ganho constante", "Fade exponencial", "Desvanecimento exponencial"],
	es: ["Potencia constante", "Ganancia constante", "Fundido exponencial"],
	fr: ["Puissance constante", "Gain constant", "Fondu exponentiel"],
	de: ["Konstante Leistung", "Konstante Verstärkung", "Exponentielles Ausblenden"],
	it: ["Potenza costante", "Guadagno costante", "Dissolvenza esponenziale"],
	nl: ["Constant vermogen", "Constante versterking"],
	ru: ["Постоянная мощность", "Постоянное усиление"],
	ja: ["コンスタントパワー", "コンスタントゲイン"],
	ko: ["일정한 파워", "일정한 게인"],
	zh: ["恒定功率", "恒定增益"],
	pl: ["Stała moc", "Stałe wzmocnienie"],
	tr: ["Sabit Güç", "Sabit Kazanç"],
	sv: ["Konstant effekt", "Konstant förstärkning"]
};
function _transicao() {
	app.enableQE();
	var lista = [], vistos = {}, k, i;
	var idioma = String($.locale || "").substring(0, 2).toLowerCase();
	function add(l) { if (!l) return; for (var x = 0; x < l.length; x++) if (!vistos[l[x]]) { vistos[l[x]] = true; lista.push(l[x]); } }
	add(NOMES_FADE[idioma]); add(NOMES_FADE.en); add(NOMES_FADE.pt);
	for (k in NOMES_FADE) add(NOMES_FADE[k]);
	for (i = 0; i < lista.length; i++) {
		try {
			var t = qe.project.getAudioTransitionByName(lista[i]);
			var nome = t ? String(t.name) : "";
			if (nome && nome !== "undefined") return { obj: t, nome: lista[i] };
		} catch (e) {}
	}
	return null;
}
function _nTrans(track) { try { return track.transitions.numItems; } catch (e) { return -1; } }
// "start-end" de cada transição da faixa: identifica as que o plugin criou
function _transKeys(track, fps) {
	var out = [];
	try {
		var l = track.transitions;
		for (var i = 0; i < l.numItems; i++) out.push(_f(l[i].start, fps) + "-" + _f(l[i].end, fps));
	} catch (e) {}
	return out;
}
function _novas(antes, depois) {
	var visto = {}, out = [], i;
	for (i = 0; i < antes.length; i++) visto[antes[i]] = (visto[antes[i]] || 0) + 1;
	for (i = 0; i < depois.length; i++) {
		if (visto[depois[i]]) visto[depois[i]]--;
		else out.push(depois[i]);
	}
	return out;
}
// clipe que contém um frame (a extensão pode ter saído menor que o plano)
function _clipContaining(track, frame, fps) {
	var l = _clips(track);
	for (var i = 0; i < l.length; i++) if (_f(l[i].start, fps) <= frame && _f(l[i].end, fps) > frame) return l[i];
	return null;
}

// ---------- apply ----------
function jl_apply(s) {
	return _run(function () {
		var p = _parse(s), seq = _seq();
		if (!seq) throw new Error("Open a sequence to get started.");
		if (p.sequenceId && String(seq.sequenceID) !== p.sequenceId) throw new Error("The active sequence changed. Run Analyze again.");
		var fps = _fps(seq), src = Number(p.src), alt = Number(p.alt), delta = alt - src;
		var T = { src: seq.audioTracks[src], alt: seq.audioTracks[alt] };
		var idx = { src: src, alt: alt };
		var r = { ok: true, problems: [], extracts: 0, moved: 0, extended: [], fades: 0, backup: null, undo: null };
		var i;

		if (p.backup) r.backup = _backup(seq);

		// 1) Shorten: extracts from the last to the first, verified one by one
		if (p.extracts && p.extracts.length) {
			var q = _qeSeq();
			for (i = 0; i < p.extracts.length; i++) {
				var ex = p.extracts[i], antes = _seqEndF(seq, fps);
				q.setInPoint(_tc(ex[0], fps));
				q.setOutPoint(_tc(ex[1], fps));
				q.extract();
				var tirou = antes - _seqEndF(seq, fps);
				if (tirou !== ex[1] - ex[0]) r.problems.push("Shorten at " + _tc(ex[0], fps) + ": removed " + tirou + " frames instead of " + (ex[1] - ex[0]) + ".");
				else r.extracts++;
			}
			try { q.setInPoint("00:00:00:00"); q.setOutPoint("00:00:00:00"); } catch (e0) {}
		}

		// 2) moves to the alternate track
		var tcs = ["0", "00:00:00:00", ""];
		for (i = 0; i < p.moves.length; i++) {
			var m = p.moves[i], moveu = false;
			var qi = _qeItemAt(src, m.start, fps);
			if (!qi) { r.problems.push("Clip at " + _tc(m.start, fps) + " not found on " + p.srcLabel + "."); continue; }
			for (var v = 0; v < tcs.length && !moveu; v++) {
				try {
					qi.moveToTrack(0, delta, tcs[v], false);
					moveu = !!_clipAt(T.alt, m.start, fps) && !_clipAt(T.src, m.start, fps);
				} catch (e1) {}
			}
			if (moveu) r.moved++;
			else r.problems.push("Couldn't move the clip at " + _tc(m.start, fps) + " to " + p.altLabel + ".");
		}

		// 3) edge extensions (J = head, L = tail), each one re-read and verified
		var undo = [];
		for (i = 0; i < p.edges.length; i++) {
			var x = p.edges[i], track = T[x.track];
			var c = x.edge === "head" ? _clipAt(track, x.at, fps, "start") : _clipAt(track, x.at, fps, "end");
			if (!c) { r.problems.push("Clip for the " + (x.edge === "head" ? "J" : "L") + "-cut at " + _tc(x.at, fps) + " not found."); continue; }
			var st = _f(c.start, fps), en = _f(c.end, fps), ip = _f(c.inPoint, fps), op = _f(c.outPoint, fps);
			var feito = 0;
			for (var n = x.frames; n > 0 && !feito; n--) {
				try {
					if (x.edge === "head") {
						_setF(c, "inPoint", ip - n, fps); _setF(c, "start", st - n, fps);
						c = _clipAt(track, st - n, fps, "start");
						if (c && _f(c.inPoint, fps) === ip - n && _f(c.end, fps) === en) feito = n;
					} else {
						_setF(c, "outPoint", op + n, fps); _setF(c, "end", en + n, fps);
						c = _clipAt(track, st, fps, "start");
						if (c && _f(c.end, fps) === en + n && _f(c.outPoint, fps) === op + n) feito = n;
					}
				} catch (e2) {}
				if (!feito) c = _clipAt(track, st, fps, "start") || (x.edge === "head" ? _clipAt(track, x.at, fps, "start") : null);
				if (!c) break;
			}
			r.extended.push({ at: x.at, edge: x.edge, requested: x.frames, applied: feito });
			// ONE undo record per clip: in J + L the same clip gets a head AND a tail
			// (bug da v0.1.1: dois registros por borda se contradiziam no Undo)
			var novoIni = x.edge === "head" ? st - feito : st, novoFim = x.edge === "head" ? en : en + feito;
			var reg = null;
			for (var q2 = 0; q2 < undo.length; q2++) {
				if (undo[q2].track === x.track && undo[q2].start === st && undo[q2].end === en) { reg = undo[q2]; break; }
			}
			if (reg) { reg.start = novoIni; reg.end = novoFim; }
			else undo.push({ track: x.track, start: novoIni, end: novoFim, origStart: st, origEnd: en, origIn: ip, origOut: op });
		}

		// 4) crossfades at both edges
		var transAntes = { src: _transKeys(T.src, fps), alt: _transKeys(T.alt, fps) };
		if (p.fades && p.fades.length) {
			var tr = _transicao();
			if (!tr) r.problems.push("No audio transition matched this Premiere's language, so crossfades were skipped.");
			else {
				for (i = 0; i < p.fades.length; i++) {
					var fd = p.fades[i], trk = T[fd.track];
					var dono = _clipContaining(trk, Math.floor((fd.start + fd.end) / 2), fps);
					var qf = dono ? _qeItemAt(idx[fd.track], _f(dono.start, fps), fps) : null;
					if (!qf) { r.problems.push("Crossfade: clip at " + _tc(fd.start, fps) + " not found."); continue; }
					var bordas = [true, false];
					for (var b = 0; b < 2; b++) {
						var antesT = _nTrans(trk), ok = false;
						var vars = bordas[b] ? [0] : [0, 1];
						for (var w = 0; w < vars.length && !ok; w++) {
							try { qf.addTransition(tr.obj, bordas[b], String(fd.frames), "0", vars[w]); ok = _nTrans(trk) > antesT; } catch (e3) {}
						}
						if (ok) r.fades++;
					}
				}
				r.transition = tr.nome;
			}
		}

		// undo is only offered for Keep duration (Shorten removes frames)
		if (!p.extracts || !p.extracts.length) {
			var movidos = [];
			for (i = 0; i < p.moves.length; i++) movidos.push(p.moves[i].start);
			r.undo = {
				sequenceId: String(seq.sequenceID), src: src, alt: alt, edges: undo, moved: movidos,
				newTransitions: { src: _novas(transAntes.src, _transKeys(T.src, fps)), alt: _novas(transAntes.alt, _transKeys(T.alt, fps)) }
			};
		}
		r.durationFrames = _seqEndF(seq, fps);
		r.ok = r.problems.length === 0;
		return r;
	});
}

// ---------- undo (Keep duration only) ----------
function jl_undo(s) {
	return _run(function () {
		var u = _parse(s), seq = _seq();
		if (!seq || String(seq.sequenceID) !== u.sequenceId) throw new Error("Open the sequence this was applied to, then Undo.");
		var fps = _fps(seq), T = { src: seq.audioTracks[u.src], alt: seq.audioTracks[u.alt] };
		var r = { ok: true, problems: [], restored: 0, movedBack: 0, fadesLeft: 0 };
		var i;
		// check the timeline wasn't edited since Apply
		if (!u.force) {
			var mudou = 0;
			for (i = 0; i < u.edges.length; i++) {
				var e = u.edges[i], c = _clipAt(T[e.track], e.start, fps, "start");
				if (!c || _f(c.end, fps) !== e.end) mudou++;
			}
			if (mudou) return { ok: false, changed: mudou, erro: "This timeline was edited after Apply (" + mudou + " clips don't match). Undo could mess up your edits — use Cmd/Ctrl+Z, or click Undo again to force it." };
		}
		// 1) remove only the crossfades this plugin created (the editor's own stay)
		var nt = u.newTransitions || {};
		for (var tk in T) {
			var nossas = {}, alvo = nt[tk] || [], j;
			for (j = 0; j < alvo.length; j++) nossas[alvo[j]] = (nossas[alvo[j]] || 0) + 1;
			var lista = T[tk].transitions;
			for (i = lista.numItems - 1; i >= 0; i--) {
				var chave = _f(lista[i].start, fps) + "-" + _f(lista[i].end, fps);
				if (!nossas[chave]) continue;
				try { lista[i].remove(); nossas[chave]--; } catch (e1) {}
			}
			for (var ch in nossas) r.fadesLeft += nossas[ch];
		}
		if (r.fadesLeft) r.problems.push(r.fadesLeft + " crossfades couldn't be removed automatically — delete them by hand.");
		// 2) restore the trims
		// one record per clip: shrink the head back (if it grew), then the tail
		for (i = 0; i < u.edges.length; i++) {
			var x = u.edges[i];
			if (x.start === x.origStart && x.end === x.origEnd) continue;
			var cl = _clipAt(T[x.track], x.start, fps, "start");
			if (!cl) { r.problems.push("A clip at " + _tc(x.start, fps) + " wasn't found to restore."); continue; }
			try {
				if (x.start !== x.origStart) {
					_setF(cl, "start", x.origStart, fps);
					cl = _clipAt(T[x.track], x.origStart, fps, "start");
					if (cl && _f(cl.inPoint, fps) !== x.origIn) _setF(cl, "inPoint", x.origIn, fps);
				}
				cl = _clipAt(T[x.track], x.origStart, fps, "start");
				if (cl && x.end !== x.origEnd) {
					_setF(cl, "end", x.origEnd, fps);
					cl = _clipAt(T[x.track], x.origStart, fps, "start");
					if (cl && _f(cl.outPoint, fps) !== x.origOut) _setF(cl, "outPoint", x.origOut, fps);
				}
				// verificar de verdade (armadilha 3.9)
				var conf = _clipAt(T[x.track], x.origStart, fps, "start");
				if (conf && _f(conf.end, fps) === x.origEnd && _f(conf.inPoint, fps) === x.origIn && _f(conf.outPoint, fps) === x.origOut) r.restored++;
				else r.problems.push("A clip at " + _tc(x.origStart, fps) + " wasn't fully restored — check it by hand.");
			} catch (e2) { r.problems.push("Couldn't restore a clip: " + e2.toString()); }
		}
		// 3) move the clips back to the source track
		for (i = 0; i < u.moved.length; i++) {
			var qi = _qeItemAt(u.alt, u.moved[i], fps), ok = false;
			if (qi) { try { qi.moveToTrack(0, u.src - u.alt, "0", false); ok = !!_clipAt(T.src, u.moved[i], fps); } catch (e3) {} }
			if (ok) r.movedBack++; else r.problems.push("Couldn't move the clip at " + _tc(u.moved[i], fps) + " back.");
		}
		r.ok = r.problems.length === 0;
		return r;
	});
}
