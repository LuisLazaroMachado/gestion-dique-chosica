-- Acceso de maquinaria (aprobado por el equipo el 20-11-2026).
-- El inspector registra si la maquinaria puede llegar, qué obstáculos hay y, si no llega, el último punto
-- hasta donde llega un vehículo. El responsable de rutas decide con esta información y las fotos del camino;
-- el sistema no excluye estructuras automáticamente.
ALTER TABLE inspections
  ADD COLUMN machinery_access TEXT CHECK (machinery_access IN ('Sí','Solo pequeña','No','No se sabe')),
  ADD COLUMN access_obstacles TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN vehicle_point geometry(Point,4326),
  ADD COLUMN vehicle_point_mock BOOLEAN;

ALTER TABLE inspections ADD CONSTRAINT access_obstacles_valid CHECK (
  access_obstacles <@ ARRAY['camino_angosto','pendiente_fuerte','escaleras','sin_camino','cerrado',
                            'puente_debil','material_en_camino','viviendas_cercanas','otro']::text[]);
