# API — contrato funcional inicial

Base `/api/v1`, JSON, fechas ISO 8601, almacenamiento UTC. Autorización validada en servidor.

| Endpoint | Métodos | Función |
|---|---|---|
| `/auth/login` | POST | Autenticación |
| `/me` | GET | Perfil/permisos |
| `/structures` | GET/POST | Listar/crear |
| `/structures/{id}` | GET/PATCH | Consultar/editar |
| `/structures/{id}/history` | GET | Historial |
| `/assignments` | GET/POST | Asignaciones |
| `/inspections` | GET/POST | Consultar/registrar |
| `/inspections/{id}` | GET/PATCH | Consultar/corregir |
| `/inspections/{id}/submit` | POST | Enviar |
| `/inspections/{id}/validate` | POST | Validar/observar |
| `/evidence/upload-url` | POST | URL temporal de carga |
| `/exposure-estimates` | GET/POST | Exposición versionada |
| `/priorities/recalculate` | POST | Recalcular |
| `/interventions` | GET/POST | Intervenciones |
| `/routes` | GET/POST | Rutas |
| `/audit` | GET | Auditoría |

La app móvil envía UUID local único para impedir duplicados. El backend calcula P; no confiar en el puntaje enviado por el cliente. Las operaciones críticas generan auditoría.
