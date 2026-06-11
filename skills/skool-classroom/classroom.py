#!/usr/bin/env python3
"""Baixa todos os vídeos de um classroom do Skool.

O Skool mistura duas fontes de vídeo por aula:
  - Loom  : node.metadata.videoLink = https://www.loom.com/share/<id>
  - Mux   : pp.video = {playbackId, playbackToken}  (vídeo nativo do Skool)
            -> HLS em https://stream.mux.com/<playbackId>.m3u8?token=<token>
            (token expira ~10min e exige Referer https://www.skool.com/)

Uso:
  classroom.py manifest <url-classroom> <pasta>   # enumera + descobre fontes (NÃO baixa)
  classroom.py download <url-classroom> <pasta>   # enumera + baixa via yt-dlp

Cookie: lê SKOOL_COOKIE do .env do openpcbot (usa só o auth_token).
Nome do arquivo: <curso>__<NN>-<titulo-da-aula>.mp4
"""
import sys, os, re, json, time, unicodedata, subprocess, urllib.request

ENV = "/home/nmaldaner/projetos/openpcbot/.env"
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126 Safari/537.36"
REFERER = "https://www.skool.com/"


def load_cookie():
    cookie = os.environ.get("SKOOL_COOKIE")
    if not cookie and os.path.exists(ENV):
        for line in open(ENV, encoding="utf-8"):
            m = re.match(r'\s*(?:export\s+)?SKOOL_COOKIE\s*=\s*(.+)', line)
            if m:
                cookie = m.group(1).strip().strip('"').strip("'")
                break
    if not cookie:
        sys.exit("erro: SKOOL_COOKIE não definido (.env)")
    m = re.search(r'auth_token=[^;\s]+', cookie)  # o resto pode ser rejeitado
    return m.group(0) if m else cookie.split(";")[0].strip()


