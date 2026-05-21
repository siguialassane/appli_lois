# Appli Loi CI

Application `TanStack Start` mobile-first et `PWA` pour repondre a des questions sur les rapports `police <-> citoyen` en Cote d'Ivoire avec citations juridiques obligatoires.

## Ce qui est deja en place

- corpus documentaire structure dans `data/`
- pipeline de collecte depuis `CNDJ / Laws.Africa`
- extraction PDF + normalisation article par article
- route API `src/routes/api/chat.ts` avec garde-fous et mode prive
- interface de chat mobile-first proche de ChatGPT mobile
- historique local et structure Supabase prete pour la beta

## Dossiers utiles

- `data/raw_pdfs/` : PDF telecharges
- `data/extracted/` : HTML sources et texte extrait
- `data/corpus/` : documents, passages et manifestes pour le RAG
- `scripts/` : ingestion, verification, push Supabase
- `src/routes/` : pages et endpoints TanStack Start
- `supabase/schema.sql` : schema cible pour la base

## Lancer le projet

```bash
npm install
npm run corpus:build
npm run corpus:check
npm run dev
```

Code d'acces local par defaut si `PRIVATE_BETA_CODE` n'est pas defini :

```txt
beta-civ-2026
```

## Variables d'environnement

Copier `.env.example` et remplir selon le besoin :

- `OPENROUTER_API_KEY`
- `OPENROUTER_MODEL`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ANON_KEY`
- `PRIVATE_BETA_CODE`

## Corpus et base

Le schema cible est dans [schema.sql](/C:/Users/Dell/Documents/Projet_Perso/Appli_Loi/supabase/schema.sql).

Quand la cle d'administration Supabase est disponible :

```bash
npm run supabase:push
```
