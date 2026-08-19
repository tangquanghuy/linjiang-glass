"""Repair a source file that was written out in the Windows ANSI code page.

PowerShell 5.1's Set-Content defaults to the ANSI code page, not UTF-8, so piping a
file through it re-encodes every CJK byte.  This decodes cp936 and writes UTF-8 back,
then prints the CJK strings it recovered so the result can be eyeballed.

Usage: python tools/fix_encoding.py <file> [--check]
"""
import re
import sys

path = sys.argv[1]
check_only = "--check" in sys.argv

raw = open(path, "rb").read()
try:
    raw.decode("utf-8")
    print(f"{path}: already valid UTF-8, nothing to do")
    sys.exit(0)
except UnicodeDecodeError as exc:
    print(f"{path}: not UTF-8 ({exc.reason} at {exc.start}) -- decoding as cp936")

text = raw.decode("cp936")
cjk = re.findall(r"[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]+", text)
print(f"  recovered {len(cjk)} CJK runs, {len(set(cjk))} distinct")
for s in list(dict.fromkeys(cjk))[:14]:
    print(f"    {s}")

if check_only:
    sys.exit(0)

with open(path, "w", encoding="utf-8", newline="") as fh:
    fh.write(text)
print(f"  rewrote {path} as UTF-8")
