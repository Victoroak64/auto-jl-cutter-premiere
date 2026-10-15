# Changelog

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/).

## [0.2.0] — 2026-10

Primeira versão publicada.

### Adicionado
- **Modos:** Interleave (só alterna as faixas), J-cut, L-cut e J + L com
  **Rhythm** (1 = J, L, J, L… · 2 = J, J, L, L…).
- **Scope:** timeline inteira (só cortes entre pedaços do mesmo arquivo) ou só
  os clipes selecionados.
- **Faixas de origem e alternada** escolhidas pelo editor, relidas sozinhas a
  cada 2 s (faixas novas aparecem na lista).
- **Overlap** em frames ou milissegundos (convertidos com o fps real).
- **Crossfade** opcional nas bordas de cada áudio, com o nome da transição
  achado em qualquer idioma do Premiere.
- **Backup** opcional da sequência, voltando sempre para a original.
- **Analyze** (prévia sem mexer em nada) e **Apply** com verificação de cada
  operação e relatório final.
- **Undo** sempre visível e por timeline (nesta versão, para o Interleave).
- Avisos claros: nenhum corte, faixa alternada ocupada (incluindo áudio de
  câmera em duas faixas), clipes de outras faixas cruzando os cortes, ritmo
  maior que o número de cortes, pedaços curtos demais.
- Instaladores para **macOS e Windows** e tutoriais em português e inglês.

### Modelo de J/L
- Cada J/L **move o clipe inteiro**: as falas se misturam por N frames, a boca
  fica sincronizada e a sequência encurta N frames por corte. O áudio recebe
  de volta exatamente os frames tirados do vídeo, que são o começo ou o fim da
  fala, nunca o respiro cortado.

### Histórico de desenvolvimento (antes da publicação)
- 0.1.0: não carregava ("EvalScript error") porque usava `extends`, palavra
  reservada do ES3, como nome de propriedade. Criado o `scripts/check-es3.js`.
- 0.1.1–0.1.2: o modelo "estender o áudio sem mover o vídeo" trazia de volta o
  respiro e não misturava as falas; corrigido o Undo quando o mesmo clipe
  recebe J e L.
