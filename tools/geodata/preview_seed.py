import json, sys, numpy as np, matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
sys.path.insert(0, ".")
import rasterio
with rasterio.open("cache/dem_chosica.tif") as s: dem = s.read(1); t = s.transform
ext = [t.c, t.c + dem.shape[1]*t.a, t.f + dem.shape[0]*t.e, t.f]
gy, gx = np.gradient(dem.astype(float)); shade = np.clip(0.5 + (gx - gy)/60, 0, 1)
seed = json.load(open("../../apps/api/seed/seed.json", encoding="utf-8"))
fig, ax = plt.subplots(figsize=(16, 10), dpi=100)
ax.imshow(shade, cmap="gray", extent=ext)
colors = {"Operativo": "green", "Deteriorado": "orange", "Crítico": "red", "En evaluación": "gray"}
for s in seed["structures"]:
    z = s["exposure"]["polygon"]
    polys = z["coordinates"] if z["type"] == "MultiPolygon" else [z["coordinates"]]
    for p in polys:
        xs, ys = zip(*p[0]); ax.fill(xs, ys, color="steelblue", alpha=0.04)
    c = s["scenario"]["corridor"]["coordinates"]; xs, ys = zip(*c); ax.plot(xs, ys, color="cyan", lw=0.5, alpha=0.5)
for s in seed["structures"]:
    L = s["location"]; ax.plot(L["lon"], L["lat"], "o", ms=4, color=colors[s["inspection"]["physical"]], mec="k", mew=0.3)
for f in seed["referenceLayers"]["features"]:
    if f["geometry"]["type"] == "Point":
        x, y = f["geometry"]["coordinates"]; ax.plot(x, y, "m^", ms=5)
ax.set_xlim(-76.775, -76.655); ax.set_ylim(-11.975, -11.905)
plt.savefig(sys.argv[1], bbox_inches="tight")
