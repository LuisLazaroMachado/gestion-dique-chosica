"""Genera los datos semilla del inventario a partir de fuentes documentadas + estimaciones explícitas.

Salida: apps/api/seed/seed.json (estructuras, inspecciones de referencia, exposición, escenarios, capas).

Cada valor lleva su etiqueta (Documentado / Estimado) y su método. Reemplazar las estimaciones por datos
verificados desde la app web (con auditoría) a medida que se obtengan.

Uso:  .venv/Scripts/python.exe estimate.py
Requiere cache/dem_chosica.tif y cache/osm_buildings.json (ver README.md de esta carpeta).
"""
from __future__ import annotations

import json
import io
import math
import sys
from pathlib import Path

from pyproj import Transformer
from shapely.geometry import LineString, Point, Polygon, mapping
from shapely.ops import transform as shp_transform, unary_union
from shapely.strtree import STRtree

sys.path.insert(0, str(Path(__file__).parent))
from anchors import MALLAS  # noqa: E402
from hydro import Hydro  # noqa: E402

HERE = Path(__file__).parent
OUT = HERE.parent.parent / "apps" / "api" / "seed" / "seed.json"
TODAY = "2026-11-19"

to_wgs = Transformer.from_crs("EPSG:32718", "EPSG:4326", always_xy=True)
to_utm = Transformer.from_crs("EPSG:4326", "EPSG:32718", always_xy=True)

H = Hydro(str(HERE / "cache" / "dem_chosica.tif"))
RIVER_ACC = 15000  # acumulación a partir de la cual se considera el cauce del Rímac

# ─────────────────────────── utilidades geométricas ───────────────────────────
def malla_ll(q: str, n: int) -> tuple[float, float]:
    for qq, nn, e, no, _ in MALLAS:
        if qq == q and nn == n:
            return to_wgs.transform(e, no)
    raise KeyError((q, n))


def cells_to_utm(path):
    return [to_utm.transform(*H.lonlat(r, c)) for r, c in path]


def channel_line(start_rc, up_cells=0):
    """Línea del cauce: tramo aguas arriba (opcional) + tramo aguas abajo hasta el Rímac, en UTM."""
    down = H.trace_down(*start_rc, stop_acc=RIVER_ACC)
    up = H.trace_up(*start_rc, up_cells)[1:] if up_cells else []
    cells = list(reversed(up)) + down
    return LineString(cells_to_utm(cells)), len(up)


def point_at(line: LineString, dist_m: float) -> tuple[float, float]:
    p = line.interpolate(max(0.0, min(dist_m, line.length)))
    return to_wgs.transform(p.x, p.y)


def proj_dist(line: LineString, lon: float, lat: float) -> float:
    x, y = to_utm.transform(lon, lat)
    return line.project(Point(x, y))


# ─────────────────────────── ubicación estimada de diques ───────────────────────────


positions: dict[str, list[tuple[float, float]]] = {}
methods: dict[str, str] = {}

# Carossio (4): numeración de abajo hacia arriba. Dique 1 "debajo de la malla dinámica n.° 3" (Acta 01 p.5);
# diques 2–4 aguas arriba (p.6).
lon4, lat4 = malla_ll("Carossio", 4)
line, _ = channel_line(H.snap(lon4, lat4), up_cells=12)
d_m3 = proj_dist(line, *malla_ll("Carossio", 3))
d_m4 = proj_dist(line, lon4, lat4)
positions["Carossio"] = [point_at(line, d_m3 + 25)] + [point_at(line, d_m4 - 45 * k) for k in (1, 2, 3)]
methods["Carossio"] = ("Dique 1 a 25 m aguas abajo de la malla 3 (documentado: 'debajo de la malla n.° 3'); diques 2–4 cada "
                       "45 m aguas arriba de la malla 4, sobre el cauce derivado del DEM Copernicus GLO-30 (D8).")

