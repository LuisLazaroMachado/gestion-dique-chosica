# Diccionario de datos

| Entidad/campo | Tipo lógico | Obligatorio | Regla | Finalidad |
|---|---|---|---|---|
| Estructura.id | UUID | Sí | Inmutable | ID interno |
| Estructura.codigo | Texto | Sí | Único, permanente, no reutilizable | Código visible |
| Estructura.nombre | Texto | Sí | Oficial o nombre de trabajo identificado | Consulta |
| Estructura.tipo | Catálogo | Sí | Concreto/mampostería/gaviones/barrera dinámica/otro | Adaptar inspección |
| Estructura.quebrada | Catálogo/texto | Sí | Catálogo territorial | Agrupar |
| Estructura.geometría | Punto espacial | Al validar | EPSG:4326 para intercambio | Mapa |
| Estructura.confianza_ubicación | Catálogo | Sí | Verificada/aproximada/provisional | Calidad |
| Inspección.id | UUID | Sí | Inmutable | ID |
| Inspección.estructura_id | FK | Sí | Estructura existente | Relación |
| Inspección.inspector_id | FK | Sí | Usuario autorizado | Responsabilidad |
| Inspección.fecha_hora | Timestamp | Sí | Guardar zona horaria/UTC | Cronología |
| Inspección.D/C/A | Entero | Sí para P | Cada uno 0–3 | Indicadores |
| Inspección.estado_físico | Catálogo | Sí | 4 estados aprobados | Condición |
| Inspección.acceso | Catálogo | Sí | Sin observación/Difícil/Restringido/No determinado | Logística |
| Inspección.observaciones | Texto | No | Motivo si dato no determinado | Contexto |
| Evidencia.uri | URI | Sí | Privada | Foto/documento |
| Evidencia.tipo | Catálogo | Sí | General/colmatación/daño/proceso/acceso/intervención | Clasificación |
| Exposición.V | Número | Sí para estimar N | Viviendas ocupadas/presumidas | Base N |
| Exposición.H | Decimal | Sí para estimar N | Fuente documentada | Ocupación |
| Exposición.N | Número | Sí para P | V×H o dato oficial directo | Exposición |
| Prioridad.E/X/P | Decimal | Calculado | Fórmula aprobada | Puntaje |
| Intervención.tipo | Texto/catálogo | Sí | Clase de trabajo | Historial |
| Intervención.estado | Catálogo | Sí | Estados aprobados | Seguimiento |
| Auditoría.actor/fecha/motivo | FK/timestamp/texto | Sí | No editable | Trazabilidad |

Fechas almacenadas en UTC y mostradas en hora local. Exposición y coordenadas guardan fuente, método, fecha y confianza. Resultados guardan versión de fórmula y entradas. Historial no se elimina físicamente en operaciones ordinarias.
