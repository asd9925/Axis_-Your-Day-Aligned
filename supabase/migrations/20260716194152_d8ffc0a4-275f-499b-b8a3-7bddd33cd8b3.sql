
CREATE TABLE public.dream_vision (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  vision_statement text,
  life_areas jsonb NOT NULL DEFAULT '[]'::jsonb,
  reflection_prompt_seen_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dream_vision TO authenticated;
GRANT ALL ON public.dream_vision TO service_role;
ALTER TABLE public.dream_vision ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own dream_vision" ON public.dream_vision FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER dream_vision_set_updated_at BEFORE UPDATE ON public.dream_vision
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.vision_board_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  area_key text,
  kind text NOT NULL CHECK (kind IN ('image','note','quote')),
  image_path text,
  text_content text,
  caption text,
  position int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vision_board_items TO authenticated;
GRANT ALL ON public.vision_board_items TO service_role;
ALTER TABLE public.vision_board_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own vision_board_items" ON public.vision_board_items FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX vision_board_items_user_position_idx ON public.vision_board_items(user_id, position);
CREATE TRIGGER vision_board_items_set_updated_at BEFORE UPDATE ON public.vision_board_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
