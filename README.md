# Serata Bagna Cauda: live photo wall

- `/upload`: pagina ospiti (quella del QR), upload TUS resumable su Supabase Storage.
- `/wall`: proiettore 16:9 con QR + slideshow in tempo reale.
- `/admin`: nasconde i contenuti inopportuni. Parla con la Edge Function Supabase `supabase/functions/admin` (password = secret `ADMIN_PASSWORD`).

Sito pubblico: https://s1ddharth-s1ngh.github.io/serata_bagnacauda/ (export statico, pubblicato da `.github/workflows/pages.yml` a ogni push su `main`).
Edge Function: si aggiorna con `supabase functions deploy admin --no-verify-jwt`.

Variabili locali: vedi `.env.local.example`. Testi dell'evento: `lib/event.ts`.

```bash
npm run dev            # locale
npm test               # self-check della logica slideshow/file
```

## Dopo la festa
1. `npm run download-all`: scarica tutto il bucket in `./party-download/` (serve `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`, è rilanciabile).
2. Chiudi gli upload applicando `supabase/pending/20261121090000_close_uploads.sql` (istruzioni nel file).
