-- Bucket para los comprobantes de pago que sube la web (antes se guardaban en disco local, que
-- no persiste en Vercel). Público porque el link se comparte tal cual como "Ver"/"Descargar
-- comprobante" en la UI, sin pasar por auth.
INSERT INTO storage.buckets (id, name, public)
VALUES ('comprobantes', 'comprobantes', true)
ON CONFLICT (id) DO NOTHING;
