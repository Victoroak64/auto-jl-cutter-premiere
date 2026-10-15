// ============================================================
// Detalhes visuais: chuva de código discreta no cabeçalho e
// animações de número. Deliberadamente contido — isso roda dentro
// do Premiere, que já disputa CPU com playback e render.
// ============================================================
(function () {
	"use strict";

	var canvas = document.getElementById("chuva");
	if (!canvas) return;
	var ctx = canvas.getContext("2d");

	var CARACTERES = "01アイウカキクサシスタチツナニヌ<>[]{}/|=+".split("");
	var TAMANHO = 11;
	var FPS = 15; // ainda contido: isso divide CPU com o playback do Premiere

	var colunas = 0, gotas = [], L = 0, A = 0;

	function dimensionar() {
		var dpr = window.devicePixelRatio || 1;
		L = canvas.offsetWidth;
		A = canvas.offsetHeight;
		if (L === 0 || A === 0) return;
		canvas.width = Math.round(L * dpr);
		canvas.height = Math.round(A * dpr);
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx.font = TAMANHO + "px ui-monospace, monospace";
		colunas = Math.ceil(L / TAMANHO);
		gotas = [];
		for (var i = 0; i < colunas; i++) gotas.push(Math.random() * -14);
	}

	function desenhar() {
		if (L === 0) return;
		// rastro: pinta translúcido por cima em vez de limpar
		ctx.fillStyle = "rgba(3,5,4,0.13)"; // mais translúcido = rastro mais longo
		ctx.fillRect(0, 0, L, A);

		for (var i = 0; i < gotas.length; i++) {
			var y = gotas[i] * TAMANHO;
			// cabeça da gota clara, corpo verde — dá profundidade à coluna
			ctx.fillStyle = Math.random() > 0.88 ? "#d6ffe9" : "#2fe08a";
			ctx.fillText(CARACTERES[(Math.random() * CARACTERES.length) | 0], i * TAMANHO, y);
			if (y > A && Math.random() > 0.94) gotas[i] = 0;
			gotas[i] += 0.5;
		}
	}

	var iv = null;
	function iniciar() { if (!iv) iv = setInterval(desenhar, 1000 / FPS); }
	function parar() { if (iv) { clearInterval(iv); iv = null; } }

	// não gasta CPU quando o painel está atrás de outra aba
	document.addEventListener("visibilitychange", function () {
		document.hidden ? parar() : iniciar();
	});
	window.addEventListener("resize", dimensionar);

	dimensionar();
	iniciar();

	// ---------- contador animado ----------
	window.animarNumero = function (elemento, valorFinal, formatador, duracaoMs) {
		duracaoMs = duracaoMs || 400;
		var inicio = performance.now();
		function passo(agora) {
			var t = Math.min(1, (agora - inicio) / duracaoMs);
			var suave = 1 - Math.pow(1 - t, 3); // desacelera no fim
			elemento.textContent = formatador(valorFinal * suave);
			if (t < 1) requestAnimationFrame(passo);
			else elemento.textContent = formatador(valorFinal);
		}
		requestAnimationFrame(passo);
	};
})();
