# Decisiones de implementación (v1.2, 19–20-11-2026)

Decisiones tomadas por Claude al construir el sistema, dentro de lo autorizado por el equipo ("tú decides la arquitectura; si falta un dato, estímalo y etiquétalo"). **No cambian la fórmula, los estados, los roles ni el alcance.** Las marcadas con ⚠ requieren revisión del equipo o de un especialista.

## 1. Arquitectura y tecnología
| Pieza | Elección | Motivo |
|---|---|---|
| Lenguaje | TypeScript (API, web) y TypeScript/React Native (móvil) | Un solo lenguaje; fórmula y validaciones compartidas (`packages/shared`) |
| API | Node.js 22 + Fastify 5, consultas SQL parametrizadas (`postgres`) | Ligera; SQL explícito y legible |
| Base de datos | PostgreSQL 17 + PostGIS 3.3 (Supabase en la nube; Docker en local) | Aprobado en el paquete |
| Fotos | Almacenamiento S3 privado (Supabase Storage); disco local en desarrollo | Estándar, migrable |
| Web | React 19 + Mantine 7 + MapLibre 5 (mapas base libres) | Sin licencias de mapas |
| Móvil | Expo SDK 53 (React Native 0.79), SQLite local, solo Android | Offline real; APK sin tienda |
| Hosting | Render (API y web, gratuito) + Supabase (gratuito) | Presupuesto US$0; funciona sin la PC del equipo |
| Ruteo | Orden por vecino más cercano + mejora 2-opt; geometría vial con openrouteservice (`driving-hgv`) si hay clave `ORS_API_KEY`; si no, tramos rectos con advertencia | Proveedor desacoplado (riesgo R7) |

## 2. Inventario
- **Código permanente provisional:** `PDC-NNNN`, secuencial, nunca reutilizado (secuencia de la base; sin borrado físico). ⚠ El formato definitivo se aprobará tras la conciliación física.
- **ID de trabajo:** `REG-2024-QQQ-NN` (línea base) y `REG-2026-QQQ-NN` (ampliaciones), únicos (corrige los ID repetidos de v1.0).
- **Mallas dinámicas:** las 12 mallas de la línea base y las 10 de otras quebradas se muestran como **capa de referencia documentada**, no como estructuras priorizadas, para no alterar la línea base de 52 diques. La excepción son las **2 barreras de La Ronda**, que se registran como ampliación porque el paquete v1.0 ya refería "2 estructuras" en La Ronda. ⚠ Esa correspondencia es una inferencia.

## 3. Ubicación estimada de los diques ⚠
El informe 031-2024 no da coordenadas. Método (en `tools/geodata/estimate.py`):
1. Relieve Copernicus GLO-30 (~30 m); cauces por flujo D8.
2. Anclas documentadas: coordenadas UTM de las mallas (IT 039-2024-MAHR). CRS inferido: EPSG:32718.
3. Cada dique se ubica sobre el cauce respetando el orden y las referencias de las Actas (por ejemplo, "dique 1 debajo de la malla 3" en Carossio). El sentido de la numeración cambia según la quebrada.
4. Etiqueta `Estimado`, confianza `provisional`, precisión ±150 m (línea base) y ±1000 m (Virgen del Rosario y Chacrasana).
- **Virgen del Rosario y Chacrasana:** sin coordenadas en ninguna fuente obtenida. La quebrada se infirió del orden de listado del IT 039-2024-MAHR, entre vecinas con coordenadas conocidas. **Confianza baja.**

## 4. Inspecciones de referencia ⚠
Para que el sistema funcione con datos reales desde el primer día, cada estructura tiene una **inspección de referencia** derivada de la descripción documentada (Contraloría F-01/F-02, municipalidad F-09), etiquetada `Estimado` y validada como registro de referencia. Criterio de conversión:

