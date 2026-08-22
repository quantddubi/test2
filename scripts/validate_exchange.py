#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
validate_exchange.py — data/exchange.json 이 vault-exchange/1 계약을 지키는지 검증.

이 저장소는 PUBLIC이다. 여기 실리는 교환 데이터는 프라이빗 vault(test1)가 내보낸
"최소 컨텍스트"여야 하며, 노트 본문·연구 아이디어가 섞여 들어오면 안 된다.
이 스크립트는 CI에서 유출 카나리아 겸 스키마 게이트로 돈다. 표준 라이브러리만 사용.

사용:  python scripts/validate_exchange.py [경로 (기본 data/exchange.json)]
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

SCHEMA = "vault-exchange/1"
PERMISSIONS = ["none", "keywords", "metadata", "summary"]
PERM_RANK = {p: i for i, p in enumerate(PERMISSIONS)}
EDGE_TYPES = {"builds-on", "extends", "contradicts", "related", "mentions"}
# 노트 본문·아이디어를 나르는 키가 하나라도 보이면 실패 (유출 카나리아)
FORBIDDEN_ANYWHERE = {"ideas", "body", "content", "markdown", "html"}

problems: list[str] = []


def bad(msg: str) -> None:
    problems.append(msg)


def require(obj: dict, keys: list[str], where: str) -> None:
    for k in keys:
        if k not in obj:
            bad(f"{where}: 필수 필드 '{k}' 없음")


def scan_forbidden(o, path: str, in_note: bool = False) -> None:
    if isinstance(o, dict):
        for k, v in o.items():
            if k in FORBIDDEN_ANYWHERE:
                bad(f"{path}: 금지 필드 '{k}' — 최소 컨텍스트 위반(본문류 유출 의심)")
            if in_note and k == "related":
                bad(f"{path}: 노트 안 'related' — 엣지는 최상위 edges로만 와야 함")
            scan_forbidden(v, f"{path}.{k}", in_note)
    elif isinstance(o, list):
        for i, v in enumerate(o):
            scan_forbidden(v, f"{path}[{i}]", in_note)


