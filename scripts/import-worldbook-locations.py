#!/usr/bin/env python3
"""把临江市地点 YAML 批量写成 SillyTavern 世界书地点条目。

用法：
  python scripts/import-worldbook-locations.py
  python scripts/import-worldbook-locations.py --dry-run
  python scripts/import-worldbook-locations.py --json PATH --yaml PATH --out PATH

以世界书中现有的“地点 - 青屏山古木栈道”作为模板：
只有 key、comment、content 会按地点变化；uid/displayIndex 作为世界书条目的
技术标识自动分配为唯一值，其他设置原样复制模板。
"""

from __future__ import annotations

import argparse
import copy
import json
import shutil
import tempfile
from collections import OrderedDict
from pathlib import Path
from typing import Any

import yaml


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_JSON = ROOT / "世界书" / "vtuber (1).json"
DEFAULT_YAML = ROOT / "世界书" / "临江市地点资料.yaml"

LOCATION_PREFIX = "地点 - "
TEMPLATE_NAME = "青屏山古木栈道"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="批量生成世界书地点详情条目")
    parser.add_argument("--json", dest="json_path", type=Path, default=DEFAULT_JSON,
                        help="世界书 JSON 文件")
    parser.add_argument("--yaml", dest="yaml_path", type=Path, default=DEFAULT_YAML,
                        help="地点资料 YAML 文件")
    parser.add_argument("--out", dest="out_path", type=Path,
                        help="输出 JSON；默认覆盖 --json 指定的文件")
    parser.add_argument("--no-backup", action="store_true",
                        help="覆盖输入文件时不生成 .bak 备份")
    parser.add_argument("--dry-run", action="store_true",
                        help="只检查并打印结果，不写文件")
    return parser.parse_args()


def numeric_id(value: str) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def find_template(entries: dict[str, dict[str, Any]]) -> tuple[str, dict[str, Any]]:
    """优先找示例地点；重跑时仍能找到已生成的示例条目。"""
    exact = []
    by_key = []
    locations = []
    for entry_id, entry in entries.items():
        comment = str(entry.get("comment", ""))
        if comment.startswith(LOCATION_PREFIX):
            locations.append((entry_id, entry))
        if comment == f"{LOCATION_PREFIX}{TEMPLATE_NAME}":
            exact.append((entry_id, entry))
        if entry.get("key") == ["栈道"]:
            by_key.append((entry_id, entry))

    if exact:
        return exact[0]
    if by_key:
        return by_key[0]
    if locations:
        return locations[0]
    raise ValueError("世界书中没有找到地点模板条目（comment 以“地点 - ”开头的条目）。")


def load_locations(yaml_path: Path) -> tuple[list[tuple[str, str]], dict[str, Any]]:
    text = yaml_path.read_text(encoding="utf-8")
    document = yaml.safe_load(text)
    if not isinstance(document, dict) or not isinstance(document.get("地点"), dict):
        raise ValueError(f"{yaml_path} 缺少顶层“地点”映射。")

    locations = document["地点"]
    if not locations:
        raise ValueError(f"{yaml_path} 中没有地点节点。")

    # 保留 YAML 原文作为 content，避免长文本被重新折行或改变标点。
    raw_blocks = extract_raw_location_blocks(text)
    missing_raw = [name for name in locations if name not in raw_blocks]
    if missing_raw:
        preview = "、".join(missing_raw[:5])
        raise ValueError(f"YAML 中有节点无法提取原文块：{preview}")

    ordered = [(str(name), raw_blocks[name]) for name in locations]
    return ordered, locations


def extract_raw_location_blocks(text: str) -> dict[str, str]:
    lines = text.splitlines()
    section_start = None
    for index, line in enumerate(lines):
        if line.strip() == "地点:":
            section_start = index + 1
            break
    if section_start is None:
        raise ValueError("YAML 中没有找到“地点:”段落。")

    starts: list[tuple[int, str]] = []
    for index in range(section_start, len(lines)):
        line = lines[index]
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        indent = len(line) - len(line.lstrip(" "))
        if indent != 2 or not line.rstrip().endswith(":"):
            continue
        parsed = yaml.safe_load(line)
        if not isinstance(parsed, dict) or len(parsed) != 1:
            continue
        name = str(next(iter(parsed)))
        starts.append((index, name))

    blocks: dict[str, str] = {}
    for position, (start, name) in enumerate(starts):
        end = starts[position + 1][0] if position + 1 < len(starts) else len(lines)
        # 去掉节点块末尾的空行；世界书模板 content 也不带多余换行。
        block = "\n".join(lines[start:end]).rstrip("\r\n")
        if name in blocks:
            raise ValueError(f"YAML 中发现重复地点名：{name}")
        blocks[name] = block
    return blocks


