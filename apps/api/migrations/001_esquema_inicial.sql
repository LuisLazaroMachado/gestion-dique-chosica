-- Priori Dique Chosica — esquema inicial
-- Basado en docs/especificacion/03_APLICACIONES/04_MODELO_DATOS_SQL_EN_MD.md, completado con las
-- reglas de docs/especificacion/00_TRANSFERENCIA/02_DECISIONES_APROBADAS.md.
-- Principios: no sobrescribir historial, no calcular prioridad incompleta, todo dato con fuente y confianza.

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ───────────────────────── Usuarios y permisos ─────────────────────────
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT NOT NULL UNIQUE,
  display_name  TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('inspector','planner','admin')),
  password_hash TEXT NOT NULL,
  -- Permisos adicionales (mínimo privilegio): el responsable puede inspeccionar si se le concede;
  -- el inspector puede ver todo el inventario solo con autorización.
  can_inspect   BOOLEAN NOT NULL DEFAULT FALSE,
  can_view_all  BOOLEAN NOT NULL DEFAULT FALSE,
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ───────────────────────── Inventario ─────────────────────────
-- Código permanente: nunca se reutiliza (secuencia, sin borrado físico).
CREATE SEQUENCE structure_code_seq START 1;

CREATE TABLE structures (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code                  TEXT NOT NULL UNIQUE,
  name                  TEXT NOT NULL,
  aliases               TEXT[] NOT NULL DEFAULT '{}',
  structure_type        TEXT NOT NULL CHECK (structure_type IN
                          ('dique_transversal','barrera_dinamica','muro_encauzamiento','otro')),
  material              TEXT NOT NULL DEFAULT 'por_verificar' CHECK (material IN
                          ('concreto','mamposteria','gaviones','malla_metalica','otro','por_verificar')),
  watershed             TEXT NOT NULL,                 -- quebrada / sector
  origin_inventory      TEXT NOT NULL CHECK (origin_inventory IN ('linea_base_2024','ampliacion')),
  source_reference      TEXT,                          -- p. ej. "F-01 Acta 01 p.21, dique n.° 9"
  source_number         INTEGER,                       -- n.° asignado por la fuente (Contraloría)
  working_id            TEXT UNIQUE,                   -- REG-2024-QQQ-NN del registro de conciliación
  reconciliation_status TEXT NOT NULL DEFAULT 'por_conciliar' CHECK (reconciliation_status IN
                          ('por_conciliar','individualizado','verificado_campo','duplicado','descartado')),
  physical_status       TEXT NOT NULL DEFAULT 'En evaluación' CHECK (physical_status IN
                          ('Operativo','Deteriorado','Crítico','En evaluación')),
  intervention_status   TEXT NOT NULL DEFAULT 'Sin intervención' CHECK (intervention_status IN
                          ('Sin intervención','Pendiente','Programada','En ejecución','Finalizada','Verificada','Observada')),
  geom                  geometry(Point,4326),
  location_confidence   TEXT NOT NULL DEFAULT 'provisional' CHECK (location_confidence IN
                          ('verificada','aproximada','provisional')),
  location_label        TEXT NOT NULL DEFAULT 'Estimado' CHECK (location_label IN
                          ('Documentado','Estimado','Provisional','Demostración')),
  location_method       TEXT,
  location_source       TEXT,
  location_date         DATE,
  location_precision_m  NUMERIC CHECK (location_precision_m IS NULL OR location_precision_m >= 0),
  location_crs_original TEXT,
  location_responsible  TEXT,
  elevation_m           NUMERIC,
  notes                 TEXT,
  active                BOOLEAN NOT NULL DEFAULT TRUE,  -- borrado lógico
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by            UUID REFERENCES users(id)
);
CREATE INDEX structures_geom_gix ON structures USING GIST (geom);
CREATE INDEX structures_watershed_idx ON structures (watershed);

-- ───────────────────────── Asignaciones y excepciones ─────────────────────────
CREATE TABLE assignments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  structure_id  UUID NOT NULL REFERENCES structures(id),
  inspector_id  UUID NOT NULL REFERENCES users(id),
  assigned_by   UUID NOT NULL REFERENCES users(id),
  assigned_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  due_at        TIMESTAMPTZ,
  instructions  TEXT,
  status        TEXT NOT NULL DEFAULT 'asignada' CHECK (status IN ('asignada','en_curso','completada','cancelada'))
);
CREATE INDEX assignments_inspector_idx ON assignments (inspector_id, status);