def fetch(url, cookie):
    req = urllib.request.Request(url, headers={"Cookie": cookie, "User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode("utf-8", "replace")


def next_data(html):
    m = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', html, re.S)
    return json.loads(m.group(1))["props"]["pageProps"] if m else {}


def slug(s, maxlen=70):
    s = s or "sem-titulo"
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    s = re.sub(r"[^\w\s-]", "", s).strip().lower()
    s = re.sub(r"[\s_-]+", "-", s)
    return s[:maxlen].strip("-") or "sem-titulo"


def node_fields(o):
    if not isinstance(o, dict):
        return None
    c = o.get("course") if isinstance(o.get("course"), dict) else o
    meta = c.get("metadata") if isinstance(c.get("metadata"), dict) else {}
    nid = c.get("id") or o.get("id")
    title = meta.get("title") or c.get("name") or meta.get("name")
    vlink = meta.get("videoLink")
    kids = o.get("children") or c.get("children") or []
    if not isinstance(kids, list):
        kids = []
    return nid, title, vlink, kids


def enumerate_tree(pp):
    out, counter = [], [0]

    def walk(node, module):
        nf = node_fields(node)
        if not nf:
            return
        nid, title, vlink, kids = nf
        is_module = bool(kids)
        if nid and title:
            counter[0] += 1
            out.append({"id": nid, "title": title, "module": module,
                        "order": counter[0], "vlink": vlink, "is_module": is_module})
        child_module = title if is_module else module
        for k in kids:
            walk(k, child_module)

    course = pp.get("course") or {}
    for top in (course.get("children") or []):
        walk(top, None)
    rn = node_fields(course)
    return (rn[1] if rn else "classroom"), out


def mux_url(v):
    return f"https://stream.mux.com/{v['playbackId']}.m3u8?token={v['playbackToken']}"


def discover(url, cookie):
    """Retorna (course_name, items[]). Cada item: order,title,module,source,loom|lesson_id,file."""
    base = url.split("?")[0]
    pp = next_data(fetch(url, cookie))
    course_name, nodes = enumerate_tree(pp)
    cslug = slug(course_name, 50)

    items, seen = [], set()

    def add(n, source, **kw):
        key = kw.get("loom") or kw.get("playback") or n["id"]
        if key in seen:
            return
        seen.add(key)
        fname = f"{cslug}__{n['order']:02d}-{slug(n['title'])}.mp4"
        items.append({"order": n["order"], "title": n["title"], "module": n["module"],
                      "source": source, "file": fname, **kw})

    # 1) Loom: já vem na árvore da página base
    for n in nodes:
        if n["vlink"] and "loom.com" in n["vlink"]:
            add(n, "loom", loom=n["vlink"])

    # 2) Mux: probe por aula nos nós sem loom (pula seções que dão 400)
    probe = [n for n in nodes if not (n["vlink"] and "loom.com" in n["vlink"])]
    sys.stderr.write(f"[probe] {len(probe)} nós sem Loom -> checando Mux...\n")
    for i, n in enumerate(probe, 1):
        try:
            p = next_data(fetch(f"{base}?md={n['id']}", cookie))
        except Exception:
            continue  # 400 = seção/header, sem vídeo
        v = p.get("video")
        if isinstance(v, dict) and v.get("playbackId") and v.get("status") == "ready":
            add(n, "mux", lesson_id=n["id"], playback=v["playbackId"])
        time.sleep(0.2)
        if i % 10 == 0:
            sys.stderr.write(f"  ...{i}/{len(probe)}\n")

    items.sort(key=lambda x: x["order"])
    return course_name, base, items


def ytdlp(out, src_url, referer=None):
    cmd = ["yt-dlp", "--no-warnings", "-f", "bestvideo+bestaudio/best",
           "--merge-output-format", "mp4", "-o", out]
    if referer:
        cmd += ["--referer", referer]
    cmd.append(src_url)
    return subprocess.run(cmd, capture_output=True, text=True)


def main():
    if len(sys.argv) < 4:
        sys.exit(__doc__)
    mode, url, dest = sys.argv[1], sys.argv[2], sys.argv[3]
    cookie = load_cookie()
    os.makedirs(dest, exist_ok=True)

    sys.stderr.write("descobrindo aulas + fontes de vídeo...\n")
    course_name, base, items = discover(url, cookie)

    json.dump({"course": course_name, "count": len(items), "items": items},
              open(os.path.join(dest, "_manifest.json"), "w"), ensure_ascii=False, indent=2)

    nloom = sum(1 for i in items if i["source"] == "loom")
    nmux = sum(1 for i in items if i["source"] == "mux")
    print(f"\nCURSO: {course_name}")
    print(f"Vídeos: {len(items)}  (Loom: {nloom} | Mux/Skool: {nmux})\n")
    for it in items:
        print(f"  {it['order']:02d}. [{it['source']:4}] {it['title']}")

    if mode != "download":
        print(f"\n(manifest only) -> {dest}/_manifest.json")
        return

    print(f"\nbaixando {len(items)} vídeos em {dest} ...")
    ok, fail = 0, []
    for it in items:
        outp = os.path.join(dest, it["file"])
        if os.path.exists(outp):
            print(f"  = já existe: {it['file']}")
            ok += 1
            continue
        print(f"  ↓ {it['order']:02d} [{it['source']}] {it['title']}")
        if it["source"] == "loom":
            r = ytdlp(outp, it["loom"])
        else:  # mux: re-busca token fresco (expira ~10min) + referer
            try:
                p = next_data(fetch(f"{base}?md={it['lesson_id']}", cookie))
                r = ytdlp(outp, mux_url(p["video"]), referer=REFERER)
            except Exception as e:
                r = subprocess.CompletedProcess([], 1, "", f"refetch token falhou: {e}")
        if r.returncode == 0:
            ok += 1
        else:
            tail = (r.stderr or "").strip().splitlines()[-1:] or ["?"]
            fail.append((it["file"], tail[0]))
            print(f"    ! falhou: {tail[0]}")
        time.sleep(1.0)

    print(f"\nPRONTO: {ok}/{len(items)} ok" + (f" | {len(fail)} falharam" if fail else ""))
    for f, err in fail:
        print("  FALHA:", f, "|", err)


if __name__ == "__main__":
    main()