def next_free_ids(entries: OrderedDict[str, dict[str, Any]], old_location_ids: list[str], count: int) -> list[str]:
    usable_old = [entry_id for entry_id in old_location_ids if entry_id not in entries]
    numeric_non_location = [numeric_id(entry_id) for entry_id in entries]
    numeric_non_location = [value for value in numeric_non_location if value is not None]
    next_id = max(numeric_non_location, default=-1) + 1
    result = usable_old[:count]
    while len(result) < count:
        candidate = str(next_id)
        next_id += 1
        if candidate not in entries and candidate not in result:
            result.append(candidate)
    return result


def build_document(document: dict[str, Any], location_rows: list[tuple[str, str]]) -> tuple[dict[str, Any], dict[str, int]]:
    raw_entries = document.get("entries")
    if not isinstance(raw_entries, dict):
        raise ValueError("世界书 JSON 缺少 entries 对象。")

    entries: OrderedDict[str, dict[str, Any]] = OrderedDict(raw_entries.items())
    template_id, template = find_template(entries)
    # 按原世界书顺序保留已有地点条目的 ID，重跑脚本时不会无限增长。
    old_location_ids = [
        entry_id for entry_id, value in entries.items()
        if str(value.get("comment", "")).startswith(LOCATION_PREFIX)
    ]

    non_location = OrderedDict(
        (entry_id, value) for entry_id, value in entries.items()
        if not str(value.get("comment", "")).startswith(LOCATION_PREFIX)
    )
    allocated_ids = next_free_ids(non_location, old_location_ids, len(location_rows))

    generated: OrderedDict[str, dict[str, Any]] = OrderedDict()
    for entry_id, (name, content) in zip(allocated_ids, location_rows):
        entry = copy.deepcopy(template)
        entry["uid"] = numeric_id(entry_id) if numeric_id(entry_id) is not None else entry_id
        entry["key"] = [name]
        entry["comment"] = f"{LOCATION_PREFIX}{name}"
        entry["content"] = content
        if "displayIndex" in entry:
            entry["displayIndex"] = entry["uid"]
        generated[entry_id] = entry

    output_entries = OrderedDict(non_location)
    output_entries.update(generated)
    output = copy.deepcopy(document)
    output["entries"] = output_entries

    stats = {
        "template_id": int(template_id) if numeric_id(template_id) is not None else -1,
        "old_location_count": len(old_location_ids),
        "location_count": len(location_rows),
        "output_entry_count": len(output_entries),
    }
    return output, stats


def write_json(document: dict[str, Any], output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(document, ensure_ascii=False, separators=(",", ":"))
    if output_path.exists():
        with tempfile.NamedTemporaryFile("w", encoding="utf-8", newline="", delete=False,
                                        dir=output_path.parent, prefix=f".{output_path.name}.", suffix=".tmp") as handle:
            handle.write(payload)
            temp_path = Path(handle.name)
        temp_path.replace(output_path)
    else:
        output_path.write_text(payload, encoding="utf-8", newline="")


def main() -> int:
    args = parse_args()
    json_path = args.json_path.resolve()
    yaml_path = args.yaml_path.resolve()
    out_path = (args.out_path or args.json_path).resolve()

    if not json_path.exists():
        raise FileNotFoundError(json_path)
    if not yaml_path.exists():
        raise FileNotFoundError(yaml_path)

    document = json.loads(json_path.read_text(encoding="utf-8"))
    location_rows, _ = load_locations(yaml_path)
    output, stats = build_document(document, location_rows)

    # 生成前后做一次结构校验，防止写出不完整世界书。
    if len(output["entries"]) != stats["output_entry_count"]:
        raise AssertionError("entries 数量校验失败")
    generated = [entry for entry in output["entries"].values()
                 if str(entry.get("comment", "")).startswith(LOCATION_PREFIX)]
    if len(generated) != stats["location_count"]:
        raise AssertionError("地点条目数量校验失败")
    if any(not entry.get("content") for entry in generated):
        raise AssertionError("存在空的地点 content")

    print(f"模板条目: {stats['template_id']}")
    print(f"地点节点: {stats['location_count']}")
    print(f"原地点条目: {stats['old_location_count']} → 新地点条目: {stats['location_count']}")
    print(f"世界书条目总数: {stats['output_entry_count']}")

    if args.dry_run:
        print("dry-run：未写入文件")
        return 0

    if out_path == json_path and not args.no_backup:
        backup_path = out_path.with_name(out_path.name + ".bak")
        shutil.copy2(out_path, backup_path)
        print(f"备份: {backup_path}")

    write_json(output, out_path)
    # 再读一次确认落盘 JSON 可解析。
    json.loads(out_path.read_text(encoding="utf-8"))
    print(f"已写入: {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())



