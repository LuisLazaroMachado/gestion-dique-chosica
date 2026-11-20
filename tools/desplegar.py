"""Publica la última versión de main en Render (API y web) y espera a que queden en línea.

Render toma el repositorio público por URL, sin conexión con GitHub, así que no se entera solo de los
commits nuevos: hay que pedirle el despliegue. Requiere RENDER_API_KEY en .env.

Uso (desde la raíz del repo):  py tools/desplegar.py
"""
import json
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
env = dict(l.strip().split("=", 1) for l in open(ROOT / ".env", encoding="utf-8") if "=" in l and not l.lstrip().startswith("#"))
H = {"Authorization": f"Bearer {env['RENDER_API_KEY']}", "Accept": "application/json", "Content-Type": "application/json"}
SERVICES = {"priori-dique-api": None, "priori-dique-web": None}


def call(method, path, body=None):
    req = urllib.request.Request("https://api.render.com/v1" + path, method=method, headers=H,
                                 data=json.dumps(body).encode() if body is not None else None)
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read() or b"null")


for item in call("GET", "/services?limit=50"):
    s = item["service"]
    if s["name"] in SERVICES:
        SERVICES[s["name"]] = s["id"]
missing = [n for n, i in SERVICES.items() if not i]
if missing:
    sys.exit(f"No se encontraron los servicios: {missing}")

deploys = {}
for name, sid in SERVICES.items():
    d = call("POST", f"/services/{sid}/deploys", {"clearCache": "do_not_clear"})
    deploys[name] = d["id"]
    print(f"{name}: despliegue {d['id']} iniciado")

final = {"live", "build_failed", "update_failed", "canceled", "deactivated"}
while True:
    status = {n: call("GET", f"/services/{SERVICES[n]}/deploys/{did}")["status"] for n, did in deploys.items()}
    print(time.strftime("%H:%M:%S"), status, flush=True)
    if all(s in final for s in status.values()):
        break
    time.sleep(20)
sys.exit(0 if all(s == "live" for s in status.values()) else 1)
