# Modelo de datos — SQL documentado en Markdown

Diseño lógico inicial. Revisar y probar migraciones antes de producción.

```sql
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 email TEXT NOT NULL UNIQUE,
 display_name TEXT NOT NULL,
 role TEXT NOT NULL CHECK (role IN ('inspector','planner','admin')),
 active BOOLEAN NOT NULL DEFAULT TRUE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE structures (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 code TEXT NOT NULL UNIQUE,
 name TEXT NOT NULL,
 structure_type TEXT NOT NULL,
 watershed TEXT NOT NULL,
 origin_inventory TEXT NOT NULL,
 physical_status TEXT NOT NULL DEFAULT 'En evaluación',
 geom geometry(Point,4326),
 location_confidence TEXT NOT NULL DEFAULT 'provisional',
 location_source TEXT,
 location_method TEXT,
 active BOOLEAN NOT NULL DEFAULT TRUE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 created_by UUID REFERENCES users(id)
);
CREATE INDEX structures_geom_gix ON structures USING GIST(geom);

CREATE TABLE assignments (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 structure_id UUID NOT NULL REFERENCES structures(id),
 inspector_id UUID NOT NULL REFERENCES users(id),
 assigned_by UUID NOT NULL REFERENCES users(id),
 assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 due_at TIMESTAMPTZ,
 instructions TEXT,
 status TEXT NOT NULL DEFAULT 'assigned'
);

CREATE TABLE inspections (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 structure_id UUID NOT NULL REFERENCES structures(id),
 assignment_id UUID REFERENCES assignments(id),
 inspector_id UUID NOT NULL REFERENCES users(id),
 verifier_name TEXT,
 inspected_at TIMESTAMPTZ NOT NULL,
 damage_score SMALLINT CHECK(damage_score BETWEEN 0 AND 3),
 clogging_score SMALLINT CHECK(clogging_score BETWEEN 0 AND 3),
 active_process_score SMALLINT CHECK(active_process_score BETWEEN 0 AND 3),
 physical_status TEXT NOT NULL,
 access_status TEXT NOT NULL,
 observations TEXT,
 validation_status TEXT NOT NULL DEFAULT 'Enviado',
 device_record_id UUID UNIQUE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE evidence (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 inspection_id UUID REFERENCES inspections(id),
 object_uri TEXT NOT NULL,
 evidence_type TEXT NOT NULL,
 captured_at TIMESTAMPTZ,
 uploaded_by UUID NOT NULL REFERENCES users(id),
 checksum TEXT
);

CREATE TABLE exposure_estimates (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 structure_id UUID NOT NULL REFERENCES structures(id),
 affected_homes NUMERIC NOT NULL CHECK(affected_homes >= 0),
 persons_per_home NUMERIC NOT NULL CHECK(persons_per_home >= 0),
 estimated_persons NUMERIC NOT NULL CHECK(estimated_persons >= 0),
 method TEXT NOT NULL,
 source TEXT NOT NULL,
 confidence TEXT NOT NULL,
 polygon geometry(MultiPolygon,4326),
 valid_from DATE NOT NULL,
 created_by UUID NOT NULL REFERENCES users(id)
);

CREATE TABLE priority_calculations (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 structure_id UUID NOT NULL REFERENCES structures(id),
 inspection_id UUID NOT NULL REFERENCES inspections(id),
 exposure_id UUID NOT NULL REFERENCES exposure_estimates(id),
 d SMALLINT NOT NULL CHECK(d BETWEEN 0 AND 3),
 c SMALLINT NOT NULL CHECK(c BETWEEN 0 AND 3),
 a SMALLINT NOT NULL CHECK(a BETWEEN 0 AND 3),
 n_persons NUMERIC NOT NULL CHECK(n_persons >= 0),
 n_max NUMERIC NOT NULL CHECK(n_max >= 0),
 e NUMERIC NOT NULL CHECK(e BETWEEN 0 AND 1),
 x NUMERIC NOT NULL CHECK(x BETWEEN 0 AND 1),
 p NUMERIC NOT NULL CHECK(p BETWEEN 0 AND 1),
 formula_version TEXT NOT NULL,
 calculated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE interventions (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 structure_id UUID NOT NULL REFERENCES structures(id),
 intervention_type TEXT NOT NULL,
 description TEXT,
 status TEXT NOT NULL,
 assigned_team TEXT,
 machinery TEXT,
 planned_start TIMESTAMPTZ,
 planned_end TIMESTAMPTZ,
 actual_start TIMESTAMPTZ,
 actual_end TIMESTAMPTZ,
 created_by UUID NOT NULL REFERENCES users(id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE audit_log (
 id BIGSERIAL PRIMARY KEY,
 actor_id UUID REFERENCES users(id),
 action TEXT NOT NULL,
 entity_type TEXT NOT NULL,
 entity_id UUID,
 before_data JSONB,
 after_data JSONB,
 reason TEXT,
 occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

## Reglas que requieren lógica backend
Validar D/C/A completos; calcular Nmax sobre universo vigente; versionar resultados; validar asignación y permisos; auditar cambios; implementar sincronización idempotente; definir transiciones de estado, retención y borrado lógico; versionar polígonos.
