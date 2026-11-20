"""Análisis hidrológico simple sobre un DEM (Copernicus GLO-30).

Método (documentado para revisión técnica):
1. Relleno de depresiones con "priority-flood" (Barnes et al., 2014) más un incremento mínimo
   para que todo el terreno drene hacia el borde.
2. Dirección de flujo D8: cada celda drena hacia la vecina de mayor pendiente descendente.
3. Acumulación de flujo: número de celdas aguas arriba de cada celda.
4. Trazado aguas abajo siguiendo D8 desde un punto (corredor hipotético por relieve).

Limitaciones: resolución de ~30 m (insuficiente para quebradas angostas), el DEM es de superficie
(incluye edificaciones), y D8 da un único camino. Es una estimación geográfica, no un modelo hidráulico.
"""
from __future__ import annotations

import heapq
import math

import numpy as np
import rasterio

# Vecinos D8: (dfila, dcol)
OFFS = [(-1, 0), (-1, 1), (0, 1), (1, 1), (1, 0), (1, -1), (0, -1), (-1, -1)]


class Hydro:
    def __init__(self, dem_path: str):
        with rasterio.open(dem_path) as src:
            self.dem = src.read(1).astype("float64")
            self.transform = src.transform
        self.h, self.w = self.dem.shape
        lat0 = self.transform.f + self.transform.e * self.h / 2
        self.dx = abs(self.transform.a) * 111320 * math.cos(math.radians(lat0))
        self.dy = abs(self.transform.e) * 110540
        self.filled = self._fill()
        self.fdir = self._d8()
        self.acc = self._accumulate()

    # ── conversión de coordenadas ──
    def rc(self, lon: float, lat: float) -> tuple[int, int]:
        c = int((lon - self.transform.c) / self.transform.a)
        r = int((lat - self.transform.f) / self.transform.e)
        return r, c

    def lonlat(self, r: int, c: int) -> tuple[float, float]:
        return (self.transform.c + (c + 0.5) * self.transform.a, self.transform.f + (r + 0.5) * self.transform.e)

    def inside(self, r: int, c: int) -> bool:
        return 0 <= r < self.h and 0 <= c < self.w

    # ── algoritmo ──
    def _fill(self) -> np.ndarray:
        dem = self.dem
        out = dem.copy()
        seen = np.zeros(dem.shape, bool)
        pq: list[tuple[float, int, int]] = []
        for r in range(self.h):
            for c in (0, self.w - 1):
                heapq.heappush(pq, (dem[r, c], r, c)); seen[r, c] = True
        for c in range(self.w):
            for r in (0, self.h - 1):
                if not seen[r, c]:
                    heapq.heappush(pq, (dem[r, c], r, c)); seen[r, c] = True
        eps = 1e-4
        while pq:
            z, r, c = heapq.heappop(pq)
            for dr, dc in OFFS:
                rr, cc = r + dr, c + dc
                if 0 <= rr < self.h and 0 <= cc < self.w and not seen[rr, cc]:
                    seen[rr, cc] = True
                    out[rr, cc] = max(dem[rr, cc], z + eps)
                    heapq.heappush(pq, (out[rr, cc], rr, cc))
        return out

    def _d8(self) -> np.ndarray:
        z = self.filled
        fdir = np.full(z.shape, -1, np.int8)
        best = np.zeros(z.shape)
        for k, (dr, dc) in enumerate(OFFS):
            dist = math.hypot(dr * self.dy, dc * self.dx)
            shifted = np.full(z.shape, np.inf)
            rs = slice(max(dr, 0), self.h + min(dr, 0)); rd = slice(max(-dr, 0), self.h + min(-dr, 0))
            cs = slice(max(dc, 0), self.w + min(dc, 0)); cd = slice(max(-dc, 0), self.w + min(-dc, 0))
            shifted[rd, cd] = z[rs, cs]
            slope = (z - shifted) / dist
            better = slope > best
            best[better] = slope[better]
            fdir[better] = k
        return fdir

    def _accumulate(self) -> np.ndarray:
        acc = np.ones(self.dem.shape)
        order = np.argsort(-self.filled, axis=None)  # de más alto a más bajo
        for idx in order:
            r, c = divmod(int(idx), self.w)
            k = self.fdir[r, c]
            if k < 0:
                continue
            rr, cc = r + OFFS[k][0], c + OFFS[k][1]
            if self.inside(rr, cc):
                acc[rr, cc] += acc[r, c]
        return acc

    # ── utilidades ──
    def snap(self, lon: float, lat: float, radius_cells: int = 3) -> tuple[int, int]:
        """Ajusta un punto a la celda de mayor acumulación en su entorno (el cauce)."""
        r0, c0 = self.rc(lon, lat)
        best = (r0, c0)
        for r in range(r0 - radius_cells, r0 + radius_cells + 1):
            for c in range(c0 - radius_cells, c0 + radius_cells + 1):
                if self.inside(r, c) and self.acc[r, c] > self.acc[best]:
                    best = (r, c)
        return best

    def trace_down(self, r: int, c: int, max_steps: int = 2000, stop_acc: float | None = None) -> list[tuple[int, int]]:
        path = [(r, c)]
        for _ in range(max_steps):
            k = self.fdir[r, c]
            if k < 0:
                break
            r, c = r + OFFS[k][0], c + OFFS[k][1]
            if not self.inside(r, c):
                break
            # Confluencia con un cauce mucho mayor (el Rímac): el corredor de la quebrada termina ahí.
            prev = self.acc[path[-1]]
            path.append((r, c))
            if stop_acc and (self.acc[r, c] >= stop_acc or (self.acc[r, c] > 4000 and self.acc[r, c] > 2.5 * prev)):
                break
        return path

    def trace_up(self, r: int, c: int, steps: int) -> list[tuple[int, int]]:
        """Sube por el cauce principal (vecino aguas arriba con mayor acumulación)."""
        path = [(r, c)]
        for _ in range(steps):
            best = None
            for k, (dr, dc) in enumerate(OFFS):
                rr, cc = r + dr, c + dc
                if not self.inside(rr, cc):
                    continue
                kk = self.fdir[rr, cc]
                if kk >= 0 and rr + OFFS[kk][0] == r and cc + OFFS[kk][1] == c:
                    if best is None or self.acc[rr, cc] > self.acc[best]:
                        best = (rr, cc)
            if best is None or self.acc[best] < 30:
                break
            r, c = best
            path.append((r, c))
        return path

    def path_length_m(self, path: list[tuple[int, int]]) -> list[float]:
        out = [0.0]
        for (r1, c1), (r2, c2) in zip(path, path[1:]):
            out.append(out[-1] + math.hypot((r2 - r1) * self.dy, (c2 - c1) * self.dx))
        return out
