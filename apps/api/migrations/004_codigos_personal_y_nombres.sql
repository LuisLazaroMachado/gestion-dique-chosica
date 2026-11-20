-- 1) Código de personal permanente por usuario: INS-001 (inspector), RES-001 (responsable), ADM-001 (administrador).
--    Se asigna al crear el usuario y no se reutiliza (los usuarios no se borran, solo se desactivan).
ALTER TABLE users ADD COLUMN staff_code TEXT UNIQUE;

WITH numbered AS (
  SELECT id,
         CASE WHEN email LIKE '%@sistema.local' THEN 'SIS'
              WHEN role = 'inspector' THEN 'INS' WHEN role = 'planner' THEN 'RES' ELSE 'ADM' END AS prefix,
         created_at
    FROM users
), ranked AS (
  SELECT id, prefix, row_number() OVER (PARTITION BY prefix ORDER BY created_at, id) AS n FROM numbered
)
UPDATE users u SET staff_code = r.prefix || '-' || lpad(r.n::text, 3, '0') FROM ranked r WHERE r.id = u.id;

ALTER TABLE users ALTER COLUMN staff_code SET NOT NULL;

-- 2) Nombres más legibles, sin guion largo: "Dique 7 — Quebrada Quirio" → "Dique 7, quebrada Quirio".
INSERT INTO audit_log (actor_id, action, entity_type, entity_id, before_data, after_data, reason)
SELECT NULL, 'editar_estructura', 'structure', id, jsonb_build_object('name', name),
       jsonb_build_object('name', replace(name, ' — Quebrada ', ', quebrada ')), 'Formato de nombre más legible'
  FROM structures WHERE name LIKE '% — %';
UPDATE structures SET name = replace(name, ' — Quebrada ', ', quebrada ') WHERE name LIKE '% — Quebrada %';
UPDATE structures SET name = replace(name, ' — ', ', ') WHERE name LIKE '% — %';

UPDATE reference_features SET name = replace(name, 'Cauce estimado — ', 'Cauce de la quebrada ') WHERE name LIKE 'Cauce estimado — %';
UPDATE reference_features SET name = replace(name, ' — ', ', quebrada ') WHERE name LIKE 'Malla dinámica % — %';
UPDATE reference_features SET properties = jsonb_set(properties, '{name}', to_jsonb(name)) WHERE properties ? 'name';

UPDATE scenarios SET limitations = replace(limitations, ' — ', ', ') WHERE limitations LIKE '% — %';

-- Asignación automática del código al crear usuarios (si no se indica uno).
CREATE FUNCTION assign_staff_code() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE pfx TEXT; nxt INT;
BEGIN
  IF NEW.staff_code IS NOT NULL THEN RETURN NEW; END IF;
  pfx := CASE WHEN NEW.email LIKE '%@sistema.local' THEN 'SIS'
              WHEN NEW.role = 'inspector' THEN 'INS' WHEN NEW.role = 'planner' THEN 'RES' ELSE 'ADM' END;
  PERFORM pg_advisory_xact_lock(hashtext('staff_code_' || pfx));
  SELECT COALESCE(max(substring(staff_code FROM 5)::int), 0) + 1 INTO nxt FROM users WHERE staff_code LIKE pfx || '-%';
  NEW.staff_code := pfx || '-' || lpad(nxt::text, 3, '0');
  RETURN NEW;
END $$;
CREATE TRIGGER users_staff_code BEFORE INSERT ON users FOR EACH ROW EXECUTE FUNCTION assign_staff_code();
