ALTER TABLE document_templates
  ADD COLUMN IF NOT EXISTS template_file_name TEXT,
  ADD COLUMN IF NOT EXISTS template_file_path TEXT,
  ADD COLUMN IF NOT EXISTS template_file_size INTEGER,
  ADD COLUMN IF NOT EXISTS template_mime_type TEXT,
  ADD COLUMN IF NOT EXISTS template_page_count INTEGER,
  ADD COLUMN IF NOT EXISTS signature_placements JSONB NOT NULL DEFAULT '{}'::jsonb;

