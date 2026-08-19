"""Raw 1:1 crop of the prototype Yuzuha TR.  No matting.

Alpha and blend are CSS: a radial mask on the corner + screen.
This file only copies pixels.
"""

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
PROTO = ROOT / "public" / "ref" / "prototype.png"
if not PROTO.exists():
    PROTO = ROOT / "原型" / "原型示意图.png"
OUT = ROOT / "public" / "assets"
ART = ROOT / "artifacts"

X0, Y0, CW, CH = 1091, 467, 260, 234
PAD_L, PAD_T, PAD_R, PAD_B = 50, 16, 14, 40
L, T = X0 + CW - PAD_L, Y0 - PAD_T
R, B = min(X0 + CW + PAD_R, 1367), Y0 + PAD_B


def main():
    src = Image.open(PROTO).convert("RGB")
    crop = src.crop((L, T, R, B))
    # Black pad so screen-blend can fade past the proto edge.
    pad_r, pad_t = 16, 8
    canvas = Image.new("RGB", (crop.size[0] + pad_r, crop.size[1] + pad_t), (0, 0, 0))
    canvas.paste(crop, (0, pad_t))
    OUT.mkdir(parents=True, exist_ok=True)
    ART.mkdir(exist_ok=True)
    canvas.save(OUT / "flow-corner.png")
    crop.save(ART / "flow_corner_raw.png")
    w, h = canvas.size
    print(f"cut {crop.size[0]}x{crop.size[1]}  padded {w}x{h}")
    print(f"place left={L - X0} top={T - Y0 - pad_t}")


if __name__ == "__main__":
    main()
