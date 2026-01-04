-- Enable RLS on tables
ALTER TABLE series ENABLE ROW LEVEL SECURITY;
ALTER TABLE images ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

-- Create policies for Series
CREATE POLICY "Users can view their own series" ON series
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own series" ON series
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own series" ON series
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own series" ON series
  FOR DELETE USING (auth.uid() = user_id);

-- Create policies for Images (linked to series, but we can also check series ownership or just rely on IDs if we added user_id to images, which we didn't? 
-- The images table usually has a link to series. 
-- Ideally images should have user_id or we check via join.
-- For simplicity in this specific project context allowing access based on Series ownership is better but RLS with joins can be complex/performance heavy.
-- Let's check if images has user_id or if we should add it.
-- A common pattern without user_id on child table is:
-- USING (series_id IN (SELECT id FROM series WHERE user_id = auth.uid()))

CREATE POLICY "Users can view their own images" ON images
  FOR SELECT USING (
    series_id IN (SELECT id FROM series WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can insert their own images" ON images
  FOR INSERT WITH CHECK (
    series_id IN (SELECT id FROM series WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can update their own images" ON images
  FOR UPDATE USING (
    series_id IN (SELECT id FROM series WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can delete their own images" ON images
  FOR DELETE USING (
    series_id IN (SELECT id FROM series WHERE user_id = auth.uid())
  );

-- Categories Policies
CREATE POLICY "Users can view their own categories" ON categories
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own categories" ON categories
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own categories" ON categories
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own categories" ON categories
  FOR DELETE USING (auth.uid() = user_id);
