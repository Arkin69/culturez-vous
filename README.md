# Culturez-vous

Un annuaire des meilleurs vulgarisateurs YouTube francophones. Pour chacun :

- une **analyse rapide** : style, points forts, public visé, niveau, format ;
- une sélection **« Par où commencer »** ;
- la **liste de toutes ses vidéos**, avec recherche et filtres (durée, année, tri).

L'objectif : donner envie d'aller les regarder. Toutes les vidéos s'ouvrent sur YouTube, donc les vues reviennent aux créateurs.

**47 vulgarisateurs** sont répartis en **9 domaines** :

- Sciences & Univers
- Maths & Informatique
- Vivant & Santé
- Climat & Énergie
- Histoire
- Philosophie & Esprit critique
- Sciences humaines & sociales
- Arts & Culture
- Tech & Ingénierie

Une fois en ligne : https://arkin69.github.io/culturez-vous/

## Ce que propose le site

| Page | Contenu |
|---|---|
| Accueil | Recherche, choix d'un domaine, « Vous avez combien de temps ? » (une vidéo tirée au hasard selon la durée), sélection de la semaine, dernières vidéos |
| Domaine | Présentation du domaine, tableau comparatif (niveau, durée typique, rythme, activité, abonnés), fiches, dernières vidéos |
| Vulgarisateur | Analyse, points forts, chiffres clés, par où commencer, catalogue complet filtrable, chaînes similaires |
| Vulgarisateurs | Les 47 fiches, filtrables par domaine, niveau, activité, et triables |
| Toutes les vidéos | Catalogue global : recherche dans les titres et les noms, filtres par domaine, vulgarisateur, durée et année |
| À propos | Critères de sélection, méthode, origine des données, vie privée |

Le site est 100 % statique (Astro). Il n'a ni cookie ni outil de mesure d'audience, et fonctionne en thème clair et sombre.

## Démarrer en local

Prérequis : Node.js 22.23 ou plus récent.

```sh
npm install
npm run dev       # http://localhost:4321/culturez-vous/
npm test          # tests unitaires (Vitest)
npm run check     # vérification des types
npm run build     # site statique dans dist/
```

## Les données YouTube

Le script `scripts/fetch-youtube.mjs` met à jour `src/data/channels.json` et `src/data/videos/<fiche>.json`. Il a deux modes.

| Mode | Commande | Ce qu'il récupère |
|---|---|---|
| **API** (recommandé) | `YOUTUBE_API_KEY=… npm run fetch` | Toutes les vidéos longues de chaque chaîne (sans les Shorts), avec durées, vues et abonnés exacts. Mise à jour incrémentale. |
| **Sans clé** | `npm run fetch -- --mode rss` | Les 15 dernières vidéos de chaque chaîne (flux RSS), les durées et les abonnés approximatifs (page publique de la chaîne). |

Autres options :

- `--full` relit tout le catalogue au lieu de faire une mise à jour incrémentale ;
- `--only nota-bene,micmaths` ne traite que certaines fiches.

Les données actuellement dans le dépôt viennent du mode sans clé. Le catalogue complet arrive au premier passage avec la clé API. Le coût est d'environ 500 unités au premier passage et d'environ 100 ensuite, très en dessous du quota gratuit de 10 000 unités par jour.

## Mise en ligne sur GitHub Pages

À faire une seule fois :

1. **Créer une clé API YouTube.**
   1. Dans la [console Google Cloud](https://console.cloud.google.com/), créez un projet.
   2. Activez **YouTube Data API v3**.
   3. Dans *Identifiants*, créez une **clé API**.
   4. Conseillé : limitez-la à l'API YouTube Data v3.
2. **L'ajouter au dépôt.** Dans *Settings → Secrets and variables → Actions → New repository secret*, créez le secret `YOUTUBE_API_KEY` avec la clé comme valeur.
3. **Activer Pages.** Dans *Settings → Pages*, choisissez *Source : GitHub Actions*. Le dépôt doit être public, ou votre compte GitHub payant.
4. **Mettre le code sur `main`.** Fusionnez la branche de développement dans `main` et faites de `main` la branche par défaut : les mises à jour programmées ne tournent que sur la branche par défaut.
5. **Lancer une première fois.** Dans *Actions → Mise à jour et déploiement → Run workflow*, lancez le workflow : il récupère le catalogue complet, l'enregistre dans le dépôt et publie le site.

Ensuite, tout est automatique. Le workflow `.github/workflows/deploy.yml` :

- se lance chaque lundi ;
- met à jour les données et les enregistre dans le dépôt ;
- lance les tests, reconstruit le site et le publie.

Chaque modification poussée sur `main` est aussi publiée.

Pour publier ailleurs (Vercel, Netlify, domaine personnel), définissez `SITE_URL` et `SITE_BASE` au moment du build, par exemple `SITE_BASE=/` pour un domaine dédié.

## Ajouter un vulgarisateur

1. Créez `src/content/creators/<identifiant>.md` en vous inspirant d'une fiche existante :

   ```yaml
   ---
   name: "Nom de la chaîne"
   author: "Prénom Nom"            # facultatif
   handle: "@HandleYouTube"
   channelId: UC…                   # facultatif : le script le complète
   domains: [histoire, arts-culture] # le premier est le domaine principal
   tagline: "Une phrase qui donne envie."
   level: debutant                  # debutant | intermediaire | avance
   format: "Durée et forme des vidéos"
   forWho: "Le public visé"
   strengths:
     - "Point fort 1"
     - "Point fort 2"
     - "Point fort 3"
   similar: [nota-bene, micmaths]   # identifiants d'autres fiches
   startWith: []                    # facultatif : IDs de vidéos choisies à la main
   ---
   Deux ou trois paragraphes d'analyse.
   ```

2. Lancez `npm run fetch -- --only <identifiant>` (avec ou sans clé) pour récupérer ses données.
3. Lancez `npm run build` : le build échoue si un domaine ou une fiche « similaire » n'existe pas.

Les domaines se trouvent dans `src/content/domains/`. La teinte `hue` colore le domaine dans tout le site.

## Organisation du code

```
src/content/          fiches éditoriales (domaines, vulgarisateurs) en Markdown
src/data/             données YouTube générées par le script (ne pas modifier à la main)
src/lib/              calculs : statistiques, formatage français, filtres (testés)
src/components/       cartes, avatar, liste de vidéos filtrable, sélecteur de durée
src/scripts/          code exécuté dans le navigateur (filtres, cartes vidéo)
src/pages/            pages du site ; catalogue.json.ts produit l'index global des vidéos
scripts/              récupération des données YouTube
tests/                tests Vitest et réponses d'API simulées
```
