# Plan de complement du corpus

Objectif : completer le corpus actuel sans sortir trop vite du perimetre police <-> citoyen.
Priorite : identite, detention, contraventions, manifestations, mineurs.

## Infos a recuperer pour chaque texte

- titre officiel
- numero et annee
- type de texte : loi, decret, ordonnance, circulaire
- URL HTML officielle CNDJ / Laws.Africa
- URL PDF officielle
- date de version
- mots-cles utiles pour le RAG
- texte integral exploitable article par article

## Ou les recuperer

Source principale : https://civlii.laws.africa/

Textes prioritaires a ajouter :

- Identite / sejour : Loi modifiant la loi relative a l'identification des personnes et au sejour des etrangers, 2004
  https://civlii.laws.africa/en/akn/ci/act/2004/303/fra@2023-08-10
- Identite / sejour : Decret portant modalites d'application de la carte nationale d'identite biometrique, 2019
  https://civlii.laws.africa/en/akn/ci/act/decree/2019/945/fra@2021-03-21
- Identite / sejour : Decret relatif a l'enregistrement au registre national des personnes physiques, 2019
  https://civlii.laws.africa/en/akn/ci/act/decree/2019/776/fra@2023-10-13
- Detention : Decret portant reglementation des etablissements penitentiaires et fixant les modalites d'execution de la detention des personnes, 2023
  https://civlii.laws.africa/en/akn/ci/act/decree/2023/239/fra@2025-03-28
- Contraventions : Loi relative aux peines applicables en matiere de contraventions et aux amendes forfaitaires, 1963
  https://civlii.laws.africa/en/akn/ci/act/1963/526/fra@2024-01-17
- Contraventions : Decret determinant les modalites d'application de la loi sur les contraventions et amendes forfaitaires, 1963
  https://civlii.laws.africa/en/akn/ci/act/decree/1963/530/fra@2024-01-17
- Manifestations : Decret portant interdiction des marches et manifestations sur la voie et dans les lieux publics, 1995
  https://civlii.laws.africa/en/akn/ci/act/decree/1995/721/fra@2024-01-17
- Mineurs : Circulaire relative aux infractions commises par des mineurs, 2017
  https://civlii.laws.africa/en/akn/ci/act/instructions/2017/10-mjdh-cab/fra@2023-08-10

## Comment les recuperer

1. Ouvrir la fiche du texte sur CNDJ / Laws.Africa et verifier que la version est en francais et a jour.
2. Copier l'URL HTML finale et l'URL PDF officielle.
3. Ajouter l'entree dans `scripts/source-registry.ts` avec : `id`, `title`, `htmlUrl`, `pdfUrl`, `sourceRank`, `lawNumber`, `documentType`, `focusTags`.
4. Lancer `npm run corpus:build` puis `npm run corpus:check`.
5. Verifier les sorties dans `data/raw_pdfs/`, `data/extracted/` et `data/corpus/`.

## Regles simples

- utiliser seulement des sources officielles CNDJ / Laws.Africa
- preferer les textes generaux avant les textes tres secondaires
- garder le perimetre police <-> citoyen avant d'ouvrir d'autres domaines du droit