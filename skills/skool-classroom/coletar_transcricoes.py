#!/usr/bin/env python3
"""Acompanha os jobs de transcrição do inemavox e salva cada .txt com o nome da aula.

Uso: coletar_transcricoes.py <pasta>   # lê <pasta>/_transcricoes.tsv (jobid<TAB>video.mp4)
Escreve <pasta>/<video-sem-ext>.txt conforme cada job conclui. Termina quando todos forem terminais.
"""
import sys, os, time, json, urllib.request

VOX = os.environ.get("INEMAVOX_URL", "http://localhost:8010")


def api(path):
    with urllib.request.urlopen(f"{VOX}{path}", timeout=30) as r:
        return r.read()


def status(jid):
    try:
        return json.loads(api(f"/api/jobs/{jid}"))
    except Exception:
        return {}


def main():
    dest = sys.argv[1]
    tsv = os.path.join(dest, "_transcricoes.tsv")
    jobs = []
    for line in open(tsv, encoding="utf-8"):
        parts = line.rstrip("\n").split("\t")
        if len(parts) == 2 and parts[0] != "ERRO":
            jobs.append((parts[0], parts[1]))
    print(f"acompanhando {len(jobs)} transcrições...", flush=True)

    done, failed = set(), {}
    for _ in range(6000):  # ~33h teto de segurança (poll 20s)
        for jid, video in jobs:
            if jid in done or jid in failed:
                continue
            st = status(jid).get("status", "?")
            if st == "completed":
                try:
                    txt = api(f"/api/jobs/{jid}/transcript?format=txt")
                    out = os.path.join(dest, os.path.splitext(video)[0] + ".txt")
                    open(out, "wb").write(txt)
                    done.add(jid)
                    print(f"OK  {jid}  -> {os.path.basename(out)}  ({len(txt)} bytes)", flush=True)
                except Exception as e:
                    failed[jid] = f"get falhou: {e}"
                    print(f"ERR {jid}  {e}", flush=True)
            elif st in ("failed", "error", "canceled"):
                failed[jid] = st
                print(f"FAIL {jid} ({st})  <- {video}", flush=True)
        if len(done) + len(failed) >= len(jobs):
            break
        time.sleep(20)

    print(f"\nFIM: {len(done)}/{len(jobs)} transcritos"
          + (f" | {len(failed)} falharam: {list(failed)}" if failed else ""), flush=True)


if __name__ == "__main__":
    main()