| Descripción en la fuente | D | C | A | Estado físico |
|---|---|---|---|---|
| "Destruido parcial o totalmente / sin capacidad de contención" | 3 | 3 (Pedregal: "máxima capacidad") o 2 (Quirio: no individualizado) | 0–2 según mención de procesos | Crítico |
| "Mal estado / cuerpo deteriorado" | 2 | 2 | 0–1 | Deteriorado |
| "Buen estado con deterioro superficial" | 1 | según material retenido | 0–1 | Operativo |
| "Buen estado" | 0 | 0 (sin material) · 1 (bajo) · 2 (elevado) · 3 (lleno) | 1 si hay material suelto en laderas | Operativo |
| No inspeccionado de cerca por acceso | inferido de los cuadros agregados | inferido | 1 | Operativo; acceso "Difícil" (documentado) |

Inferencias explícitas: el segundo dique deteriorado de Libertad sería el n.° 1 (brecha de 2 m); los colmatados de Libertad serían del 4 al 12 (cuadra con el Cuadro 3). **Deben reemplazarse por inspecciones de campo** con criterios D/C/A validados por tipología.

## 5. Exposición (N = V × H) ⚠
- Polígono: corredor aguas abajo por relieve (D8) desde el dique hasta el Rímac, con 35 m a cada lado y 70 m en los últimos 400 m (abanico o zona urbana). No se usan círculos.
- V: edificaciones de OpenStreetMap ≥ 20 m² que intersectan el polígono × **0,85** (supuesto de ocupación presumible; reemplazar por dato censal por manzana).
- H: 3,58 personas/hogar (INEI/GeoPerú 2017). Rango bajo con 2,76 (CENEPRED Vizcachera); rango alto con todas las edificaciones × 3,58.
- Etiqueta `Estimado`, confianza `baja`. Diques de una misma quebrada comparten gran parte del corredor; sus N no se suman.

## 6. Reglas operativas implementadas
- **Inspección usada para P:** la última **validada** de cada estructura. Sin D/C/A completos o sin N no hay P; la estructura aparece en "Sin cálculo" con el motivo.
- **Recálculo:** se genera un lote nuevo (inalterable) al validar o corregir una inspección validada, al cambiar N, al dar de alta o desactivar una estructura, o manualmente. Se guardan Nmax, la estructura que lo define, el tamaño del inventario y el motivo.
- **Estado físico de la estructura:** toma el de la última inspección validada. El estado de intervención toma el de la intervención más reciente. Son independientes.
- **Asignación:** se marca "completada" al registrar la inspección. El inspector puede seguir subiendo fotos y corrigiendo **su** inspección.
- **Empates exactos de P:** se señalan y el responsable registra una decisión justificada.
- **Urgencia operativa:** niveles `Normal / Atención / Urgente`, con justificación obligatoria; no altera P. ⚠ Catálogo nuevo, pendiente de aprobación.
- **Carga de fotos:** `/evidence/upload-url` devuelve una URL de carga temporal (15 min) hacia la propia API, que verifica el checksum SHA-256 y guarda en el almacenamiento privado. La descarga exige sesión y permiso.
- **Base central para rutas:** Municipalidad Distrital de Lurigancho, Jr. Trujillo Sur 498. Coordenada **estimada** cerca de la Plaza de Armas; editable en Configuración.
- **Seguridad en Supabase:** RLS activado y privilegios revocados para `anon` y `authenticated` (migración 003). Solo la API accede a la base.

## 7. Simulación (nivel A)
Corredor D8 desde la ubicación estimada del dique, con zona ampliada (35/70 m) y animación conceptual. No calcula profundidad, velocidad, caudal ni tiempo de llegada. Rotulado "Escenario hipotético — no es alerta oficial". Exportable en GeoJSON con parámetros y limitaciones.

## 8. Vacíos que siguen abiertos
1. Coordenadas verificadas en campo (GPS) de los 52 diques y de las ampliaciones.
2. Reporte de la ANA sobre La Ronda (04-03-2026) e informe 034-2025-OCI/2157-SVC: no obtenidos.
3. Criterios D/C/A por tipología validados por un especialista.
4. Viviendas ocupadas por polígono con dato censal o padrón.
5. Topografía de detalle para una simulación de nivel B o C.
6. Ubicación exacta de la base central y características de la maquinaria.
