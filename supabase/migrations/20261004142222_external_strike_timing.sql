-- Evidence belongs to the existing MIT identity; external reports do not create
-- another strike or alter source reconciliation / impact-count identities.
ALTER TABLE public.strikes ADD COLUMN timing_evidence jsonb;
ALTER TABLE public.strikes ADD CONSTRAINT strikes_timing_evidence_object
  CHECK (timing_evidence IS NULL OR jsonb_typeof(timing_evidence) = 'object');
COMMENT ON COLUMN public.strikes.timing_evidence IS
  'Semantic timing windows, confidence, dated source excerpts and disagreements. MIT remains the strike identity/status authority.';