-- Autorización registrada para que un inspector acceda a una estructura no asignada.
CREATE TABLE access_exceptions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  structure_id  UUID NOT NULL REFERENCES structures(id),
  user_id       UUID NOT NULL REFERENCES users(id),
  reason        TEXT NOT NULL CHECK (length(trim(reason)) > 0),
  granted_by    UUID NOT NULL REFERENCES users(id),
  granted_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at    TIMESTAMPTZ
);

-- ───────────────────────── Inspecciones ─────────────────────────
CREATE TABLE inspections (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  structure_id          UUID NOT NULL REFERENCES structures(id),
  assignment_id         UUID REFERENCES assignments(id),
  inspector_id          UUID NOT NULL REFERENCES users(id),
  verifier_name         TEXT,                     -- especialista acompañante (puede no tener cuenta)
  verifier_role         TEXT,
  inspected_at          TIMESTAMPTZ NOT NULL,
  -- D, C, A: 0–3. Pueden faltar (inspección incompleta); entonces NO se calcula prioridad.
  damage_score          SMALLINT CHECK (damage_score BETWEEN 0 AND 3),
  clogging_score        SMALLINT CHECK (clogging_score BETWEEN 0 AND 3),
  active_process_score  SMALLINT CHECK (active_process_score BETWEEN 0 AND 3),
  physical_status       TEXT NOT NULL CHECK (physical_status IN ('Operativo','Deteriorado','Crítico','En evaluación')),
  access_status         TEXT NOT NULL CHECK (access_status IN ('Sin observación','Difícil','Restringido','No determinado')),
  access_notes          TEXT,
  observations          TEXT,
  undetermined_reasons  JSONB NOT NULL DEFAULT '{}',  -- {campo: motivo} para campos "No determinado"
  validation_status     TEXT NOT NULL DEFAULT 'Enviado' CHECK (validation_status IN ('Enviado','Validado','Observado')),
  validation_notes      TEXT,
  validated_by          UUID REFERENCES users(id),
  validated_at          TIMESTAMPTZ,
  device_location       geometry(Point,4326),     -- GPS del teléfono: evidencia, no coordenada maestra
  device_location_mock  BOOLEAN,                  -- Android reporta ubicación simulada
  device_accuracy_m     NUMERIC,
  device_record_id      UUID UNIQUE,              -- UUID local del móvil: sincronización idempotente
  data_label            TEXT NOT NULL DEFAULT 'Documentado' CHECK (data_label IN
                          ('Documentado','Estimado','Demostración')),
  source_reference      TEXT,                     -- para inspecciones de referencia (p. ej. Contraloría)
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT access_notes_required CHECK (
    access_status NOT IN ('Difícil','Restringido') OR (access_notes IS NOT NULL AND length(trim(access_notes)) > 0))
);
CREATE INDEX inspections_structure_idx ON inspections (structure_id, inspected_at DESC);

