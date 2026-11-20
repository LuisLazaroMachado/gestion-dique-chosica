# Decisiones aprobadas

## Inventario
- Línea base: 52 diques del informe Contraloría 2024.
- Añadir estructuras posteriores (incluidas Virgen del Rosario, Chacrasana y La Ronda) sin mezclarlas con la línea base.
- Alta de nuevas estructuras desde la web con permisos.
- Código único, permanente, no reutilizable e independiente del total. Formato aún por aprobar tras conciliación física.

## Roles y apps
- App móvil para inspectores, offline y con sincronización.
- App web para responsable de planificación.
- Responsable asigna estructuras; inspector registra solo las asignadas, salvo permiso.
- Responsable puede inspeccionar si tiene permiso.
- Especialista acompañante queda registrado como verificador/participante; no necesariamente tiene cuenta.

## Inspección
- D, C y A completos para calcular P.
- “No determinado” se permite en otros campos con motivo, pero no sustituye D/C/A.
- Correcciones conservan antes/después, autor, fecha y motivo.
- Empates: decisión manual justificada del responsable.

## Fórmula
\[
E=(D+C+A)/9;\quad X=N/N_{\max};\quad P=E\times X
\]
No usar logaritmo ni suma ponderada. N son personas potencialmente afectadas por estructura. Nmax es el mayor N del inventario vigente. Agregar estructuras puede cambiar ranking relativo. Actualizaciones de N guardan fuente, fecha, autor y valor anterior. Si Nmax=0, X=0 con advertencia. Urgencia separada; no cambia P.

## Exposición
\(N_i=V_i\times H_i\). V = viviendas ocupadas o presumiblemente ocupadas en polígono de afectación. H = promedio local sustentado. No asumir ocupación de toda construcción. Exposiciones son por estructura; no sumarlas como población única distrital.

## Estados e historial
Estado físico: Operativo, Deteriorado, Crítico, En evaluación.  
Estado intervención: Sin intervención, Pendiente, Programada, En ejecución, Finalizada, Verificada, Observada.  
Inspecciones e intervenciones son registros cronológicos independientes. Finalizada no implica Operativo. Seis meses es intervalo administrativo provisional de inspección, ajustable por especialista. Evento de huaico activa inspección posterior cuando sea seguro.

## Alcance
El sistema registra inspecciones, priorización y planificación/intervenciones. No define procedimientos técnicos de mantenimiento, reparación o limpieza.

## Rutas y acceso
Responsable selecciona estructuras y calcula recorrido desde base central; MVP con una maquinaria. Puede editar orden y justificar. Acceso difícil no equivale a imposible ni excluye automáticamente.

## Simulación
Distinguir histórico, estimación geográfica y escenario hipotético. No declarar simulación hidráulica validada sin datos y validación profesional.

## Formato
Toda la documentación se entrega en Markdown `.md`; el SQL se incluye dentro de bloques de código en archivos `.md`.

## Aclaraciones v1.1 (19-11-2026, aprobadas por el equipo)
No cambian la fórmula, los estados, los roles ni el alcance; precisan cómo se implementan.
1. **Formato:** la regla "todo en Markdown" aplica a la documentación. El código de las aplicaciones (TypeScript, SQL de migraciones, etc.) va en sus archivos normales.
2. **Datos faltantes:** si un dato no existe en fuentes públicas, se estima con un método explícito y se etiqueta como `Estimado` con su nivel de confianza, visible en la aplicación. Se reemplaza por el dato verificado desde la web, con auditoría (no editando código). Esto aplica la regla 6 de las instrucciones; no se presentan estimaciones como verificadas.
3. **Datos de demostración:** se permiten datos ficticios ubicados de forma realista (por ejemplo, sobre el cauce real de cada quebrada), siempre marcados como estimados o de demostración.
4. **GPS en pruebas:** las pruebas de campo pueden usar ubicación simulada; la app registra si la ubicación del teléfono es simulada.
5. **Objetivo y plataforma:** sistema para uso municipal real; app móvil solo para Android; presupuesto inicial US$0 (servicios gratuitos), migrable a hosting de pago o municipal sin reescribir.
6. **Simulación:** la primera versión implementa el nivel A (visualizador geográfico), como ya preveía `04_SIMULACION/04_MOTOR_Y_GUIA.md`.
7. **Línea base:** se mantienen los 52 diques del informe 031-2024-OCI/2157-SVC. Las cifras municipales (IT 039-2024-MAHR) se registran como fuente alternativa para conciliar (ver `01_INVESTIGACION/07_HALLAZGOS_FUENTES_PRIMARIAS.md`).
