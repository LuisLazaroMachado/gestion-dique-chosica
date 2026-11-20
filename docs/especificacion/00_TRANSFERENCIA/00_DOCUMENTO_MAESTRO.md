# Documento maestro — Priori Dique Chosica

## Objetivo
Sistema de información geográfica y gestión operativa para registrar inspecciones de diques y otras estructuras de protección, priorizar necesidades de atención y planificar intervenciones en Lurigancho-Chosica. Apoya la decisión humana; no certifica seguridad estructural ni emite alertas oficiales.

## Alcance
Incluye inventario escalable, asignaciones, inspección móvil offline, fotografías, validación, priorización, mapa, historial, planificación de rutas e intervenciones, auditoría y escenarios geográficos exploratorios.

No incluye procedimientos técnicos de mantenimiento/reparación, certificación estructural, alerta en tiempo real ni simulación hidráulica validada sin datos y calibración.

## Roles
- **Inspector:** registra inspecciones de estructuras asignadas, fotos, observaciones, GPS de evidencia cuando proceda; trabaja offline y sincroniza.
- **Responsable de planificación:** administra inventario, asignaciones, revisiones, mapa, prioridad, rutas, maquinaria, intervenciones y excepciones.
- **Especialista acompañante:** asesora evaluación física y queda identificado como verificador/participante cuando corresponda; no requiere necesariamente cuenta propia.
- **Administrador:** gestiona usuarios, catálogos y permisos. El sistema debe poder transferirse a administración municipal.

## Flujo
1. Registrar estructura con código permanente.
2. Responsable asigna estructura(s) a inspector.
3. Inspector descarga asignación.
4. Inspecciona en condiciones seguras y registra D, C, A, observaciones y fotos.
5. Guarda offline y sincroniza al recuperar conexión.
6. Responsable revisa y valida.
7. El sistema calcula prioridad solo con D, C y A completos y exposición disponible.
8. Responsable decide considerando puntaje, urgencia, acceso y recursos.
9. Registra intervención, ejecución y verificación.
10. Historial conserva todos los registros sin sobrescritura.

## Fórmula aprobada
\[
E_i=(D_i+C_i+A_i)/9,\quad X_i=N_i/N_{\max},\quad P_i=E_iX_i
\]
D = daño estructural; C = colmatación; A = proceso activo; cada uno 0–3. N_i = personas potencialmente afectadas por la estructura. N_max = mayor N entre las estructuras del inventario vigente. E, X y P están entre 0 y 1.

D, C y A deben estar completos para calcular P. Si falta uno, no calcular. Si N_max=0, X=0 y mostrar advertencia de datos de exposición. Al agregar estructuras o actualizar N, recalcular y conservar versión, fecha y entradas. La urgencia operativa es separada, justificada y no altera P.

## Estados
**Físico:** Operativo, Deteriorado, Crítico, En evaluación.  
**Intervención:** Sin intervención, Pendiente, Programada, En ejecución, Finalizada, Verificada, Observada.  
Son dimensiones independientes: finalizar un trabajo no convierte automáticamente la estructura en Operativa.

## Exposición
Método base: \(N_i=V_i\times H_i\). V_i = viviendas ocupadas o presumiblemente ocupadas dentro del polígono de afectación. H_i = promedio de habitantes por vivienda/hogar de fuente local. Registrar fuente, fecha, método, supuestos y confianza. No asumir que toda construcción está habitada. La misma población puede aparecer en varios escenarios; no sumar exposiciones individuales como población única distrital.

## Inventario
Línea base: 52 diques del informe Contraloría 2024. Distribución de referencia: Carossio 4, La Libertad 12, Pedregal 19, Quirio 17. Estructuras posteriores identificadas: Virgen del Rosario 22, Chacrasana 5 y La Ronda 2 (cantidades documentales pendientes de conciliación individual). No mezclar inventario inicial y ampliaciones.

Código único, permanente y no reutilizable; el formato definitivo se decide al conciliar el inventario. Nuevas estructuras se agregan desde la web con permisos. Coordenadas tienen fuente, método, fecha y confianza.

## Arquitectura
Web para responsable; móvil offline para inspector; API; PostgreSQL/PostGIS; almacenamiento privado de objetos para fotos; servicio cartográfico/ruteo desacoplado; auditoría. Selección cloud pendiente de presupuesto, volumen, usuarios y requisitos institucionales.

## Geografía y simulación
Distinguir: (1) histórico documentado, (2) estimación geográfica, (3) escenario hipotético. Un huaico histórico no demuestra la trayectoria de falla de un dique concreto. Sin topografía, geometría, parámetros físicos y validación, la salida es exploratoria, no predicción hidráulica.

## Principios
- Decisión final humana.
- No inventar coordenadas, población ni trayectorias.
- No calcular prioridad incompleta.
- No sobrescribir historial.
- No excluir automáticamente por acceso difícil.
- No confundir prioridad, urgencia y viabilidad logística.
- No presentar simulación exploratoria como validada.
