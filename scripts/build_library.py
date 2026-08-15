#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build_library.py — library/notes/*.md → library/index.json + library/html/<id>.html

- frontmatter(YAML) 파싱 → 카드 메타데이터 + 관계 그래프(edges)
- 본문 markdown → HTML ([[위키링크]]는 대시보드 내부 링크로 변환)
- 검증: id/파일명 일치, 필수 필드, related 대상 존재 여부(없으면 경고 후 엣지 제외)

사용:  python scripts/build_library.py   (저장소 루트에서)
의존:  pyyaml, markdown  (pip install pyyaml markdown)
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import yaml

try:
    import markdown as md_lib
except ImportError:
    sys.exit("[error] pip install markdown pyyaml 후 실행하세요.")

ROOT = Path(__file__).resolve().parent.parent
NOTES = ROOT / "library" / "notes"
OUT_INDEX = ROOT / "library" / "index.json"
OUT_HTML = ROOT / "library" / "html"

REQUIRED = ["id", "title", "title_ko", "authors", "year", "topics", "difficulty", "one_liner"]
EDGE_TYPES = {"builds-on", "extends", "contradicts", "related"}
DIFFICULTIES = ["입문", "중급", "심화"]

FRONTMATTER_RE = re.compile(r"\A---\s*\n(.*?)\n---\s*\n", re.S)
WIKILINK_RE = re.compile(r"\[\[([^\]|]+)(?:\|([^\]]+))?\]\]")


def parse_note(path: Path):
    text = path.read_text(encoding="utf-8")
    m = FRONTMATTER_RE.match(text)
    if not m:
        raise ValueError(f"{path.name}: frontmatter(---)가 없습니다")
    meta = yaml.safe_load(m.group(1))
    body = text[m.end():]
    missing = [k for k in REQUIRED if not meta.get(k)]
    if missing:
        raise ValueError(f"{path.name}: 필수 필드 누락 {missing}")
    if meta["id"] != path.stem:
        raise ValueError(f"{path.name}: id({meta['id']})와 파일명이 다릅니다")
    if meta["difficulty"] not in DIFFICULTIES:
        raise ValueError(f"{path.name}: difficulty는 {DIFFICULTIES} 중 하나여야 합니다")
    return meta, body


def render_body(body: str, known_ids: set, titles: dict) -> str:
    def wikilink(mm):
        target, label = mm.group(1), mm.group(2)
        if target in known_ids:
            text = label or titles.get(target, target)
            return f'<a href="#note/{target}" class="wikilink">{text}</a>'
        return f'<span class="wikilink-missing">{label or target}</span>'

    body = WIKILINK_RE.sub(wikilink, body)
    return md_lib.markdown(body, extensions=["tables", "fenced_code"])


def main():
    files = sorted(NOTES.glob("*.md"))
    if not files:
        print("[build] notes/ 가 비어 있습니다 — 빈 인덱스를 생성합니다.", file=sys.stderr)

    parsed = []
    errors = []
    for f in files:
        try:
            parsed.append((f, *parse_note(f)))
        except Exception as e:
            errors.append(str(e))
    if errors:
        for e in errors:
            print(f"[error] {e}", file=sys.stderr)
        sys.exit(1)

    known_ids = {meta["id"] for _, meta, _ in parsed}
    titles = {meta["id"]: meta["title_ko"] for _, meta, _ in parsed}

    OUT_HTML.mkdir(parents=True, exist_ok=True)
    # 삭제된 노트의 잔여 html 정리
    for old in OUT_HTML.glob("*.html"):
        if old.stem not in known_ids:
            old.unlink()
            print(f"[build] removed stale {old.name}", file=sys.stderr)

    notes_out, edges_out, topics = [], [], {}
    for path, meta, body in parsed:
        nid = meta["id"]
        html = render_body(body, known_ids, titles)
        (OUT_HTML / f"{nid}.html").write_text(html, encoding="utf-8")

        for t in meta["topics"]:
            topics[t] = topics.get(t, 0) + 1

        for rel in meta.get("related") or []:
            rtype = rel.get("type", "related")
            if rtype not in EDGE_TYPES:
                print(f"[warn] {nid}: 알 수 없는 관계 타입 '{rtype}' → related로 처리", file=sys.stderr)
                rtype = "related"
            if rel.get("id") not in known_ids:
                print(f"[warn] {nid}: 관계 대상 '{rel.get('id')}' 노트 없음 → 엣지 제외", file=sys.stderr)
                continue
            edges_out.append({
                "source": nid, "target": rel["id"], "type": rtype,
                "note": rel.get("note", ""),
            })

        notes_out.append({
            "id": nid,
            "title": meta["title"],
            "title_ko": meta["title_ko"],
            "authors": meta["authors"],
            "year": meta["year"],
            "venue": meta.get("venue", ""),
            "topics": meta["topics"],
            "difficulty": meta["difficulty"],
            "status": meta.get("status", "knowledge"),
            "one_liner": meta["one_liner"],
            "ideas": meta.get("ideas") or [],
        })

    # 정렬: 주제 → 난이도 → 연도 (읽기 경로가 자연스럽게 형성되도록)
    notes_out.sort(key=lambda n: (DIFFICULTIES.index(n["difficulty"]), n["year"]))

    index = {
        "meta": {
            "note_count": len(notes_out),
            "edge_count": len(edges_out),
            "topics": [{"name": k, "count": v} for k, v in sorted(topics.items(), key=lambda x: -x[1])],
            "difficulties": DIFFICULTIES,
        },
        "notes": notes_out,
        "edges": edges_out,
    }
    OUT_INDEX.write_text(json.dumps(index, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"[build] {len(notes_out)} notes, {len(edges_out)} edges → index.json + html/", file=sys.stderr)


if __name__ == "__main__":
    main()
