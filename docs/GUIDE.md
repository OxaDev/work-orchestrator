# Guide d'utilisation

Work Orchestrator réunit votre agenda de consultant (demi-journées, sujets, tâches) et la
documentation des architectures de vos clients. Ce guide décrit l'usage quotidien ; l'installation
et l'exploitation sont dans [OPERATIONS.md](OPERATIONS.md).

## Premiers pas

1. **Connexion** avec le compte créé par `make deploy` (ou par l'administrateur).
2. **Paramètres > Profil** :
   - votre **ESN**, recopiée sur chaque nouvelle mission ;
   - votre **région de jours fériés**, pour le pré-remplissage de l'agenda ;
   - la **langue** (FR/EN) et le **thème** (clair, sombre, système), qui vous suivent d'un poste à l'autre.
3. **Annuaire** : créez le client et son organisation (directions, pôles, équipes), puis vos contacts.
4. **Missions > Nouvelle mission** : client, ESN, poste, dates. La mission porte ensuite
   technologies et contacts ; ses **projets** (onglet **Projets**) portent la documentation et
   les architectures de chaque chantier.
5. **Contexte de travail** (haut du menu) : choisissez la **mission courante** puis le **projet
   courant**. Les pages Documents et Architecture s'ouvrent alors sur ce projet ; le choix est
   mémorisé dans le navigateur.
6. **Agenda** : ouvrez le mois courant. Les jours fériés sont déjà posés ; sélectionnez des
   demi-journées et affectez-les à la mission, ou appliquez une **semaine type**.

## La journée type

- **Accueil > Préparer mon standup** : soldez les tâches d'hier (faite, reportée, annulée),
  planifiez aujourd'hui, puis **Copier mon standup** pour le coller dans l'outil de l'équipe.
- **`n`** n'importe où : saisie rapide d'une tâche (aujourd'hui, matin avant 13 h).
- **`Ctrl+K`** (`⌘K` sur Mac) : recherche dans tout (documents, tâches, sujets, missions,
  contacts, domaines…) et actions rapides (nouvelle tâche, aujourd'hui, semaine, standup,
  nouveau document, nouvelle mission).

## Agenda

- **Vues** : année (synthèse et verrous), mois (saisie), semaine et jour (tâches), standup.
- **Sélection dans le mois** : clic sur une demi-journée, `Maj`+clic pour une plage, glisser
  pour peindre, clic sur le numéro du jour pour la journée entière. Au clavier : flèches pour se
  déplacer, `Entrée` ou `Espace` pour sélectionner, `Maj+Entrée` pour étendre.
- **Types de demi-journée** : mission, intercontrat, formation, congé, férié, maladie, avec des
  sous-types configurables (Annuaire > Types de journée).
- **Sujets et tâches** : une tâche appartient à un sujet et se place dans une demi-journée
  compatible (pas de sujet de mission sur un congé, par exemple).
- **Semaines types** (Agenda > Semaines types) : dessinez une semaine (3 jours sur site,
  2 en télétravail…), puis appliquez-la à une plage avec prévisualisation.
- **Verrouillage du mois** une fois le CRA envoyé : plus aucune modification possible
  sans le déverrouiller.

## Projets

- Une mission se découpe en **projets** (onglet **Projets** de la mission). Un projet regroupe
  un arbre de documents et les architectures du client sur lesquelles il porte ; une même
  architecture peut servir à plusieurs projets.
- La page d'un projet a trois onglets : **Documents**, **Architectures** (lier, délier, créer)
  et **À propos**. L'ouvrir en fait le projet courant.
- Un projet qui contient des documents ne se supprime pas : archivez-le. Une mission qui a des
  projets non plus.
- Les missions qui avaient déjà des architectures ou des documents rattachés ont reçu un projet
  **Général** lors de la mise à jour.

## Documents

- La liste s'ouvre sur le **projet courant** ; le sélecteur **Périmètre** passe à la mission
  courante (un groupe par projet), aux pages **hors projet** ou à **tous** les documents.
- Les pages sont **triées par ordre alphabétique** à chaque niveau. **Glissez** une page (par
  sa poignée) sur une autre pour l'y ranger, ou sur la zone « premier niveau » d'un groupe pour
  la sortir de son parent (et la placer dans ce projet). Ses sous-pages la suivent. Au clavier,
  utilisez le champ **Page parente** du document.
- Une sous-page appartient toujours au projet de sa page racine.
- Trois modes d'affichage : **Édition** (par défaut, on écrit directement dans la page mise
  en forme, comme dans Notion), **Markdown** (le texte source, lisible en thème sombre) et
  **Aperçu** (lecture seule). Le document reste enregistré en Markdown.
- **`/`** en mode Édition ouvre le menu des blocs : paragraphe, titres 1 à 3, listes à puces,
  numérotée ou de tâches, citation, bloc de code, diagramme **Mermaid** (dessiné sous son
  code), tableau, séparateur, lien vers un document ou une autre fiche, fichier. Flèches pour
  choisir, `Entrée` pour valider, `Échap` pour fermer.
- **`[[`** propose les liens vers un document, une mission, un contact, un domaine… ; les
  rétroliens apparaissent sur la page cible. Coller l'adresse d'un document de l'application
  insère un lien vers lui. `Ctrl`+clic (`⌘`+clic) sur un lien l'ouvre.
- **Nouveau sous-document** crée une page rangée sous le document ouvert.
- **Supprimer** une page supprime aussi ses sous-pages et leur historique, après confirmation.
  Pour les garder, déplacez-les d'abord ou archivez la page.
- Glissez une image ou un fichier dans l'éditeur pour l'attacher (20 Mo au plus).
- **`Ctrl+S`** (`⌘S`) enregistre une version ; le brouillon est sauvegardé automatiquement.
  L'historique permet de consulter et de restaurer une version.
- **Importer du Markdown** : un dossier zippé de notes, par exemple un coffre Obsidian. Les
  dossiers deviennent des pages, les `[[liens]]` et les images sont conservés.
- **Exporter** : copie Markdown (liens en texte ou en URL absolues, diagrammes en SVG).

## Architecture

- La liste s'ouvre sur les architectures du **projet courant** (**Toutes** pour revenir à la
  vue par client).
