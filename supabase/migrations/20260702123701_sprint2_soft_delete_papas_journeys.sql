-- ============================================================
-- SPRINT 2: Soft-Delete for Papas & Journeys
-- Prevents irreversible cascade deletion of mission-critical records
-- TCNP Journey Management | 2026-07-02
-- ============================================================

-- ─── Papas: add soft-delete columns ───────────────────────────────────────
ALTER TABLE public.papas
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES public.users(id);

CREATE INDEX IF NOT EXISTS idx_papas_is_deleted ON public.papas(is_deleted)
  WHERE is_deleted = false;  -- partial index — only indexes active records

-- ─── Journeys: add soft-delete columns ────────────────────────────────────
ALTER TABLE public.journeys
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES public.users(id);

CREATE INDEX IF NOT EXISTS idx_journeys_is_deleted ON public.journeys(is_deleted)
  WHERE is_deleted = false;

-- ─── DB function: soft delete a papa ──────────────────────────────────────
CREATE OR REPLACE FUNCTION soft_delete_papa(p_papa_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE public.papas
  SET is_deleted = true,
      deleted_at = NOW(),
      deleted_by = auth.uid()
  WHERE id = p_papa_id
    AND is_deleted = false;

  -- Create audit log entry
  PERFORM create_audit_log('soft_delete', 'papa', p_papa_id, NULL);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── DB function: soft delete a journey ───────────────────────────────────
CREATE OR REPLACE FUNCTION soft_delete_journey(p_journey_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE public.journeys
  SET is_deleted = true,
      deleted_at = NOW(),
      deleted_by = auth.uid()
  WHERE id = p_journey_id
    AND is_deleted = false;

  PERFORM create_audit_log('soft_delete', 'journey', p_journey_id, NULL);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DO $$
BEGIN
  RAISE NOTICE 'Sprint 2: Soft-delete columns added to papas and journeys tables.';
END $$;;
