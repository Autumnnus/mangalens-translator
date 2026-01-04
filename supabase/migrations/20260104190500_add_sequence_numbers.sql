-- Add sequence_number to series table
ALTER TABLE series ADD COLUMN IF NOT EXISTS sequence_number INTEGER DEFAULT 0;

-- Add sequence_number to images table
ALTER TABLE images ADD COLUMN IF NOT EXISTS sequence_number INTEGER DEFAULT 0;

-- Create indexes for performance if needed
CREATE INDEX IF NOT EXISTS idx_series_sequence_number ON series(sequence_number);
CREATE INDEX IF NOT EXISTS idx_images_sequence_number ON images(sequence_number);
