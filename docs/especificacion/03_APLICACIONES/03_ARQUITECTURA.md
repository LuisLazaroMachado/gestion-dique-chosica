# Arquitectura técnica

Componentes: cliente web, cliente móvil con base local, API backend, autenticación/autorización, PostgreSQL + PostGIS, almacenamiento de objetos privado para fotos, proveedor de mapas/ruteo desacoplado, servicio de prioridad, sincronización y auditoría.

## Principios
Separar interfaz, lógica y persistencia. API versionada. Validación en servidor. Índices espaciales. Fotos fuera de base relacional. Auditoría de cambios críticos. Backups/restauración probados. Añadir estructuras sin reconstruir sistema. No asumir que APIs de ruteo consideran maquinaria pesada.

## Pendiente de decisión
Proveedor cloud, mapas y ruteo; volumen de fotos; usuarios simultáneos; dispositivos; conectividad; retención; soberanía/ubicación de datos; recuperación ante desastres.
