// ExtendScript is ES3: reserved words can't be property names (p.extends,
// {class: 1}) and modern syntax is invalid. Node and acorn --ecma3 accept
// these, so this check exists. Usage: node scripts/check-es3.js file.jsx
var fs = require("fs");
var RES = "break case catch class const continue debugger default delete do else enum export extends false finally for function if import in instanceof new null return super switch this throw true try typeof var void while with abstract boolean byte char double final float goto implements int interface long native package private protected public short static synchronized throws transient volatile".split(" ");
var falhas = 0;
process.argv.slice(2).forEach(function (f) {
	var linhas = fs.readFileSync(f, "utf8").split("\n");
	linhas.forEach(function (l, i) {
		var codigo = l.replace(/\/\/.*$/, "").replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, '""');
		RES.forEach(function (w) {
			if (new RegExp("\\.\\s*" + w + "\\b").test(codigo) || new RegExp("[{,]\\s*" + w + "\\s*:").test(codigo)) {
				console.log(f + ":" + (i + 1) + "  reserved word as property: " + w); falhas++;
			}
		});
		if (/=>|\blet\b|\bconst\b|`|\.\.\./.test(codigo)) { console.log(f + ":" + (i + 1) + "  modern syntax"); falhas++; }
	});
});
if (falhas) { console.log(falhas + " ES3 problem(s)"); process.exit(1); }
console.log("ES3 check ok");
