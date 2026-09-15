
CREATE POLICY "vision-board own read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'vision-board' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "vision-board own insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'vision-board' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "vision-board own update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'vision-board' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "vision-board own delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'vision-board' AND auth.uid()::text = (storage.foldername(name))[1]);