# Libertad (12): de abajo hacia arriba. La malla colindante está aguas arriba del dique 4 (Acta 01 p.11).
lon2, lat2 = malla_ll("Libertad", 2)
line, _ = channel_line(H.snap(lon2, lat2), up_cells=25)
d1 = proj_dist(line, *malla_ll("Libertad", 1))
d2 = proj_dist(line, lon2, lat2)
below = [point_at(line, d1 + 20 + 50 * k) for k in (3, 2, 1, 0)]          # diques 1..4 (1 es el más bajo)
above = [point_at(line, d2 - 30 - 45 * k) for k in range(8)]               # diques 5..12
positions["Libertad"] = below + above
methods["Libertad"] = ("Diques 1–4 aguas abajo de la malla 1 (el 4 inmediatamente debajo, documentado); diques 5–12 cada 45 m "
                       "aguas arriba de la malla 2; cauce derivado del DEM (D8).")

# Pedregal (19): de la zona elevada hacia aguas abajo; 4 mallas en el tramo alto (Acta 01 p.20).
lon4, lat4 = malla_ll("Pedregal", 4)
line, _ = channel_line(H.snap(lon4, lat4), up_cells=3)
d_top = proj_dist(line, lon4, lat4) - 30
d_bot = proj_dist(line, *malla_ll("Pedregal", 1)) + 250
step = (d_bot - d_top) / 18
positions["Pedregal"] = [point_at(line, d_top + step * k) for k in range(19)]
methods["Pedregal"] = (f"19 diques equiespaciados (~{step:.0f} m) desde 30 m sobre la malla 4 hasta 250 m bajo la malla 1, "
                       "en orden de numeración (de arriba hacia abajo); cauce derivado del DEM (D8).")

# Quirio (17): de la zona elevada hacia aguas abajo; viviendas colindantes y muro en la desembocadura (Acta 02 p.1–2).
lon2, lat2 = malla_ll("Quirio", 2)
line, _ = channel_line(H.snap(lon2, lat2))
d_top = proj_dist(line, *malla_ll("Quirio", 1)) + 60
d_bot = line.length - 350
step = (d_bot - d_top) / 16
positions["Quirio"] = [point_at(line, d_top + step * k) for k in range(17)]
methods["Quirio"] = (f"17 diques equiespaciados (~{step:.0f} m) desde 60 m bajo la malla 1 hasta 350 m antes del Rímac "
                     "(zona urbana de desembocadura documentada); cauce derivado del DEM (D8).")


def best_channel_near(lon, lat, radius_cells=7, min_acc=40):
    r0, c0 = H.rc(lon, lat)
    best = None
    for r in range(r0 - radius_cells, r0 + radius_cells + 1):
        for c in range(c0 - radius_cells, c0 + radius_cells + 1):
            if H.inside(r, c) and min_acc <= H.acc[r, c] < 1500:
                if best is None or H.acc[r, c] > H.acc[best]:
                    best = (r, c)
    return best


# Ampliaciones sin coordenadas: ubicación inferida del orden de listado del IT 039-2024-MAHR (margen izquierda:
# … Mariscal Castilla, Cárcavas Virgen del Rosario, Santo Domingo …; margen derecha: … Yanacoto, Chacrasana, San Alberto,
# Huampaní …). Confianza baja.
vr_center = (-76.6878, -11.9410)  # entre Mariscal Castilla y Santo Domingo, ladera sobre Av. El Rosario
ch_center = (-76.7470, -11.9500)  # entre Yanacoto y Huampaní, margen derecha
for wname, center, n, spacing in (("Virgen del Rosario", vr_center, 22, 40), ("Chacrasana", ch_center, 5, 45)):
    start = best_channel_near(*center)
    line, _ = channel_line(start, up_cells=40)
    L = line.length
    first = max(0.0, (L * 0.35) - spacing * n / 2)
    positions[wname] = [point_at(line, first + spacing * k) for k in range(n)]
    methods[wname] = (f"Ubicación NO documentada. Quebrada inferida por el orden de listado del IT 039-2024-MAHR; {n} diques cada "
                      f"{spacing} m sobre el cauce más cercano derivado del DEM. Confianza baja: verificar en campo.")

