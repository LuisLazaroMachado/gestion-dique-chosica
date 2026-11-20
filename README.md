# Priori Dique Chosica

Sistema de información geográfica y gestión operativa para inspeccionar diques y otras estructuras de protección en Lurigancho-Chosica, priorizar su atención y planificar intervenciones. Equipo Los Antihuaicos — Challenge for Change UPC 2026.

> Herramienta de apoyo a la decisión humana. No certifica seguridad estructural, no emite alertas oficiales y su visualizador de escenarios no es una predicción hidráulica.

## En línea

| Componente | Dirección |
|---|---|
| Web (responsable de planificación / administrador) | https://priori-dique-web.onrender.com |
| API | https://priori-dique-api.onrender.com (salud: `/health`) |
| App móvil (inspector, Android) | APK generado en `apps/mobile` (ver más abajo) |

Las credenciales iniciales se generan al hacer la carga inicial y se guardan **solo en tu PC**, en `credenciales-nube.txt` (nube) y `credenciales-iniciales.txt` (local). Git ignora ambos archivos.

**Plan gratuito:** la API de Render se "duerme" tras 15 minutos sin uso; la primera carga tarda cerca de 1 minuto. Supabase pausa el proyecto tras 7 días sin actividad; el flujo `.github/workflows/mantener-activo.yml` lo consulta a diario para evitarlo.

## Estructura

```
apps/api        API REST (Node.js + Fastify + TypeScript), migraciones SQL y carga inicial
apps/web        Web del responsable (React + Mantine + MapLibre)
apps/mobile     App Android del inspector (Expo SDK 53, offline con SQLite)
packages/shared Fórmula de prioridad, catálogos aprobados y validaciones (compartido API/web)
tools/geodata   Estimación geográfica en Python: cauces (DEM), ubicación estimada, exposición
docs/           Especificación oficial (paquete v1.1) y documentación técnica
infra/          Docker Compose para desarrollo local (PostgreSQL + PostGIS)
```

## Desarrollo local

Requisitos: Node 22, Docker Desktop.

```bash
npm install
npm run db:up                                   # PostGIS en localhost:5433
cp .env.example .env.local                      # valores locales (ya funcionan con Docker)
cd apps/api
ENV_FILE=.env.local npm run migrate             # crea las tablas
ENV_FILE=.env.local npm run seed                # carga 81 estructuras y crea usuarios
ENV_FILE=.env.local npm run dev                 # API en http://localhost:3000
# en otra terminal
npm run dev -w apps/web                         # web en http://localhost:5173
```

Pruebas: `npm test` (unitarias de la fórmula e integración de la API contra la base `dique_test`; ver `.env.test` en `apps/api/vitest.config.ts`).

## App móvil (APK)

```bash
cd apps/mobile
npm install
npx expo prebuild -p android
cd android
# Requiere JDK 17 (no 21/25) y el SDK de Android
set JAVA_HOME=C:\Users\PC\.jdks\jdk-17.0.21+9
gradlew assembleRelease
# APK: android/app/build/outputs/apk/release/app-release.apk
```

La app apunta por defecto a la API en la nube. Para probar con una API local, en la pantalla de inicio de sesión toca **Configurar servidor** y usa la IP de la computadora (p. ej. `http://192.168.1.48:3000`).

## Despliegue

- **Base de datos y fotos:** Supabase (PostgreSQL 17 + PostGIS 3.3, Storage S3 privado). Migraciones: `cd apps/api && npm run migrate` (usa `.env`).
- **API y web:** Render (plan gratuito), desplegadas automáticamente en cada `git push` a `main`.
- Todo es estándar (PostgreSQL, S3, Node, sitio estático): se puede migrar a un hosting de pago o municipal sin reescribir.

## Calidad de los datos

Cada dato lleva su etiqueta: **Documentado** (fuente identificable), **Estimado** (método explícito), **Provisional** o **Hipotético**. Hoy:

- Los 52 diques de la línea base están **individualizados** según el informe 031-2024-OCI/2157-SVC, pero su **ubicación es estimada** (el informe no da coordenadas).
- Las 2 barreras de La Ronda tienen coordenadas **documentadas** (IT 039-2024-MAHR).
- Virgen del Rosario (22) y Chacrasana (5) tienen ubicación estimada con **confianza baja**.
- La exposición (N) está estimada con edificaciones de OpenStreetMap (V × H).

Detalle: `docs/especificacion/01_INVESTIGACION/07_HALLAZGOS_FUENTES_PRIMARIAS.md` y `docs/especificacion/00_TRANSFERENCIA/02_DECISIONES_APROBADAS.md`. Para reemplazar un dato estimado, edítalo desde la ficha de la estructura en la web: el cambio queda auditado.
