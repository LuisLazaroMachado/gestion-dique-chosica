-- Capas de referencia para el mapa (mallas documentadas, cauces estimados, etc.).
-- No forman parte del inventario priorizado; son contexto con su fuente y etiqueta.
CREATE TABLE reference_features (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  layer       TEXT NOT NULL,
  name        TEXT NOT NULL,
  geom        geometry(Geometry,4326) NOT NULL,
  properties  JSONB NOT NULL DEFAULT '{}',
  data_label  TEXT NOT NULL CHECK (data_label IN ('Documentado','Estimado','Provisional','Demostración')),
  source      TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX reference_features_layer_idx ON reference_features (layer);
CREATE INDEX reference_features_geom_gix ON reference_features USING GIST (geom);