# ─────────────────────────── inspecciones de referencia (F-01 / F-02 / F-09) ───────────────────────────
def ref(d, c, a, phys, access="Sin observación", access_notes=None, notes=""):
    return dict(d=d, c=c, a=a, physical=phys, access=access, access_notes=access_notes, notes=notes)


REF: dict[tuple[str, int], dict] = {}
DIFICIL = "Dificultad de acceso: no fue posible inspeccionar de cerca (F-01)"
REF[("Carossio", 1)] = ref(0, 2, 1, "Operativo", notes="Buen estado, sin daños superficiales; cerca de su capacidad máxima; material suelto y piedras en zona de contención (Acta 01 p.5).")
for n in (2, 3, 4):
    REF[("Carossio", n)] = ref(0, 1, 1, "Operativo", "Difícil", DIFICIL,
                               "Contado en buen estado (Cuadro 2); no inspeccionado de cerca; material suelto y rocas próximos (Acta 01 p.6). C estimado por el Cuadro 3 (2 de 4 colmatados).")
lib = {1: ref(2, 1, 0, "Deteriorado", notes="Buen estado del cuerpo, pero brecha de ~2 m sin contención que deja pasar rocas; zona usada como botadero. D=2 INFERIDO como el 2.° deteriorado del Cuadro 2."),
       2: ref(0, 1, 0, "Operativo", notes="Buen estado; vegetación en cantidad adecuada."),
       3: ref(0, 1, 0, "Operativo", notes="Buen estado; material suelto en baja cantidad; sacos de arena laterales; altura posiblemente insuficiente."),
       4: ref(0, 2, 1, "Operativo", notes="Buen estado; material suelto elevado; altura insuficiente; la malla aguas arriba contendría rocas grandes."),
       5: ref(0, 2, 0, "Operativo", notes="Buen estado; material suelto elevado; altura insuficiente."),
       6: ref(1, 2, 1, "Operativo", notes="Cuerpo en buen estado; socavación leve en la plataforma; material elevado."),
       7: ref(2, 2, 0, "Deteriorado", notes="Cuerpo de apoyo aguas abajo deteriorado; material elevado."),
       8: ref(0, 3, 0, "Operativo", notes="Buen estado; zona de contención llena, sin capacidad."),
       9: ref(0, 3, 0, "Operativo", notes="Buen estado; zona de contención llena, sin capacidad.")}
for n in (10, 11, 12):
    lib[n] = ref(0, 2, 1, "Operativo", "Difícil", DIFICIL,
                 "No inspeccionado de cerca; material suelto en laderas (Acta 01 p.18). D y C INFERIDOS de los Cuadros 2 y 3 (9 colmatados: 4–12).")
for n, v in lib.items():
    REF[("Libertad", n)] = v
for n in range(1, 20):
    if n in (9, 10, 15, 16, 18, 19):
        laderas = n in (9, 10, 18, 19)
        REF[("Pedregal", n)] = ref(0, 0, 1 if laderas else 0, "Operativo",
                                   notes="Buen estado, sin material retenido" + ("; material suelto con rocas en laderas colindantes" if laderas else "") + " (Acta 01 p.21).")
    else:
        REF[("Pedregal", n)] = ref(3, 3, 0, "Crítico", notes="En máxima capacidad de retención; sin capacidad de contención; destruido parcial o totalmente (Acta 01 p.21).")