- Par client : des **architectures** (SI cible, existant…) contenant des **domaines** en
  arbre (application, service, base…), reliés par des **relations** (appelle, publie…).
- **Graphe** : disposition automatique, déplacement manuel mémorisé, création d'une relation
  en tirant d'un domaine à l'autre ; export **Mermaid**, SVG ou PNG.
- Un domaine porte ses technologies, ses sujets (donc le temps passé) et ses liens externes
  (dépôt, supervision…).

## Tableau de bord mission

L'onglet **Vue d'ensemble** d'une mission résume le temps passé et restant, la répartition par
sujet, les tâches récentes et à venir, les technologies (avec une pondération suggérée d'après
le temps passé), les contacts, les architectures de ses projets et les documents. **Missions > Carrière**
retrace toutes vos missions.

## Annuaire

Entreprises, organisations, contacts, technologies, secteurs, étiquettes. **Contacts >
Importer un CSV** montre d'abord ce qui sera créé, ignoré ou refusé ligne par ligne ;
**Exporter en CSV** produit un fichier lisible par Excel.

## Vos données

- **Paramètres > Données > Télécharger l'archive** : tout ce qui vous appartient, en zip
  lisible (JSON, copie Markdown des documents, fichiers).
- **Importer une archive** : dans un compte encore vide d'une autre instance.
- La sauvegarde complète de l'instance (`make backup` / `make restore`) est l'affaire de
  l'administrateur : voir [OPERATIONS.md](OPERATIONS.md).

## Raccourcis

| Touche | Où | Effet |
|--------|----|-------|
| `Ctrl+K` / `⌘K` | partout | recherche et actions rapides |
| `n` | partout (hors champ de saisie) | nouvelle tâche |
| `Ctrl+S` / `⌘S` | document | enregistrer une version |
| `[[` | éditeur | insérer un lien |
| `/` | éditeur, mode Édition | menu des blocs et des liens |
| Flèches | grille du mois | changer de demi-journée |
| `Entrée` / `Espace` | grille du mois | sélectionner ; avec `Maj`, étendre |
| `Échap` | fenêtres | fermer |
