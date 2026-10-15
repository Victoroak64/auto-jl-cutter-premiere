// ============================================================
// Auto J/L Cutter — panel orchestration.
// Flow: collect (host) → plan (planner.js) → show / apply (host) → verify.
// State is kept PER TIMELINE: switching timelines clears "Done" and shows
// that timeline's own Undo.
// ============================================================
(function () {
	"use strict";
	var cs = new CSInterface();
	var $ = function (id) { return document.getElementById(id); };
	var linhas = [];
	var versao = "?";

	// ---------- log & diagnostics (armadilhas 3.10, 3.12) ----------
	function log(t) {
		linhas.push(t);
		var el = $("log");
		el.textContent += t + "\n";
		el.scrollTop = el.scrollHeight;
	}

	function normalizarCaminho(p) {
		var semFile = String(p).replace(/^file:\/*/i, "/");
		if (/^\/[A-Za-z]:/.test(semFile)) semFile = semFile.substring(1);
		try { return decodeURIComponent(semFile); } catch (e) { return semFile; }
	}
	function lerVersao() {
		try {
			var fs = require("fs"), path = require("path");
			var raiz = normalizarCaminho(cs.getSystemPath("extension"));
			var m = fs.readFileSync(path.join(raiz, "CSXS", "manifest.xml"), "utf8").match(/ExtensionBundleVersion="([^"]+)"/);
			return m ? m[1] : "?";
		} catch (e) { return "?"; }
	}

	function host(fn, args) {
		return new Promise(function (resolve) {
			cs.evalScript(fn + "(" + JSON.stringify(JSON.stringify(args || {})) + ")", function (res) {
				try { resolve(JSON.parse(res)); }
				catch (e) { resolve({ ok: false, erro: "Unexpected response from Premiere: " + res }); }
			});
		});
	}

	// ---------- settings ----------
	function segValor(id) { var b = document.querySelector("#" + id + " button.on"); return b ? b.getAttribute("data-v") : null; }
	function ligarSeg(id, aoMudar) {
		var bs = document.querySelectorAll("#" + id + " button");
		Array.prototype.forEach.call(bs, function (b) {
			b.addEventListener("click", function () {
				Array.prototype.forEach.call(bs, function (x) { x.classList.remove("on"); });
				b.classList.add("on");
				aoMudar();
			});
		});
	}
	function opcoes() {
		return {
			scope: segValor("scope"), mode: segValor("mode"),
			rhythm: Number($("rhythm").value), overlap: Number($("overlap").value), unit: $("unit").value,
			crossfade: $("crossfade").checked, crossfadeFrames: Number($("fade").value),
			backup: $("backup").checked,
			src: Number($("src").value), alt: Number($("alt").value)
		};
	}

	var AJUDA_MODO = {
		interleave: "Only alternates the audio clips between the two tracks. No overlap.",
		J: "You hear the next clip before you see it: its speech starts under the previous one.",
		L: "The previous clip keeps talking over the next image.",
		mixed: "Alternates J and L cuts following the rhythm."
	};
	var ROTULO = { interleave: "Apply interleave", J: "Apply J-cuts", L: "Apply L-cuts", mixed: "Apply J + L cuts" };

	function atualizarUI() {
		var o = opcoes();
		$("mode-ajuda").textContent = AJUDA_MODO[o.mode];
		$("bloco-rhythm").hidden = o.mode !== "mixed";
		$("bloco-overlap").hidden = o.mode === "interleave";
		$("bloco-fade").hidden = !o.crossfade;
		$("scope-ajuda").textContent = o.scope === "selection"
			? "Every cut between the selected clips, even between different files."
			: "Every cut between clips of the same file on the source track.";
		armado = false;
		$("aplicar").classList.remove("atencao");
		$("aplicar").textContent = ROTULO[o.mode];
	}

	// ---------- per-timeline state ----------
	var estado = {}; // sequenceId -> { undo, undoBloqueado, forcar }
	var seqAtual = null, armado = false;

	function preencherFaixas(n) {
		n = Math.max(n || 0, 2);
		["src", "alt"].forEach(function (id, k) {
			var sel = $(id), atual = sel.value;
			if (sel.options.length === n) return;
			sel.innerHTML = "";
			for (var i = 0; i < n; i++) {
				var op = document.createElement("option");
				op.value = i; op.textContent = "A" + (i + 1);
				sel.appendChild(op);
			}
			sel.value = (atual !== "" && Number(atual) < n) ? atual : String(k);
		});
	}

	function mostrarDesfazer() {
		var e = seqAtual && estado[seqAtual];
		var btn = $("desfazer"), dica = $("dica-desfazer");
		if (e && e.undo) { btn.disabled = false; dica.textContent = e.forcar ? "This timeline changed since Apply. Click Undo again to force it." : "Undo the last Apply on this timeline."; }
		else if (e && e.undoBloqueado) { btn.disabled = true; dica.textContent = "Undo isn't available after J/L cuts yet — use Cmd/Ctrl+Z, or turn on Backup sequence before applying."; }
		else { btn.disabled = true; dica.textContent = "Nothing to undo on this timeline."; }
	}

	function vigiar() {
		if (document.hidden) return;
		host("jl_status").then(function (r) {
			if (!r.ok) return;
			var box = $("seq");
			if (!r.sequence) {
				box.classList.remove("ativa");
				$("seq-nome").textContent = "Open a sequence to get started.";
				$("seq-sel").textContent = "";
				if (seqAtual !== null) { seqAtual = null; esconderRelatorio(); mostrarDesfazer(); }
				return;
			}
			box.classList.add("ativa");
			$("seq-nome").textContent = r.sequence;
			$("seq-sel").textContent = r.selected ? r.selected + " selected" : "";
			preencherFaixas(r.audioTracks);
			if (r.sequenceId !== seqAtual) {
				seqAtual = r.sequenceId;
				esconderRelatorio(); // "Done" belongs to the previous timeline
				armado = false; atualizarUI();
				mostrarDesfazer();
			}
		});
	}

	// ---------- report ----------
	function esconderRelatorio() { $("relatorio").hidden = true; }
	function relatorio(classe, titulo, grade, msgs) {
		var el = $("relatorio");
		var h = "<h3>" + titulo + "</h3>";
		if (grade && grade.length) {
			h += '<div class="grade">';
			grade.forEach(function (g) { h += "<span>" + g[0] + "</span><b>" + g[1] + "</b>"; });
			h += "</div>";
		}
		if (msgs && msgs.length) {
			h += '<ul class="msgs">';
			msgs.forEach(function (m) { h += '<li class="' + m[0] + '">' + esc(m[1]) + "</li>"; });
			h += "</ul>";
		}
		el.className = "relatorio " + classe;
		el.innerHTML = h;
		el.hidden = false;
	}
	function esc(t) { return String(t).replace(/[&<>]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]; }); }

	function gradePlano(p) {
		var s = p.summary, g = [["Clips in scope", s.clipsInScope], ["Cuts", s.cuts], ["Moved to alternate", s.moved], ["Already on the right track", s.alreadyCorrect]];
		if (p.mode !== "interleave") {
			g.push(["J-cuts", s.jCuts], ["L-cuts", s.lCuts], ["Overlap", p.frames + " frames"]);
			if (s.withLessOverlap) g.push(["With less overlap", s.withLessOverlap]);
			if (s.skipped) g.push(["Skipped", s.skipped]);
			if (s.shortensBy) g.push(["Sequence gets shorter by", s.shortensBy + " frames"]);
		}
		if (s.crossfades) g.push(["Crossfades", s.crossfades + " clips"]);
		return g;
	}
	function msgsPlano(p) {
		var m = [];
		p.warnings.forEach(function (w) { m.push(["aviso", w]); });
		p.cuts.forEach(function (c) {
			if (c.skipped) m.push(["aviso", "Cut " + c.cut + " skipped: " + c.skipped + "."]);
			else if (c.note) m.push(["nota", "Cut " + c.cut + ": " + c.note + "."]);
		});
		p.notes.forEach(function (n) { m.push(["nota", n]); });
		return m;
	}

	// ---------- analyze / apply / undo ----------
	async function planejar() {
		var o = opcoes();
		if (o.src === o.alt) return { erro: "Source and Alternate must be different tracks." };
		var d = await host("jl_collect", { src: o.src, alt: o.alt });
		if (!d.ok) return { erro: d.erro };
		var p = JLPlanner.plan(d, o);
		p.dados = d;
		log("plan: " + JSON.stringify({ opts: o, summary: p.summary, extracts: p.extracts, moves: p.moves.length, edges: p.edges.length, fades: p.fades.length, warnings: p.warnings, errors: p.errors }));
		return p;
	}

	async function analisar() {
		var p = await planejar();
		if (p.erro) { relatorio("erro", "Can't analyze", null, [["erro", p.erro]]); return null; }
		if (!p.ok) { relatorio("erro", "Nothing to do", null, p.errors.map(function (e) { return ["erro", e]; })); return null; }
		relatorio("previa", "Preview — nothing changed yet", gradePlano(p), msgsPlano(p));
		return p;
	}

	async function aplicar() {
		var p = await planejar();
		if (p.erro) { relatorio("erro", "Can't apply", null, [["erro", p.erro]]); return; }
		if (!p.ok) { relatorio("erro", "Nothing to do", null, p.errors.map(function (e) { return ["erro", e]; })); return; }
		// warnings that need a decision: first click shows them, second click applies
		if (p.blocking && !armado) {
			armado = true;
			$("aplicar").textContent = "Apply anyway";
			$("aplicar").classList.add("atencao");
			relatorio("previa", "Check this before applying", gradePlano(p), msgsPlano(p));
			return;
		}
		var o = opcoes(), btn = $("aplicar");
		btn.disabled = true; btn.textContent = "Applying…";
		var r = await host("jl_apply", {
			sequenceId: p.dados.sequenceId, src: o.src, alt: o.alt, srcLabel: p.dados.srcLabel, altLabel: p.dados.altLabel,
			backup: o.backup, extracts: p.extracts, moves: p.moves, edges: p.edges, fades: p.fades
		});
		btn.disabled = false; atualizarUI();
		log("apply: " + JSON.stringify(r));
		if (r.erro) { relatorio("erro", "Something went wrong", null, [["erro", r.erro]]); return; }

		var g = gradePlano(p), menos = 0;
		(r.extended || []).forEach(function (x) { if (x.applied < x.requested) menos++; });
		g = [["Moved to alternate", r.moved + " / " + p.moves.length]];
		if (p.mode !== "interleave") g.push(["J-cuts", p.summary.jCuts], ["L-cuts", p.summary.lCuts]);
		if (menos) g.push(["Applied with less overlap", menos]);
		if (r.extracts) g.push(["Sequence shorter by", (p.dados.durationFrames - r.durationFrames) + " frames"]);
		if (p.fades.length) g.push(["Crossfades added", r.fades]);
		if (r.backup) g.push(["Backup", r.backup]);
		var m = msgsPlano(p).filter(function (x) { return x[0] !== "nota"; });
		(r.problems || []).forEach(function (pr) { m.unshift(["erro", pr]); });
		relatorio(r.ok ? "ok" : "erro", r.ok ? "Done ✓" : "Done, with problems", g, m);

		var e = estado[p.dados.sequenceId] = {};
		if (r.undo) e.undo = r.undo; else e.undoBloqueado = true;
		mostrarDesfazer();
	}

	async function desfazer() {
		var e = seqAtual && estado[seqAtual];
		if (!e || !e.undo) return;
		var args = JSON.parse(JSON.stringify(e.undo));
		if (e.forcar) args.force = true;
		var r = await host("jl_undo", args);
		log("undo: " + JSON.stringify(r));
		if (r.changed && !e.forcar) { e.forcar = true; mostrarDesfazer(); relatorio("erro", "Timeline changed", null, [["aviso", r.erro]]); return; }
		if (r.erro) { relatorio("erro", "Undo failed", null, [["erro", r.erro]]); return; }
		relatorio(r.ok ? "ok" : "erro", r.ok ? "Undone ✓" : "Undone, with problems",
			[["Clips restored", r.restored], ["Moved back", r.movedBack]],
			(r.problems || []).map(function (x) { return ["erro", x]; }));
		delete estado[seqAtual];
		mostrarDesfazer();
	}

	function copiarDiagnostico() {
		var env = {};
		try { env = cs.getHostEnvironment() || {}; } catch (e) {}
		var texto = "Auto J/L Cutter v" + versao + "\nPremiere " + (env.appVersion || "?") + " · " + navigator.platform + " · " + (env.appUILocale || "?") + "\n\n" + linhas.join("\n");
		var ta = document.createElement("textarea");
		ta.value = texto; document.body.appendChild(ta); ta.select();
		document.execCommand("copy"); document.body.removeChild(ta);
		$("copiar").textContent = "Copied ✓";
		setTimeout(function () { $("copiar").textContent = "Copy diagnostics"; }, 1500);
	}

	// ---------- wire up ----------
	["scope", "mode"].forEach(function (id) { ligarSeg(id, function () { atualizarUI(); esconderRelatorio(); }); });
	["rhythm", "overlap", "unit", "crossfade", "fade", "backup", "src", "alt"].forEach(function (id) {
		$(id).addEventListener("change", function () { atualizarUI(); });
	});
	$("analisar").addEventListener("click", analisar);
	$("aplicar").addEventListener("click", aplicar);
	$("desfazer").addEventListener("click", desfazer);
	$("copiar").addEventListener("click", copiarDiagnostico);

	versao = lerVersao();
	$("versao").textContent = "v" + versao;
	log("Auto J/L Cutter v" + versao);
	preencherFaixas(3);
	atualizarUI();
	vigiar();
	setInterval(vigiar, 2000);
})();