for n in range(1, 18):
    if n in (1, 4, 5):
        REF[("Quirio", n)] = ref(1, 2, 1, "Operativo", notes="Cuerpo en buen estado con deterioro superficial; sedimentos laterales aguas arriba; poca capacidad (Acta 02 p.2).")
    elif n in (2, 3, 6):
        REF[("Quirio", n)] = ref(2, 2, 1, "Deteriorado", notes="Mal estado: cuerpo de apoyo aguas abajo deteriorado; sedimentos laterales; poca capacidad (Acta 02 p.2).")
    else:
        extra = {10: (2, " Muro de encauzamiento contiguo con apertura grande en la cimentación (riesgo de estabilidad)."),
                 11: (2, " Viviendas en la base de un cerro con sedimentos y rocas en la ladera, sin obras de protección.")}.get(n, (1, ""))
        REF[("Quirio", n)] = ref(3, 2, extra[0], "Crítico",
                                 notes="Sin capacidad de contención; destruido parcial o totalmente (Acta 02 p.2)." + extra[1] + " C no individualizado en la fuente (estimado).")
for n in range(1, 23):
    REF[("Virgen del Rosario", n)] = ref(2, 2, 1, "Deteriorado", notes="F-02: los 22 diques en mal estado; colmatación; sacos de arena colocados como medida provisional (IVC 005-2026, Tablas 02–04). Valores individuales estimados.")
for n in range(1, 6):
    REF[("Chacrasana", n)] = ref(2, 2, 1, "Deteriorado", notes="F-02: los 5 diques en mal estado; fisuras, pérdida de material, socavación en la base y acumulación de rocas (IVC 005-2026). Valores individuales estimados.")

INSPECTED_AT = {"Carossio": "2024-12-10T10:30:00-05:00", "Libertad": "2024-12-10T12:00:00-05:00",
                "Pedregal": "2024-12-10T14:00:00-05:00", "Quirio": "2024-12-11T10:30:00-05:00",
                "Virgen del Rosario": "2026-02-23T10:00:00-05:00", "Chacrasana": "2026-02-26T10:00:00-05:00"}
PREFIX = {"Carossio": "CAR", "Libertad": "LIB", "Pedregal": "PED", "Quirio": "QUI", "Virgen del Rosario": "VRO", "Chacrasana": "CHA"}

# ─────────────────────────── exposición (N = V × H) ───────────────────────────
osm = json.load(open(HERE / "cache" / "osm_buildings.json", encoding="utf-8"))
bpolys = []
for el in osm["elements"]:
    g = el.get("geometry")
    if not g or len(g) < 4:
        continue
    try:
        poly = Polygon([to_utm.transform(p["lon"], p["lat"]) for p in g])
        if poly.is_valid and poly.area >= 20:  # descarta casetas < 20 m²
            bpolys.append(poly)
    except Exception:
        pass
tree = STRtree(bpolys)
OCCUPANCY = 0.85  # SUPUESTO: fracción de edificaciones presumiblemente ocupadas (reemplazar con dato censal por manzana)
H_MED, H_LOW = 3.58, 2.76  # INEI/GeoPerú personas/hogar; CENEPRED Vizcachera personas/predio


