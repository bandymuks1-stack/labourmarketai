# LabourMarket.ai translation service (self-hosted LibreTranslate)

Free, open-source machine translation for conversation messages. Message text
stays on infrastructure the owner controls, so the data-egress gate treats it
as `local` (no third party receives it).

## Deploy (owner action — any Docker host, ~2 GB RAM)

```bash
docker compose up -d
docker compose exec libretranslate ltmanage keys add 120   # prints the API key
```

Then set, in the web app environment (Vercel production):

```
AI_LIBRETRANSLATE_ENABLED=true
AI_LIBRETRANSLATE_SELF_HOSTED=true
LIBRETRANSLATE_URL=https://<private-host>      # the URL the web app reaches
LIBRETRANSLATE_API_KEY=<key from the command above>
```

Nothing else changes: `translate_message` tries this engine first, then DeepL
(if enabled), then Cloudflare (if enabled and approved), then the Gemini tier,
and shows the ORIGINAL text if all are unavailable. A failing engine never
breaks a conversation.

## Languages

en, lt, lv, et, ru, pl, de, nl, da, nb (Norwegian), sv, uk. Georgian is not
available in LibreTranslate; it falls through to the next engine.
Quality: good for EN/DE/NL/PL/RU, acceptable for LT/LV/ET (Argos models).