def main() -> None:
    path = Path(sys.argv[1] if len(sys.argv) > 1 else "data/exchange.json")
    if not path.exists():
        print(f"[validate] {path} 없음 — 아직 배달 전이면 정상 (skip)", file=sys.stderr)
        return
    ex = json.loads(path.read_text(encoding="utf-8"))

    if ex.get("schema") != SCHEMA:
        bad(f"schema가 {SCHEMA} 가 아님: {ex.get('schema')}")
    require(ex, ["source", "threshold", "stats", "vaults", "edges", "affinity"], "$")
    if problems:
        report()
        return

    note_vault: dict[str, str] = {}
    note_total = 0
    for v in ex["vaults"]:
        w = f"vault:{v.get('id')}"
        require(v, ["id", "title", "title_ko", "permission", "note_count"], w)
        perm = v.get("permission")
        if perm not in PERM_RANK:
            bad(f"{w}: permission 값 오류 {perm}")
            continue
        if perm == "none" and ("notes" in v or "keywords" in v):
            bad(f"{w}: none 봉인인데 notes/keywords가 실려 있음")
        if PERM_RANK[perm] < PERM_RANK["metadata"] and "notes" in v:
            bad(f"{w}: {perm} 단계인데 notes가 실려 있음")
        for n in v.get("notes") or []:
            wn = f"note:{n.get('id')}"
            require(n, ["id", "vault", "title", "title_ko", "authors", "year",
                        "keywords", "difficulty", "status", "source"], wn)
            if n.get("vault") != v["id"]:
                bad(f"{wn}: vault 필드({n.get('vault')})가 소속({v['id']})과 다름")
            if perm != "summary" and "one_liner" in n:
                bad(f"{wn}: {perm} 단계인데 one_liner가 실려 있음")
            if n.get("id") in note_vault:
                bad(f"{wn}: 노트 id 중복")
            note_vault[n["id"]] = v["id"]
            scan_forbidden(n, wn, in_note=True)
            note_total += 1

    perm_of = {v["id"]: v["permission"] for v in ex["vaults"]}
    cross_total = 0
    for e in ex["edges"]:
        w = f"edge:{e.get('source')}→{e.get('target')}"
        require(e, ["source", "source_vault", "target", "target_vault", "type", "cross", "origin"], w)
        if e.get("type") not in EDGE_TYPES:
            bad(f"{w}: 알 수 없는 type {e.get('type')}")
        if e.get("cross") != (e.get("source_vault") != e.get("target_vault")):
            bad(f"{w}: cross 플래그가 vault 소속과 모순")
        for side in ("source_vault", "target_vault"):
            p = perm_of.get(e.get(side))
            if p is None:
                bad(f"{w}: {side}={e.get(side)} 가 vaults에 없음")
            elif PERM_RANK[p] < PERM_RANK["metadata"]:
                bad(f"{w}: {side}({e.get(side)})가 {p} 단계 — 엣지 교환 금지 위반")
        if e.get("source") in note_vault and note_vault[e["source"]] != e.get("source_vault"):
            bad(f"{w}: source_vault 불일치")
        if e.get("target") in note_vault and note_vault[e["target"]] != e.get("target_vault"):
            bad(f"{w}: target_vault 불일치")
        if e.get("cross"):
            cross_total += 1

    # affinity 재검산 (무순서 (노트쌍, type) dedup)
    for p in ex["affinity"]:
        w = f"affinity:{p.get('a')}↔{p.get('b')}"
        require(p, ["a", "b", "shared_keywords", "edge_counts", "strength"], w)
        if not (p.get("a") < p.get("b")):
            bad(f"{w}: a < b 정렬 위반")
        counted, counts = set(), {t: 0 for t in EDGE_TYPES}
        for e in ex["edges"]:
            if e["cross"] and {e["source_vault"], e["target_vault"]} == {p["a"], p["b"]}:
                key = (frozenset((e["source"], e["target"])), e["type"])
                if key not in counted:
                    counted.add(key)
                    counts[e["type"]] += 1
        for t in EDGE_TYPES:
            if counts[t] != p["edge_counts"].get(t, 0):
                bad(f"{w}: edge_counts[{t}] 재검산 불일치 (기대 {counts[t]}, 실제 {p['edge_counts'].get(t)})")
        strength = round(sum(v for k, v in counts.items() if k != "mentions") + counts["mentions"] * 0.25, 2)
        if abs(strength - p["strength"]) > 1e-9:
            bad(f"{w}: strength 재검산 불일치 (기대 {strength}, 실제 {p['strength']})")

    s = ex["stats"]
    if s.get("vault_count") != len(ex["vaults"]):
        bad(f"stats.vault_count({s.get('vault_count')}) ≠ vaults 길이({len(ex['vaults'])})")
    if s.get("note_count") != note_total:
        bad(f"stats.note_count({s.get('note_count')}) ≠ 실린 노트 수({note_total})")
    if s.get("edge_count") != len(ex["edges"]):
        bad(f"stats.edge_count({s.get('edge_count')}) ≠ edges 길이({len(ex['edges'])})")
    if s.get("cross_edge_count") != cross_total:
        bad(f"stats.cross_edge_count({s.get('cross_edge_count')}) ≠ 재검산({cross_total})")

    report()


def report() -> None:
    if problems:
        for p in problems:
            print(f"[error] {p}", file=sys.stderr)
        print(f"[validate] 실패 — {len(problems)}건", file=sys.stderr)
        sys.exit(1)
    print("[validate] OK — vault-exchange/1 계약 준수, 본문류 유출 없음", file=sys.stderr)


if __name__ == "__main__":
    main()