def corridor_and_zone(lon, lat):
    rc = H.snap(lon, lat, radius_cells=2)
    path = H.trace_down(*rc, stop_acc=RIVER_ACC)
    line = LineString(cells_to_utm(path)) if len(path) > 1 else LineString(cells_to_utm([rc, rc]))
    L = line.length
    split = max(0.0, L - 400)
    upper = LineString([line.interpolate(d) for d in [i * 20 for i in range(int(split // 20) + 1)]]) if split > 40 else None
    lower = LineString([line.interpolate(d) for d in [split + i * 20 for i in range(int((L - split) // 20) + 1)] + [L]])
    parts = [lower.buffer(70)]
    if upper is not None:
        parts.append(upper.buffer(35))
    zone = unary_union(parts).simplify(5)
    return line, zone


def exposure_for(zone):
    hits = [bpolys[i] for i in tree.query(zone) if bpolys[i].intersects(zone)]
    b = len(hits)
    v = round(b * OCCUPANCY)
    return dict(buildings=b, V=v, H=H_MED, N=round(v * H_MED, 1), low=round(v * H_LOW, 1), high=round(b * H_MED, 1))


def to_wgs_geom(g):
    return shp_transform(lambda x, y, z=None: to_wgs.transform(x, y), g)


# ─────────────────────────── ensamblar estructuras ───────────────────────────
structures = []
for wname, pts in positions.items():
    baseline = wname in ("Carossio", "Libertad", "Pedregal", "Quirio")
    for i, (lon, lat) in enumerate(pts, start=1):
        line, zone = corridor_and_zone(lon, lat)
        exp = exposure_for(zone)
        r = REF[(wname, i)]
        elev = float(H.dem[H.rc(lon, lat)])
        src_ref = (f"F-01 IVC 031-2024-OCI/2157-SVC, dique n.° {i} de la quebrada {wname}" if baseline
                   else f"F-02 IVC 005-2026-OCI/2157-SVC (cifras de IVC 034-2025), dique {i} de {len(pts)} (numeración de trabajo)")
        structures.append({
            "workingId": f"REG-{'2024' if baseline else '2026'}-{PREFIX[wname]}-{i:02d}",
            "name": f"Dique {i} — Quebrada {wname}",
            "structureType": "dique_transversal",
            "material": "por_verificar",
            "watershed": wname,
            "originInventory": "linea_base_2024" if baseline else "ampliacion",
            "sourceNumber": i,
            "sourceReference": src_ref,
            "reconciliationStatus": "individualizado" if baseline else "por_conciliar",
            "location": {"lat": round(lat, 6), "lon": round(lon, 6), "confidence": "provisional", "label": "Estimado",
                         "method": methods[wname], "source": "DEM Copernicus GLO-30 + mallas documentadas IT 039-2024-MAHR",
                         "date": TODAY, "precisionM": 150 if baseline else 1000, "crsOriginal": "EPSG:4326",
                         "responsible": "Estimación automática (tools/geodata/estimate.py)"},
            "elevationM": round(elev, 1),
            "inspection": {"inspectedAt": INSPECTED_AT[wname], **r,
                           "sourceReference": ("F-01 Actas 01-02-2024-OCI-2157-SVC" if baseline else "F-02 IVC 005-2026-OCI/2157-SVC")},
            "exposure": {**exp, "polygon": mapping(to_wgs_geom(zone))},
            "scenario": {"corridor": mapping(to_wgs_geom(line)), "zone": mapping(to_wgs_geom(zone)), "lengthM": round(line.length)},
        })

# La Ronda: 2 barreras dinámicas con coordenadas DOCUMENTADAS (IT 039-2024-MAHR). Inferido: corresponden a las
# "2 estructuras" referidas en el paquete v1.0 para La Ronda.
for n in (1, 2):
    lon, lat = malla_ll("La Ronda", n)
    estado = [m[4] for m in MALLAS if m[0] == "La Ronda" and m[1] == n][0]
    line, zone = corridor_and_zone(lon, lat)
    exp = exposure_for(zone)
    structures.append({
        "workingId": f"REG-2026-LRO-{n:02d}",
        "name": f"Barrera dinámica {n} — Quebrada La Ronda",
        "structureType": "barrera_dinamica", "material": "malla_metalica", "watershed": "La Ronda",
        "originInventory": "ampliacion", "sourceNumber": n,
        "sourceReference": "IT 039-2024-MAHR (en F-01 p.3, Imagen 3); paquete v1.0 refiere 2 estructuras en La Ronda (ANA 04-03-2026, no localizado)",
        "reconciliationStatus": "individualizado",
        "location": {"lat": round(lat, 6), "lon": round(lon, 6), "confidence": "aproximada", "label": "Documentado",
                     "method": "Coordenadas UTM del IT 039-2024-MAHR convertidas de EPSG:32718 (CRS inferido) a WGS84",
                     "source": "IT 039-2024-MAHR, Subgerencia de Defensa Civil, 07-08-2024", "date": "2024-08-07",
                     "precisionM": 30, "crsOriginal": "EPSG:32718 (inferido)", "responsible": "Municipalidad (fuente)"},
        "elevationM": round(float(H.dem[H.rc(lon, lat)]), 1),
        "inspection": {"inspectedAt": "2024-08-07T10:00:00-05:00",
                       **ref(0, 2, 0, "Operativo", notes=f"Estado reportado: {estado} (IT 039-2024-MAHR). D y A no reportados; asignados 0 (estimado)."),
                       "sourceReference": "IT 039-2024-MAHR"},
        "exposure": {**exp, "polygon": mapping(to_wgs_geom(zone))},
        "scenario": {"corridor": mapping(to_wgs_geom(line)), "zone": mapping(to_wgs_geom(zone)), "lengthM": round(line.length)},
    })

# ─────────────────────────── capas de referencia ───────────────────────────
ref_features = []
for q, n, e, no, estado in MALLAS:
    lon, lat = to_wgs.transform(e, no)
    ref_features.append({"type": "Feature", "geometry": {"type": "Point", "coordinates": [round(lon, 6), round(lat, 6)]},
                         "properties": {"layer": "mallas_documentadas", "name": f"Malla dinámica {n} — {q}", "estado": estado,
                                        "label": "Documentado", "source": "IT 039-2024-MAHR (F-01 p.3)"}})
for wname in positions:
    pts = positions[wname]
    lon, lat = pts[0]
    line, _ = channel_line(H.snap(lon, lat, 2), up_cells=60)
    ref_features.append({"type": "Feature", "geometry": mapping(to_wgs_geom(line.simplify(10))),
                         "properties": {"layer": "cauces_estimados", "name": f"Cauce estimado — {wname}", "label": "Estimado",
                                        "source": "DEM Copernicus GLO-30, flujo D8"}})

seed = {
    "generatedAt": TODAY,
    "notes": "Datos semilla. Ubicaciones de diques ESTIMADAS (salvo La Ronda); inspecciones de referencia derivadas de los informes "
             "de Contraloría con D/C/A estimados de su descripción; exposición estimada V×H con edificaciones OSM.",
    "exposureMethod": {"occupancy": OCCUPANCY, "H": H_MED, "H_low": H_LOW,
                       "description": "Polígono = corredor aguas abajo por relieve (D8) con 35 m a cada lado y 70 m en los últimos 400 m "
                                      "(zona de abanico/urbana). V = edificaciones OSM ≥ 20 m² que intersectan × 0.85 (supuesto de ocupación). "
                                      "H = 3.58 personas/hogar (INEI/GeoPerú 2017); rango bajo con 2.76 personas/predio (CENEPRED Vizcachera); "
                                      "rango alto con todas las edificaciones × 3.58."},
    "baseCentral": {"name": "Municipalidad Distrital de Lurigancho, Jr. Trujillo Sur 498 (ubicación estimada)",
                    "lat": -11.93720, "lon": -76.69710,
                    "source": "Dirección del oficio 000227-2024-CG/OC2157 (F-01); coordenada estimada cerca de la Plaza de Armas de Chosica"},
    "structures": structures,
    "referenceLayers": {"type": "FeatureCollection", "features": ref_features},
}
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps(seed, ensure_ascii=False), encoding="utf-8")
by = {}
for s in structures:
    by.setdefault(s["watershed"], []).append(s["exposure"]["N"])
print(f"{len(structures)} estructuras -> {OUT}")
for k, v in by.items():
    print(f"  {k:20} n={len(v):2}  N min={min(v):7.1f}  max={max(v):7.1f}")
