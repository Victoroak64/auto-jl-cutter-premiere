/*
 * CSInterface mínimo — apenas o necessário pra este projeto:
 * evalScript() (chamar o .jsx) e getHostEnvironment() (saber versão do Premiere).
 * Baseado na interface pública documentada pela Adobe (window.__adobe_cep__),
 * reescrito de forma enxuta em vez de colar o arquivo oficial completo (~2500 linhas).
 * Se algo mais avançado for necessário depois (temas, eventos, redimensionar
 * a janela), trocamos por CSInterface.js oficial completo da Adobe.
 */
function CSInterface() {}

CSInterface.prototype.evalScript = function (script, callback) {
	if (!window.__adobe_cep__) {
		console.error("__adobe_cep__ not found — this HTML is not running inside a Premiere CEP panel.");
		if (callback) callback("ERROR: not running inside CEP.");
		return;
	}
	window.__adobe_cep__.evalScript(script, function (result) {
		if (callback) callback(result);
	});
};

CSInterface.prototype.getHostEnvironment = function () {
	if (!window.__adobe_cep__) return null;
	return JSON.parse(window.__adobe_cep__.getHostEnvironment());
};

CSInterface.prototype.getSystemPath = function (pathType) {
	if (!window.__adobe_cep__) return null;
	return window.__adobe_cep__.getSystemPath(pathType);
};
