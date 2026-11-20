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
