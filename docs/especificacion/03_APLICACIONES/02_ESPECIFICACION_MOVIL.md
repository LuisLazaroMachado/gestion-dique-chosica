# Aplicación móvil — inspector

## Funciones
Inicio de sesión; descarga de asignaciones; consulta de estructura e historial resumido; formulario; fotos; GPS opcional como evidencia; guardado offline; cola de sincronización; consulta de observaciones; corrección auditada de registros propios.

## Formulario
Identificación/asignación; fecha; inspector/verificador; tipo; D; C; A; estado físico; acceso; observaciones; fotos; revisión y envío. La ficha papel conserva las mismas variables/escalas; fotos en papel se vinculan con códigos.

## Reglas offline
Cada registro local tiene UUID. Sincronización idempotente. El servidor confirma recepción. Fotos se reintentan por separado. No borrar copia local antes de confirmación. Mostrar pendiente/enviado/confirmado/error. Conflictos no se resuelven sobrescribiendo silenciosamente. GPS del teléfono no reemplaza coordenada maestra.
