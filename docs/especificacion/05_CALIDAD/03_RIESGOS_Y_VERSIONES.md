# Riesgos, pendientes y versiones

| ID | Riesgo | Tratamiento |
|---|---|---|
| R1 | Coordenadas erróneas | Fuente, confianza y validación |
| R2 | Duplicados | Conciliación física/nombres |
| R3 | Escalas ambiguas | Validación por tipología |
| R4 | Exposición sesgada | Polígonos, ocupación y rangos |
| R5 | Nmax cambia | Versionar y explicar recálculo |
| R6 | Pérdida offline | Idempotencia, reintentos y pruebas |
| R7 | Ruteo no apto para maquinaria | Revisión humana/restricciones |
| R8 | Simulación interpretada como predicción | Etiquetas y validación |
| R9 | Exposición de datos personales | Minimización y permisos |
| R10 | Falta de operación/mantenimiento TI | Backups, monitoreo y responsable |

## Pendientes prioritarios
1. Conciliar los 52 diques.
2. Individualizar adicionales y evitar duplicados.
3. Verificar coordenadas.
4. Validar D/C/A por tipo.
5. Delimitar polígonos y población.
6. Definir proveedor cloud/cartográfico.
7. Revisar privacidad y seguridad institucional.
8. Implementar prototipo y pruebas de campo.
9. Validar nivel de simulación.

## Versiones
| Versión | Fecha | Cambio |
|---|---|---|
| 1.0 | 19-11-2026 | Consolidación de especificaciones y acuerdos |
| 1.1 | 19-11-2026 | Aclaraciones de implementación (ver `02_DECISIONES_APROBADAS.md`), hallazgos de fuentes primarias y paquete movido a `docs/especificacion/`. Autor: Claude por encargo del equipo. Impacto: ninguno sobre fórmula, estados, roles ni alcance. |
| 1.2 | 20-11-2026 | Implementación: API, base de datos, web, app móvil, datos semilla estimados y despliegue. Decisiones registradas en `00_TRANSFERENCIA/04_DECISIONES_DE_IMPLEMENTACION.md` (las marcadas ⚠ requieren revisión). Autor: Claude por encargo del equipo. Impacto: ninguno sobre fórmula, estados, roles ni alcance. |
| 1.2.1 | 20-11-2026 | El equipo aprueba `04_DECISIONES_DE_IMPLEMENTACION.md` (código PDC-NNNN, urgencia Normal/Atención/Urgente, uso de datos estimados etiquetados). Validación técnica por especialista sigue pendiente. |
| 1.3 | 20-11-2026 | Acceso de maquinaria en la inspección, reportes PDF/Excel, simulador con varios diques, interfaz en lenguaje simple y códigos de personal (aprobados por el equipo). Ver `04_DECISIONES_DE_IMPLEMENTACION.md` sección 9. |

Cambios futuros requieren motivo, impacto, autor, fecha y actualización de documentos afectados.
