---
name: skool-classroom
description: Baixa TODOS os vídeos de uma página de classroom/curso do Skool (não posts). Use quando o usuário mandar uma URL `skool.com/<comunidade>/classroom/<id>` e pedir para "baixar os vídeos do curso", "baixar essa classroom", "puxar as aulas em vídeo", ou der o link de um curso do Skool e quiser os MP4 das aulas. Trata as duas fontes do Skool (Loom embed + vídeo nativo Mux). Opcional: transcrever cada aula via inemavox. NÃO confundir com a skill skool-transcribe (que é para POSTS, `?p=<id>`).
---

# Skool Classroom — baixar todos os vídeos de um curso

Baixa os vídeos de um **classroom** do Skool (URL com `/classroom/`). Diferente de `skool-transcribe`, que trata **posts** (`?p=<id>`).

## Como o Skool serve os vídeos (o que a skill resolve)

Cada aula tem o vídeo numa de **duas fontes**, e a skill detecta automaticamente:

1. **Loom** — `node.metadata.videoLink = https://www.loom.com/share/<id>`. Baixa direto com `yt-dlp <url>`. Os links já vêm na árvore da página base.
2. **Mux (vídeo nativo do Skool)** — fica em `pp.video = {playbackId, playbackToken}`. HLS em `https://stream.mux.com/<playbackId>.m3u8?token=<token>`. **Pegadinhas:**
   - o token é **JWT assinado e expira ~10 min** → a skill **re-busca o token na hora de baixar**;
   - o Mux exige **`Referer: https://www.skool.com/`** (restrição de domínio) → senão devolve `403 E184-1`;
   - o `pp.video` só vem populado da aula **selecionada** (`?md=<id>`), então a skill faz um *probe* por aula nos nós que não são Loom.

Nós de **seção/header** (`📦 BLOCK ...`) devolvem `400` ao consultar `?md=` — a skill ignora.

## Pré-requisitos

- `SKOOL_COOKIE` no `.env` do openpcbot (a skill usa **só o `auth_token=...`**; o resto do valor pode ser rejeitado). É preciso estar logado/membro do curso.
- `yt-dlp` no PATH (mesmo do inemavox).
- É conteúdo de comunidade (em geral paga): uso **pessoal/backup**, não redistribuir.

## Uso

```bash
# 1) Manifesto (enumera aulas + detecta fonte, NÃO baixa) — sempre rode primeiro pra conferir
env -u SKOOL_COOKIE python3 skills/skool-classroom/classroom.py manifest "<url-classroom>" "<pasta>"

# 2) Baixar tudo (nomeia <curso>__<NN>-<titulo>.mp4, pula o que já existe)
env -u SKOOL_COOKIE python3 skills/skool-classroom/classroom.py download "<url-classroom>" "<pasta>"
```

- `env -u SKOOL_COOKIE` força ler o cookie do `.env` (evita um valor truncado herdado do shell). Se preferir, `source .env` e rode sem o `env -u`.
- Saída: arquivos `<curso>__<ordem>-<titulo-da-aula>.mp4` + `_manifest.json` na pasta.
- Apenas aulas **com vídeo publicado** entram; aulas "não prontas" (sem link) são puladas.
- Roda em background pra cursos grandes; acompanhe o log e avise o usuário no fim.

## Transcrição (opcional, via inemavox)

Se o usuário pedir transcrição, depois de baixar mande cada `.mp4` pro inemavox:

```bash
for f in "<pasta>"/*.mp4; do
  bash skills/inemavox/vox.sh submit transcribe "$f"   # ou a URL Loom direto
done
```

Acompanhe com `vox.sh status <id>` e pegue o texto com `vox.sh get <id> --format txt`. A fila do vox é serial FIFO.

## Notas de manutenção

- Estrutura do `__NEXT_DATA__`: `props.pageProps.course = {course:<root>, children:[<módulos>]}`; cada módulo `{course:{id,name,metadata,...}, children:[<aulas>]}`. `node_fields()` é tolerante a variações.
- Se o Skool mudar o shape, ajuste `node_fields`/`enumerate_tree`. O *probe* de Mux é o passo lento (1 fetch por aula sem Loom).
