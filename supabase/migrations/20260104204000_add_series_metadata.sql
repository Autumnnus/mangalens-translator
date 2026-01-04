-- Add metadata columns to series table
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'series' AND column_name = 'author') THEN
        ALTER TABLE series ADD COLUMN author TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'series' AND column_name = 'group_name') THEN
        ALTER TABLE series ADD COLUMN group_name TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'series' AND column_name = 'original_title') THEN
        ALTER TABLE series ADD COLUMN original_title TEXT;
    END IF;
END $$;
