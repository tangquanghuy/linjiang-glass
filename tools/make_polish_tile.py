"""Generate the glass surface tile: anisotropic polish marks plus fine grain.

feTurbulence is the obvious way to do this in CSS, but its alpha channel is noise
too, and un-premultiplying that inside the filter clips the bright end -- the mean
comes out well above neutral and the whole panel lifts.  Generating the tile here
instead keeps the mean at exactly 128, so an overlay blend only modulates and adds
no brightness of its own, and it lets the autocorrelation be dialled in directly.

Amplitude is set for the hazy borders; make_polish_mask.py scales it down to about
a quarter across the open middle, where the prototype stays clear enough to read
the scene through.  Targets over that clear middle (tools/check_finish.py):

    polish sd 2.14, corr_x@12 0.84, corr_y@6 0.36     grain sd 0.54

Correlated noise smoothed by a Gaussian of sigma has autocorrelation
exp(-lag^2 / (4 sigma^2)), so the two correlation figures fix the two sigmas.
Built in the Fourier domain so the tile is seamless.
"""

from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
W, H = 512, 384
SIGMA_X, SIGMA_Y = 15.0, 4.4     # px; from corr_x@12 = .84 and corr_y@6 = .36
POLISH_SD, GRAIN_SD = 24.0, 5.1  # tile levels, through the overlay blend at full mask
SEED = 20260817


def correlated(rng, sx, sy):
    """Zero-mean periodic noise with a Gaussian autocorrelation."""
    white = rng.standard_normal((H, W))
    fy = np.fft.fftfreq(H)[:, None]
    fx = np.fft.fftfreq(W)[None, :]
    # Fourier transform of a Gaussian kernel, so one multiply does the smoothing.
    kernel = np.exp(-2 * (np.pi ** 2) * ((sx * fx) ** 2 + (sy * fy) ** 2))
    out = np.fft.ifft2(np.fft.fft2(white) * kernel).real
    return out / out.std()


rng = np.random.default_rng(SEED)
field = POLISH_SD * correlated(rng, SIGMA_X, SIGMA_Y) + GRAIN_SD * rng.standard_normal((H, W))
field -= field.mean()

# Channels correlate at ~0.9 in the reference, so the tile is near-grey with a
# little independent colour rather than the rainbow turbulence gives.
tint = np.stack([field + 0.33 * GRAIN_SD * rng.standard_normal((H, W)) for _ in range(3)], -1)
tile = np.clip(128 + tint, 0, 255)
tile += 128 - tile.mean(axis=(0, 1))          # exact neutral mean per channel

img = Image.fromarray(np.clip(tile, 0, 255).round().astype(np.uint8))
out = ROOT / "public" / "assets" / "polish.png"
img.save(out)

lum = np.asarray(img, float) @ [0.299, 0.587, 0.114]
c = lambda l, ax: np.corrcoef((lum[:, :-l] if ax == "x" else lum[:-l]).ravel(),
                              (lum[:, l:] if ax == "x" else lum[l:]).ravel())[0, 1]
print(f"wrote {out}  {W}x{H}")
print(f"mean {lum.mean():.2f}  sd {lum.std():.2f}  corr_x@12 {c(12, 'x'):.2f}  corr_y@6 {c(6, 'y'):.2f}")
