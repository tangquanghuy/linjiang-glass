"""Parse the authored 身体开发度评语矩阵 files into JSON the UI can index.

The matrices in 变量相关/ are the source of truth for 开发度 评语: four parts x six
tiers per character, each a long paragraph.  The draft says the 评语 is rewritten
only when that part's 档位 actually goes up, so the text is a pure function of
(character, part, tier) -- which means the app should store the tier alone and look
the prose up here, rather than carrying a copy that can drift.

Files are named per character and all share the same shape:

    # <角色名> · 身体开发度评语矩阵(...)
    ## <部位>
    ### <部位> · 开发度<N>
    <paragraph>

    python tools/extract_dev_matrix.py

If both an original and a v2 file exist for the same character, v2 wins.
"""

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "变量相关"

# 变量草稿 fixes these four keys; the matrices spell 胸 as 胸部.
PARTS = {"口腔": "oral", "胸部": "chest", "胸": "chest", "小穴": "vagina", "肛门": "anus"}
TIERS = 6

# Matrix files use the character's full name; the roster uses the short one.
ROSTER = ["东雪莲", "塔菲", "沙花叉", "时雨羽衣", "红蔷薇", "斯黛拉", "璃亚梦"]

part_re = re.compile(r"^##\s+(\S+?)\s*$")
tier_re = re.compile(r"^###\s+(\S+?)\s*·\s*开发度\s*(\d)\s*$")
title_re = re.compile(r"身体开发度评语矩阵")


def resolve_name(raw):
    """Map 沙花叉克萝伊 -> 沙花叉, 永雏塔菲 -> 塔菲, by roster containment."""
    for name in ROSTER:
        if name in raw:
            return name
    return raw


def parse(path):
    lines = path.read_text(encoding="utf-8").splitlines()
    char = None
    for line in lines:
        if title_re.search(line):
            # Strip leading #s and any 一、二、 numbering, keep the name before the ·
            head = re.sub(r"^#+\s*", "", line.strip())
            head = re.sub(r"^[一二三四五六七八九十]+、\s*", "", head)
            char = resolve_name(head.split("·")[0].strip())
            break
    if not char:
        raise SystemExit(f"no character heading in {path.name}")

    out = {}
    part = None
    tier = None
    buf = []

    def flush():
        if part and tier is not None:
            text = " ".join(b.strip() for b in buf if b.strip())
            if text:
                out.setdefault(part, {})[tier] = text

    for line in lines:
        m = tier_re.match(line)
        if m:
            flush()
            buf = []
            tier = int(m.group(2))
            part = PARTS.get(m.group(1), part)
            continue
        m = part_re.match(line)
        if m and m.group(1) in PARTS:
            flush()
            buf = []
            part, tier = PARTS[m.group(1)], None
            continue
        if line.strip().startswith("#") or line.strip() in ("", "---"):
            continue
        buf.append(line)
    flush()

    # Normalise to dense arrays so the UI can index by tier without a guard.
    dense = {}
    for key, tiers in out.items():
        dense[key] = [tiers.get(n, "") for n in range(TIERS)]
    return char, dense


def is_v2(path):
    return bool(re.search(r"\bv2\b", path.stem, re.I))


matrix = {}
chosen_from = {}
files = sorted(p for p in SRC.iterdir() if p.is_file() and title_re.search(p.name))
if not files:
    raise SystemExit(f"no matrix files found in {SRC}")

# Parse everything, then keep v2 when a character has both drafts.
parsed = []
for path in files:
    char, parts = parse(path)
    parsed.append((path, char, parts))

for path, char, parts in parsed:
    old = chosen_from.get(char)
    if old and is_v2(old) and not is_v2(path):
        continue
    matrix[char] = parts
    chosen_from[char] = path

for char, path in sorted(chosen_from.items(), key=lambda item: ROSTER.index(item[0]) if item[0] in ROSTER else 99):
    parts = matrix[char]
    filled = {k: sum(1 for t in v if t) for k, v in parts.items()}
    lengths = [len(t) for v in parts.values() for t in v if t]
    tag = "v2" if is_v2(path) else "draft"
    print(f"{char:8s} [{tag:5s}] {path.name}")
    print(f"{'':8s} parts={len(parts)} tiers={filled} "
          f"len {min(lengths)}-{max(lengths)} chars")

missing = [n for n in ROSTER if n not in matrix]
if missing:
    print(f"no matrix authored yet for: {', '.join(missing)} -- the UI falls back to a placeholder")

(ROOT / "src" / "dev-matrix.json").write_text(
    json.dumps(matrix, ensure_ascii=False, indent=1), encoding="utf-8")
print("wrote src/dev-matrix.json")
