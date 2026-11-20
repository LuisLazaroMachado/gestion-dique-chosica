import sys, numpy as np, matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
from pyproj import Transformer
sys.path.insert(0, ".")
from hydro import Hydro
from anchors import MALLAS
h = Hydro("cache/dem_chosica.tif")
np.save("cache/acc.npy", h.acc); np.save("cache/fdir.npy", h.fdir)
t = Transformer.from_crs("EPSG:32718", "EPSG:4326", always_xy=True)
ext = [h.transform.c, h.transform.c + h.w*h.transform.a, h.transform.f + h.h*h.transform.e, h.transform.f]
gy, gx = np.gradient(h.dem); shade = np.clip(0.5 + (gx - gy)/60, 0, 1)
fig, ax = plt.subplots(figsize=(16, 10), dpi=110)
ax.imshow(shade, cmap="gray", extent=ext)
ax.imshow(np.ma.masked_less(np.log10(h.acc), 2.2), cmap="Blues", extent=ext, alpha=0.9, vmin=2, vmax=5)
for q, n, e, no, _ in MALLAS:
    lon, lat = t.transform(e, no); ax.plot(lon, lat, "r^", ms=7); ax.text(lon, lat, f" {q[:8]}{n}", color="red", fontsize=7)
ax.set_xlim(-76.78, -76.64); ax.set_ylim(-11.975, -11.89)
plt.savefig(sys.argv[1], bbox_inches="tight")
print("acc max", h.acc.max())
