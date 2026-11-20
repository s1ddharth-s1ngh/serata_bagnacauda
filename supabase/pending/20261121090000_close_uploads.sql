-- NON applicare prima della fine della festa.
--
-- Chiude gli upload: gli ospiti (anon) non possono più caricare file né aggiungere righe in media.
-- Wall e admin continuano a funzionare (lettura anon e service role non cambiano).
--
-- Come applicare (a festa finita):
--   - Supabase MCP: apply_migration con name "close_uploads" e questo file come query, oppure
--   - Dashboard Supabase > SQL Editor: incolla questo file ed esegui.
-- Poi spostalo in supabase/migrations/ così la cronologia resta allineata.

drop policy if exists "anon can add visible media" on public.media;
drop policy if exists "anon can upload to party" on storage.objects;
-- Also drops the column-level insert grants (path, type, author).
revoke insert on public.media from anon;

-- Per riaprire gli upload (se chiusi per sbaglio):
-- grant insert (path, type, author) on public.media to anon;
-- create policy "anon can add visible media" on public.media
--   for insert to anon with check (hidden = false);
-- create policy "anon can upload to party" on storage.objects
--   for insert to anon with check (
--     bucket_id = 'party'
--     and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]{1,5}$'
--   );