-- ───────────────────────── Intervenciones ─────────────────────────
CREATE TABLE interventions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  structure_id       UUID NOT NULL REFERENCES structures(id),
  intervention_type  TEXT NOT NULL,
  description        TEXT,
  status             TEXT NOT NULL DEFAULT 'Pendiente' CHECK (status IN
                       ('Pendiente','Programada','En ejecución','Finalizada','Verificada','Observada')),
  assigned_team      TEXT,
  machinery          TEXT,
  planned_start      TIMESTAMPTZ,
  planned_end        TIMESTAMPTZ,
  actual_start       TIMESTAMPTZ,
  actual_end         TIMESTAMPTZ,
  verification_notes TEXT,
  verified_by        UUID REFERENCES users(id),
  verified_at        TIMESTAMPTZ,
  created_by         UUID NOT NULL REFERENCES users(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX interventions_structure_idx ON interventions (structure_id, created_at DESC);

-- ───────────────────────── Evidencias (fotos y documentos) ─────────────────────────
CREATE TABLE evidence (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  structure_id     UUID NOT NULL REFERENCES structures(id),
  inspection_id    UUID REFERENCES inspections(id),
  intervention_id  UUID REFERENCES interventions(id),
  evidence_type    TEXT NOT NULL CHECK (evidence_type IN
                     ('general','colmatacion','dano','proceso','acceso','intervencion_antes','intervencion_despues','documento')),
  object_key       TEXT NOT NULL,           -- ruta privada en el almacenamiento (nunca enlace público)
  content_type     TEXT NOT NULL,
  size_bytes       BIGINT,
  checksum_sha256  TEXT,
  captured_at      TIMESTAMPTZ,
  geom             geometry(Point,4326),
  location_mock    BOOLEAN,
  device_record_id UUID UNIQUE,             -- idempotencia de la carga desde el móvil
  upload_status    TEXT NOT NULL DEFAULT 'pendiente' CHECK (upload_status IN ('pendiente','confirmada')),
  uploaded_by      UUID NOT NULL REFERENCES users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT evidence_parent CHECK (inspection_id IS NOT NULL OR intervention_id IS NOT NULL OR evidence_type = 'documento')
);

-- ───────────────────────── Exposición (N) ─────────────────────────
-- Versionada: cada estimación es un registro nuevo; la vigente es la de valid_from más reciente.
CREATE TABLE exposure_estimates (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  structure_id      UUID NOT NULL REFERENCES structures(id),
  method            TEXT NOT NULL CHECK (method IN ('VxH','dato_oficial')),
  affected_homes    NUMERIC CHECK (affected_homes >= 0),      -- V
  persons_per_home  NUMERIC CHECK (persons_per_home >= 0),    -- H
  estimated_persons NUMERIC NOT NULL CHECK (estimated_persons >= 0), -- N
  persons_low       NUMERIC CHECK (persons_low >= 0),
  persons_high      NUMERIC CHECK (persons_high >= 0),
  method_notes      TEXT NOT NULL,
  source            TEXT NOT NULL,
  data_label        TEXT NOT NULL DEFAULT 'Estimado' CHECK (data_label IN ('Documentado','Estimado','Demostración')),
  confidence        TEXT NOT NULL CHECK (confidence IN ('alta','media','baja')),
  polygon           geometry(MultiPolygon,4326),
  polygon_version   TEXT,
  valid_from        DATE NOT NULL,
  previous_id       UUID REFERENCES exposure_estimates(id),
  change_reason     TEXT,
  created_by        UUID REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT vxh_requires_inputs CHECK (method <> 'VxH' OR (affected_homes IS NOT NULL AND persons_per_home IS NOT NULL))
);
CREATE INDEX exposure_structure_idx ON exposure_estimates (structure_id, valid_from DESC, created_at DESC);

-- ───────────────────────── Priorización ─────────────────────────
CREATE TABLE priority_batches (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  formula_version TEXT NOT NULL,
  n_max           NUMERIC NOT NULL CHECK (n_max >= 0),
  n_max_structure UUID REFERENCES structures(id),
  inventory_count INTEGER NOT NULL,
  warnings        TEXT[] NOT NULL DEFAULT '{}',
  reason          TEXT NOT NULL,
  triggered_by    UUID REFERENCES users(id),
  calculated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE priority_calculations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id        UUID NOT NULL REFERENCES priority_batches(id),
  structure_id    UUID NOT NULL REFERENCES structures(id),
  inspection_id   UUID NOT NULL REFERENCES inspections(id),
  exposure_id     UUID NOT NULL REFERENCES exposure_estimates(id),
  d               SMALLINT NOT NULL CHECK (d BETWEEN 0 AND 3),
  c               SMALLINT NOT NULL CHECK (c BETWEEN 0 AND 3),
  a               SMALLINT NOT NULL CHECK (a BETWEEN 0 AND 3),
  n_persons       NUMERIC NOT NULL CHECK (n_persons >= 0),
  n_max           NUMERIC NOT NULL CHECK (n_max >= 0),
  e               NUMERIC NOT NULL CHECK (e BETWEEN 0 AND 1),
  x               NUMERIC NOT NULL CHECK (x BETWEEN 0 AND 1),
  p               NUMERIC NOT NULL CHECK (p BETWEEN 0 AND 1),
  warnings        TEXT[] NOT NULL DEFAULT '{}',
  formula_version TEXT NOT NULL,
  calculated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (batch_id, structure_id)
);

-- Urgencia operativa: separada y justificada; NO modifica P.
CREATE TABLE urgencies (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  structure_id  UUID NOT NULL REFERENCES structures(id),
  level         TEXT NOT NULL CHECK (level IN ('Normal','Atención','Urgente')),
  justification TEXT NOT NULL CHECK (length(trim(justification)) > 0),
  created_by    UUID NOT NULL REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Decisiones manuales del responsable (empates, excepciones de orden).
CREATE TABLE priority_decisions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id      UUID REFERENCES priority_batches(id),
  structure_ids UUID[] NOT NULL,
  decision      TEXT NOT NULL,
  justification TEXT NOT NULL CHECK (length(trim(justification)) > 0),
  created_by    UUID NOT NULL REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ───────────────────────── Rutas ─────────────────────────
CREATE TABLE routes (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 TEXT NOT NULL,
  base_name            TEXT NOT NULL,
  base_geom            geometry(Point,4326) NOT NULL,
  machinery            TEXT,
  structure_ids_calc   UUID[] NOT NULL,          -- orden calculado
  structure_ids_final  UUID[] NOT NULL,          -- orden final (editable)
  edit_justification   TEXT,
  geom                 geometry(LineString,4326),
  distance_m           NUMERIC,
  duration_s           NUMERIC,
  provider             TEXT NOT NULL,            -- 'openrouteservice' | 'linea_recta'
  provider_profile     TEXT,
  warnings             TEXT[] NOT NULL DEFAULT '{}',
  created_by           UUID NOT NULL REFERENCES users(id),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT route_edit_justified CHECK (structure_ids_calc = structure_ids_final OR
                                          (edit_justification IS NOT NULL AND length(trim(edit_justification)) > 0))
);

-- ───────────────────────── Escenarios (simulación nivel A) ─────────────────────────
CREATE TABLE scenarios (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  structure_id     UUID NOT NULL REFERENCES structures(id),
  scenario_type    TEXT NOT NULL CHECK (scenario_type IN ('S0','S1','S2','S3','S4')),
  name             TEXT NOT NULL,
  corridor         geometry(MultiLineString,4326),
  zone             geometry(MultiPolygon,4326),
  parameters       JSONB NOT NULL DEFAULT '{}',
  engine_version   TEXT NOT NULL,
  validation_level TEXT NOT NULL DEFAULT 'A' CHECK (validation_level IN ('A','B','C')),
  data_label       TEXT NOT NULL DEFAULT 'Hipotético',
  limitations      TEXT NOT NULL,
  sources          TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ───────────────────────── Configuración ─────────────────────────
CREATE TABLE settings (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  notes      TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ───────────────────────── Auditoría ─────────────────────────
CREATE TABLE audit_log (
  id          BIGSERIAL PRIMARY KEY,
  actor_id    UUID REFERENCES users(id),
  action      TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id   UUID,
  before_data JSONB,
  after_data  JSONB,
  reason      TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX audit_entity_idx ON audit_log (entity_type, entity_id, occurred_at DESC);

-- Registros inalterables: auditoría y cálculos de prioridad no se editan ni se borran.
CREATE FUNCTION forbid_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'La tabla % es de solo inserción (historial inalterable)', TG_TABLE_NAME;
END $$;
CREATE TRIGGER audit_log_immutable BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION forbid_change();
CREATE TRIGGER priority_calc_immutable BEFORE UPDATE OR DELETE ON priority_calculations
  FOR EACH ROW EXECUTE FUNCTION forbid_change();
CREATE TRIGGER priority_batch_immutable BEFORE UPDATE OR DELETE ON priority_batches
  FOR EACH ROW EXECUTE FUNCTION forbid_change();
CREATE TRIGGER exposure_immutable BEFORE UPDATE OR DELETE ON exposure_estimates
  FOR EACH ROW EXECUTE FUNCTION forbid_change();
-- Inspecciones, intervenciones y estructuras no se borran físicamente (borrado lógico / correcciones auditadas).
CREATE FUNCTION forbid_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'No se permite borrar registros de % (use borrado lógico)', TG_TABLE_NAME;
END $$;
CREATE TRIGGER inspections_no_delete BEFORE DELETE ON inspections FOR EACH ROW EXECUTE FUNCTION forbid_delete();
CREATE TRIGGER interventions_no_delete BEFORE DELETE ON interventions FOR EACH ROW EXECUTE FUNCTION forbid_delete();
CREATE TRIGGER structures_no_delete BEFORE DELETE ON structures FOR EACH ROW EXECUTE FUNCTION forbid_delete();
CREATE TRIGGER evidence_no_delete BEFORE DELETE ON evidence FOR EACH ROW EXECUTE FUNCTION forbid_delete();

INSERT INTO settings (key, value, notes) VALUES
  ('inspection_interval_months', '6', 'Intervalo administrativo provisional; ajustable por especialista'),
  ('formula_version', '"P-1.0"', 'E=(D+C+A)/9; X=N/Nmax; P=E*X'),
  ('base_central', '{"name":"Sede municipal (Estimado)","lat":null,"lon":null}', 'Base para rutas; ubicación a confirmar');
