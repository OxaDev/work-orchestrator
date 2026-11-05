# Questions ouvertes

> **Clôturé le 2026-11-05.** Réponse vide ou « Défaut » = hypothèse par défaut retenue. Les décisions qui en découlent sont tracées dans [adr/](adr/README.md).

> Répondre directement sous chaque question (ligne `Réponse :`). Sans réponse, **l'hypothèse par défaut s'applique** et le développement avance avec.
> Les questions marquées 🔴 bloquent une phase précise de la roadmap. Les autres peuvent attendre.
> Les identifiants **H-xx** renvoient aux hypothèses du [cadrage](00-CADRAGE.md).

---

## A. Utilisateurs et usage général

**Q-A1 🔴 (H-01) — Qui utilise l'application ?** Vous seul, ou des collègues consultants de votre société sur la même instance ? Si plusieurs : partagent-ils l'annuaire, les entreprises, les technologies (référentiels communs) tout en gardant leurs agendas privés ?
- Défaut : multi-utilisateur technique, usage mono-utilisateur. Référentiels (entreprises, contacts, technologies) partagés au niveau de l'instance ; agenda, journal et documents privés par `owner_id`.
- Réponse : ✅ Moi seul, modèle multi-utilisateur (`owner_id`). (2026-11-05)

**Q-A2 — Sur quel poste tourne l'application ?** Votre portable, un serveur domestique (NAS, Raspberry Pi) ou un poste fourni par le client ? Faut-il y accéder depuis un autre appareil du réseau local (téléphone) ?
- Défaut : votre portable, accès `localhost` uniquement, écoute sur `127.0.0.1`.
- Réponse : Il faut pouvoir le mettre sous un nginx qui va rediriger un `https://<dns>/work-orchestrator` vers `http://<localhost>:<port de l'app>`

**Q-A3 — Avez-vous des contraintes de confidentialité vis-à-vis de vos clients ?** (données sur un poste personnel, chiffrement exigé, interdiction de stocker certains noms)
- Défaut : aucune contrainte imposée par l'application ; recommandation de chiffrement du disque.
- Réponse : Défaut

**Q-A4 — Le nom de l'application** : « Work Orchestrator » vous convient-il (le dossier s'appelle `work-orcherstrator`, avec une coquille) ?
- Défaut : `work-orchestrator` pour le code, « Work Orchestrator » pour l'interface.
- Réponse : Défaut

**Q-A5 — Mobile** : voulez-vous pouvoir faire votre saisie quotidienne depuis un téléphone ?
- Défaut : responsive tablette, pas d'optimisation spécifique au téléphone en V1.
- Réponse : Défaut

## B. Authentification

**Q-B1 🔴 — Création de comptes** : inscription libre, ou création uniquement par un admin ?
- Défaut : premier compte admin créé par `make init`, les suivants par l'admin uniquement.
- Réponse : Défaut

**Q-B2 — Identifiant de connexion** : e-mail ou nom d'utilisateur ?
- Défaut : e-mail.
- Réponse : Défaut

**Q-B3 — Durée de session** : combien de temps rester connecté ? « Se souvenir de moi » ?
- Défaut : accès 15 min, refresh 30 jours avec rotation.
- Réponse : Défaut

**Q-B4 — Mot de passe oublié** : pas de serveur mail en local. Réinitialisation par l'admin et via une commande `make reset-password` : suffisant ?
- Défaut : oui.
- Réponse : Défaut

**Q-B5 — Politique de mot de passe** : longueur minimale, complexité ?
- Défaut : 12 caractères minimum, pas de règle de complexité, verrouillage temporaire après 5 échecs.
- Réponse : 12 caractères minimum, un chiffre, un symbole (pas relou genre le chapeau), une majuscule, une minuscule

## C. Entreprises, clients et missions

**Q-C1 🔴 (H-11) — Client et société.** Votre phrase « la mission est un client auquel il y a une société derrière » laisse entendre deux entreprises. S'agit-il de :
(a) le **client final** (là où vous travaillez) et un **intermédiaire** (société de portage, ESN partenaire, cabinet titulaire du contrat) ;
(b) le client et **votre propre ESN** ;
(c) autre chose ?
- Défaut : `end_client` obligatoire + `contracting_company` optionnel (intermédiaire). Votre ESN est déclarée une fois dans vos paramètres.
- Réponse : ✅ (b) le client + mon ESN. Pas d'intermédiaire. L'ESN est un paramètre utilisateur, recopié sur chaque mission. (2026-11-05)

**Q-C2 — Chaîne de sous-traitance** : peut-il y avoir plus d'un intermédiaire (vous → ESN → ESN titulaire → client) ?
- Défaut : un seul intermédiaire en V1.
- Réponse : ✅ Sans objet (pas d'intermédiaire).

**Q-C3 (H-10) — Secteurs d'activité** : liste plate, ou hiérarchie (Finance > Banque > Banque de détail) ? Faut-il pré-charger une nomenclature (NAF, GICS) ?
- Défaut : hiérarchie à 2 niveaux, liste initiale courte et modifiable.
- Réponse : Défaut

**Q-C4 — Une entreprise peut-elle avoir plusieurs secteurs ?** (ex. : un groupe banque + assurance)
- Défaut : un secteur principal + secteurs secondaires optionnels.
- Réponse : Défaut

**Q-C5 — Filiales et groupes** : faut-il modéliser « Société Générale » > « Boursorama » ?
- Défaut : oui, `parent_company_id` optionnel.
- Réponse : Défaut

**Q-C6 — Attributs d'une mission** : en plus de l'intitulé de poste, de la date de fin, du client et des architectures, voulez-vous :
- date de début (indispensable pour l'agenda, ajoutée d'office) ;
- date de fin prévue **et** date de fin réelle, renouvellements ou avenants ;
- lieu, politique de télétravail (ex. : 2 j/semaine) ;
- TJM, numéro de bon de commande ;
- objectifs de la mission, livrables ;
- statut (prospect, active, en pause, terminée) ;
- évaluation et bilan de fin de mission ?
- Défaut : tous sauf TJM et bon de commande (voir Q-C7), renouvellements sous forme d'historique de dates de fin.
- Réponse : Défaut

**Q-C7 (H-12) — Données financières** (TJM, chiffre d'affaires généré) : à stocker ou non ?
- Défaut : champ TJM optionnel, masqué par défaut, sans calcul financier en V1.
- Réponse : Défaut

**Q-C8 — Missions simultanées** : pouvez-vous être sur **deux missions en même temps** (ex. : 3 j chez A, 2 j chez B) ? Et sur deux missions dans **la même demi-journée** ?
- Défaut : plusieurs missions actives possibles, mais une seule mission par demi-journée.
- Réponse : Défaut

**Q-C9 — Avant-vente** : les phases d'avant-vente (entretiens client, propositions) sont-elles à suivre ? Sont-elles de l'inter-contrat ?
- Défaut : de l'inter-contrat, avec un sujet « Avant-vente » rattachable à un prospect (mission au statut PROSPECT).
- Réponse : Défaut

## D. Contacts (annuaire global)

**Q-D1 — Champs d'un contact** : nom, prénom, e-mails (pro et perso), téléphones, entreprise, poste, unité organisationnelle, LinkedIn, notes, photo ?
- Défaut : tous sauf photo.
- Réponse : Défaut

**Q-D2 — Historique d'emploi** : un contact qui change d'entreprise, garde-t-on l'historique ?
- Défaut : oui, une table `ContactEmployment` (entreprise, poste, dates).
- Réponse : Défaut

**Q-D3 — Rôles dans une mission** : liste fixe (manager, PO, tech lead, architecte, collègue, RH, commercial ESN) ou libre ?
- Défaut : liste modifiable par l'utilisateur, avec ces valeurs initiales.
- Réponse : Défaut

**Q-D4 — Collègues internes** (vos collègues d'ESN) : sont-ils des contacts comme les autres ?
- Défaut : oui, rattachés à votre ESN.
- Réponse : Défaut

**Q-D5 — Import et export** : import vCard ou CSV depuis Outlook / LinkedIn ?
- Défaut : export et import CSV en phase 11, vCard plus tard.
- Réponse : Défaut

**Q-D6 — RGPD** : les contacts sont des données personnelles de tiers. Souhaitez-vous une purge automatique (ex. : 3 ans après la fin de la mission) ?
- Défaut : pas de purge automatique, export et suppression manuels.
- Réponse : Défaut

## E. Agenda — demi-journées et natures

**Q-E1 🔴 (H-05) — Natures de demi-journée** : la liste MISSION, INTERCONTRACT, TRAINING, LEAVE (congés), PUBLIC_HOLIDAY, SICK_LEAVE, OFF (RTT, week-end travaillé non compté…) est-elle complète ? Faut-il distinguer CP, RTT, congé sans solde, récupération, astreinte ?
- Défaut : liste fixe de natures « système » + **sous-types personnalisables** (ex. : LEAVE > CP, RTT).
- Réponse : Défaut

**Q-E2 — Formation pendant une mission** : une formation payée par l'ESN pendant une mission est-elle TRAINING ou MISSION ? Une formation chez le client ?
- Défaut : la nature décrit **qui finance le temps** : formation ESN = TRAINING, formation client = MISSION.
- Réponse : Défaut

**Q-E3 — Week-ends** : affichés ? saisissables (travail exceptionnel) ?
- Défaut : affichés en grisé, saisissables.
- Réponse : Défaut

**Q-E4 (H-05) — Jours fériés** : France métropolitaine ? Alsace-Moselle ? Autre pays ? Pré-remplissage automatique ?
- Défaut : France métropolitaine via la bibliothèque `holidays`, pré-remplissage automatique, région configurable.
- Réponse : Défaut

**Q-E5 — Lieu de travail** : distinguer sur site, télétravail et déplacement par demi-journée ?
- Défaut : oui (champ optionnel), utile pour les statistiques.
- Réponse : distinguer sur site chez le client, en télétravail depuis l'ESN, en télétravail depuis la maison, en télétravail depuis autre part, en déplacement de mission, en déplacement d'ESN

**Q-E6 — Saisie du passé et du futur** : peut-on planifier à l'avance (congés posés dans 3 mois) et modifier le passé sans limite ? Faut-il **verrouiller** un mois une fois validé (comme un CRA) ?
- Défaut : tout est modifiable ; verrouillage de mois optionnel en phase 13.
- Réponse : comme un CRA

**Q-E7 — Prévu et réalisé** : voulez-vous distinguer ce qui était **prévu** (ex. : semaine type) de ce qui a été **réalisé** pour une demi-journée ?
- Défaut : non pour les demi-journées (une seule valeur), oui pour les tâches (statut PLANNED / DONE).
- Réponse : Défaut

**Q-E8 — Demi-journée vide** : une demi-journée passée non saisie est-elle signalée (rappel) ?
- Défaut : oui, badge « jours non saisis » sur le tableau de bord.
- Réponse : Défaut

## F. Agenda — semaines types

**Q-F1 — Contenu d'une semaine type** : seulement la nature et la mission de chaque demi-journée, ou aussi le lieu (télétravail le mardi) et des tâches récurrentes (daily à 9h30) ?
- Défaut : nature + mission + lieu ; tâches récurrentes en phase 13.
- Réponse : Défaut

**Q-F2 — Application** : on applique une semaine type sur une plage de dates à la demande ; ou faut-il une **semaine type par défaut** appliquée automatiquement aux semaines futures ?
- Défaut : application manuelle avec prévisualisation + option « semaine type par défaut de la mission » pour pré-remplir.
- Réponse : Défaut

**Q-F3 — Semaines alternées** : besoin de cycles (semaine A / semaine B) ?
- Défaut : non en V1, on applique deux modèles sur des plages différentes.
- Réponse : Défaut

**Q-F4 — Jours fériés et congés lors de l'application** : la semaine type doit-elle sauter les jours fériés et congés déjà posés ?
- Défaut : oui, les demi-journées déjà renseignées sont conservées (RG-10).
- Réponse : Défaut

## G. Agenda — journal, sujets et tâches

**Q-G1 🔴 — Le format « hier / aujourd'hui »** : est-ce un texte libre (journal), une liste de tâches structurées, ou les deux ? Faut-il aussi un « blocages / points d'attention » (format daily scrum) ?
- Défaut : les deux. Un `DailyLog` en Markdown avec trois sections (fait, prévu, blocages) + des tâches structurées. L'écran Standup génère le texte à partir des tâches, prêt à être lu en daily.
- Réponse : Défaut

**Q-G2 — Granularité temporelle des tâches** : le prompt dit « commence à un moment et dure une certaine durée ». Faut-il des heures précises, ou une durée seule suffit-elle ? Pas de quart d'heure minimum ?
- Défaut : heure de début optionnelle, durée obligatoire, pas de 15 min.
- Réponse : Défaut

**Q-G3 — Tâche sur plusieurs demi-journées** : une tâche qui dure 3 jours, est-ce une tâche, ou une tâche par demi-journée rattachée à un même sujet ?
- Défaut : une tâche appartient à une demi-journée ; le **sujet** porte la continuité. Bouton « reporter à la prochaine demi-journée ».
- Réponse : Défaut

**Q-G4 🔴 — Sujets** : un sujet ressemble à un ticket ou une user story (« Migration Kafka », « Refonte du SSO »). Profondeur des sous-sujets illimitée ? Statut (ouvert, terminé) ? Lien vers un ticket externe (Jira) ?
- Défaut : profondeur illimitée, statut, URL externe optionnelle.
- Réponse : Défaut

**Q-G5 — Lien sujet ↔ domaine** : un sujet peut-il être rattaché à un ou plusieurs domaines d'architecture (« Migration Kafka » touche les domaines Paiement et Notification) ?
- Défaut : oui, plusieurs-à-plusieurs. C'est le lien le plus fort entre les deux sous-apps.
- Réponse : Défaut

**Q-G6 — Sujets d'inter-contrat** : quels types ? (veille, formation, avant-vente, projet interne, rédaction d'articles, préparation de certification…)
- Défaut : portée INTERCONTRACT + catégories modifiables avec ces valeurs.
- Réponse : Défaut

**Q-G7 (H-02) — Règle de cohérence inverse** : vous avez précisé qu'une tâche d'inter-contrat ne peut pas être dans une demi-journée mission. Une tâche de la mission A peut-elle être placée dans une demi-journée de la mission B ? Une tâche de mission pendant une demi-journée d'inter-contrat (ex. : un dépannage) ?
- Défaut : non dans les deux cas (règle stricte, RG-04).
- Réponse : Défaut

**Q-G8 (H-03) — Tâches pendant une formation** : autorisées (ex. : sujets de type formation) ?
- Défaut : TRAINING n'accepte que des sujets de portée TRAINING ; LEAVE, SICK et PUBLIC_HOLIDAY n'acceptent rien.
- Réponse : Défaut

**Q-G9 (H-04) — Dépassement** : 6 h de tâches dans une demi-journée, est-ce une erreur ou un simple avertissement ?
- Défaut : avertissement.
- Réponse : Défaut

**Q-G10 — Réunions** : faut-il un type de tâche « réunion » avec participants (contacts) ? Compte rendu en Markdown ?
- Défaut : oui, `Task.kind = MEETING` + participants + note. C'est très utile pour retrouver « qui a dit quoi ».
- Réponse : Défaut

## H. Architecture et domaines

**Q-H1 🔴 — Architecture et mission** : une architecture appartient-elle à **une seule** mission, ou peut-elle être partagée (même client, deux missions successives, la même architecture enrichie) ? Peut-elle exister **sans mission** (architecture de référence, projet perso) ?
- Défaut : rattachement plusieurs-à-plusieurs à des missions, et existence sans mission possible.
- Réponse : Défaut

**Q-H2 🔴 — Domaine et client** : un domaine est « présent dans une ou plusieurs architectures ». Ces architectures sont-elles forcément du **même client** ? (un domaine « Paiement » du client A n'a rien à voir avec celui du client B)
- Défaut : un domaine appartient à **une entreprise** (le client) et ne peut être utilisé que dans les architectures liées à ce client.
- Réponse : Défaut

**Q-H3 (H-20) — Types de domaines** : distinguer domaine métier (DDD : bounded context), application, composant, service, base de données, file de messages, système externe ?
- Défaut : un champ `kind` avec : BUSINESS_DOMAIN, APPLICATION, SERVICE, DATABASE, MESSAGING, EXTERNAL_SYSTEM, INFRASTRUCTURE, OTHER — et une icône par type.
- Réponse : Défaut

**Q-H4 — Sous-domaine et appartenance** : un sous-domaine peut-il avoir **plusieurs parents** (graphe) ou un seul (arbre) ?
- Défaut : un seul parent (arbre). Les autres liens passent par les relations.
- Réponse : Défaut

**Q-H5 — Types de relations** : la liste CALLS, DEPENDS_ON, PUBLISHES_TO, SUBSCRIBES_TO, READS_FROM, WRITES_TO vous convient ? Faut-il pouvoir ajouter des types personnalisés ? Porter des attributs (protocole, fréquence, volumétrie, synchrone/asynchrone) ?
- Défaut : liste fixe + CUSTOM avec libellé, attributs protocole et sync/async.
- Réponse : Défaut

**Q-H6 — Responsable d'un domaine** : « une direction / un pôle / une équipe / un développeur responsable ». Est-ce **un seul** de ces niveaux (le plus précis connu) ou **tous** à la fois ? Plusieurs responsables possibles ?
- Défaut : une unité organisationnelle responsable (direction, pôle ou équipe, au niveau le plus précis connu) + un contact référent optionnel. Les niveaux supérieurs se déduisent de l'arbre.
- Réponse : Défaut

**Q-H7 — Organisation client** : la hiérarchie est-elle toujours Direction > Pôle > Équipe, ou variable (tribu, squad, chapter, département…) ?
- Défaut : arbre libre, le type de chaque niveau est un libellé modifiable.
- Réponse :

**Q-H8 — Historisation de l'architecture** : voulez-vous voir l'architecture **telle qu'elle était** à une date (avant ou après une migration) ? Avoir des états « actuel » et « cible » ?
- Défaut : pas d'historisation en V1 ; un champ `lifecycle` (CURRENT, TARGET, DEPRECATED) par domaine et par relation permet de représenter actuel et cible.
- Réponse :

**Q-H9 — Environnements et infrastructure** : faut-il documenter les environnements (dev, recette, prod), les URL, les dépôts Git, les pipelines ?
- Défaut : liens libres attachés à un domaine (type, libellé, URL) ; pas de modèle dédié en V1.
- Réponse :

**Q-H10 — Diagrammes Mermaid** : quels types d'export souhaitez-vous ? `flowchart` (graphe des domaines) est prévu. Aussi : `C4Context`, `sequenceDiagram`, `erDiagram`, carte mentale (`mindmap`) de l'arbre des domaines ?
- Défaut : `flowchart` + `mindmap` en V1 ; C4 plus tard.
- Réponse :

**Q-H11 — Édition du graphe** : créer et relier les domaines **directement dans la vue graphe** (glisser une arête entre deux nœuds), ou seulement via formulaires ? Les positions des nœuds doivent-elles être mémorisées ?
- Défaut : création de relations dans le graphe + formulaires ; disposition automatique avec positions mémorisées si déplacées à la main.
- Réponse :

**Q-H12 — Import Mermaid** : coller un diagramme Mermaid existant pour créer les domaines et relations ?
- Défaut : non en V1 (phase 13).
- Réponse :

## I. Documentation Markdown

**Q-I1 🔴 — Organisation des documents** : arborescence de pages façon Notion (pages et sous-pages) ? Ou documents attachés aux entités (mission, domaine, sujet) ? Ou les deux ?
- Défaut : les deux. Chaque document a un parent optionnel (arbre de pages) et des rattachements à des entités.
- Réponse :

**Q-I2 — Éditeur** : éditeur Markdown brut avec aperçu côte à côte (style VS Code), ou éditeur WYSIWYG (style Notion, avec `/` pour les blocs) ?
- Défaut : Markdown brut + aperçu (fidélité garantie au copier-coller). WYSIWYG en option plus tard.
- Réponse :

**Q-I3 — Saveur de Markdown cible** : vers quels outils copiez-vous ? Confluence, GitLab, GitHub, Azure DevOps, Notion ? (Confluence ne gère pas Mermaid nativement)
- Défaut : GitHub Flavored Markdown ; option d'export avec les diagrammes Mermaid convertis en image SVG/PNG pour Confluence.
- Réponse :

**Q-I4 — Images et pièces jointes** : coller des captures d'écran, joindre des PDF ?
- Défaut : images oui (stockées dans un volume), autres pièces jointes oui avec taille limitée (20 Mo).
- Réponse :

**Q-I5 — Wikilinks** : syntaxe `[[Nom du domaine]]` ou `[[domain:paiement]]` avec autocomplétion ? Vers quelles entités (documents, domaines, contacts, missions, sujets, technologies) ?
- Défaut : autocomplétion sur `[[` ; toutes ces entités ; rétroliens affichés sur chaque entité.
- Réponse :

**Q-I6 — Versions** : historique de chaque sauvegarde, ou versions nommées manuelles ? Comparaison (diff) entre versions ?
- Défaut : sauvegarde automatique (brouillon) + version créée à chaque enregistrement explicite ; diff en phase 10.
- Réponse :

**Q-I7 — Modèles de documents** : pré-remplir des modèles (fiche domaine, compte rendu de réunion, ADR, onboarding mission, rapport d'étonnement) ?
- Défaut : oui, modèles modifiables.
- Réponse :

**Q-I8 — Import** : importer un dossier de fichiers `.md` existants (Obsidian, notes perso) ?
- Défaut : import d'un zip de Markdown en phase 11.
- Réponse :

## J. Technologies et pondération

**Q-J1 (H-30) — Échelle de pondération** : 1 à 5, pourcentage, ou catégories (principale, secondaire, ponctuelle) ?
- Défaut : 1 à 5 avec libellés (1 = effleurée … 5 = cœur de la mission).
- Réponse :

**Q-J2 (H-31) — Calcul de la pondération** : manuelle, ou **calculée** (à partir des technologies des domaines et du temps passé sur les sujets liés) ?
- Défaut : manuelle, avec une suggestion calculée affichée à côté.
- Réponse :

**Q-J3 — Catalogue de technologies** : liste libre, ou pré-chargée (langages, frameworks, bases, cloud, outils) avec catégories et logos ?
- Défaut : pré-chargement d'environ 150 technologies courantes avec catégories, sans logos (pas d'appel externe).
- Réponse :

**Q-J4 — Versions** : distinguer Java 8 de Java 21, Angular 12 d'Angular 18 ?
- Défaut : version optionnelle sur le lien (mission ou domaine ↔ technologie), pas sur la technologie elle-même.
- Réponse :

**Q-J5 — Niveau de compétence personnel** : en profiter pour suivre **votre** niveau par technologie (pour CV, entretien annuel) ?
- Défaut : non en V1 ; module compétences en phase 13.
- Réponse :

## K. Tableau de bord mission et vues transverses

**Q-K1 — Indicateurs souhaités sur la page mission** : jours passés, répartition par sujet, technologies pondérées, contacts, documents, dernières tâches. Autre chose (jours restants avant la fin, burn-down, bilan) ?
- Défaut : la liste + jours restants.
- Réponse :

**Q-K2 — Page d'accueil** : que voir en arrivant ? (journée du jour à saisir, mission en cours, tâches prévues, jours non saisis)
- Défaut : tout cela.
- Réponse :

**Q-K3 — Vue « carrière »** : une frise de toutes vos missions dans le temps, avec les technologies de chacune ?
- Défaut : oui, en phase 9.
- Réponse :

**Q-K4 — Recherche** : plein texte dans le contenu des documents et des journaux, ou titres seulement ?
- Défaut : plein texte (Postgres `tsvector`, dictionnaires français et anglais).
- Réponse :

## L. Exports, CRA et intégrations

**Q-L1 — CRA** : votre ESN vous demande-t-elle un compte rendu d'activité mensuel ? Sous quel format (Excel, PDF, saisie dans un outil) ? Un export de l'agenda au bon format vous ferait-il gagner du temps ?
- Défaut : export CSV et PDF mensuel en phase 13.
- Réponse :

**Q-L2 — Calendrier externe** : exporter l'agenda en ICS (Outlook, Google), ou importer vos réunions Outlook ?
- Défaut : export ICS en phase 13, pas d'import.
- Réponse :

**Q-L3 — Réversibilité** : export complet (JSON + dossier Markdown) pour ne jamais être prisonnier de l'outil ?
- Défaut : oui, phase 11.
- Réponse :

**Q-L4 — IA** : intérêt pour un assistant (résumé d'une semaine, génération du standup, question sur la doc) ? Cela impliquerait un appel externe (API) ou un modèle local (Ollama).
- Défaut : hors V1. Architecture prévue pour l'ajouter.
- Réponse :

## M. Technique et exploitation

**Q-M1 🔴 (H-40) — Base de données** : PostgreSQL (recommandé) ou SQLite (un seul fichier, plus simple à sauvegarder, mais moins adapté au plein texte et aux requêtes récursives complexes) ?
- Défaut : PostgreSQL 17 dans Docker Compose.
- Réponse : ✅ PostgreSQL. (2026-11-05)

**Q-M2 🔴 (H-41) — TypeScript** côté front : d'accord ?
- Défaut : oui.
- Réponse : ✅ TypeScript. (2026-11-05)

**Q-M3 🔴 (H-42) — Bibliothèque UI** : Mantine (recommandé, complet), shadcn/ui + Tailwind (plus de contrôle visuel, plus de travail), MUI, Ant Design ?
- Défaut : Mantine.
- Réponse : ✅ Mantine. (2026-11-05)

**Q-M4 (H-43) — Seuils de couverture** : 85 % back, 70 % front, bloquants ?
- Défaut : oui.
- Réponse :

**Q-M5 — Git et CI** : dépôt Git local ? Distant (GitHub, GitLab) ? Une CI (GitHub Actions) qui lance `make test` ?
- Défaut : `git init` en phase 0 ; CI GitHub Actions préparée mais optionnelle.
- Réponse :

**Q-M6 — Ports** : préférence de ports (front 8080, API 8000, Postgres non exposé) ?
- Défaut : ceux-là.
- Réponse :

**Q-M7 — Sauvegardes** : fréquence (manuelle via `make backup`, ou automatique quotidienne via un conteneur dédié) ? Rétention ? Destination (dossier local, disque externe, cloud perso) ?
- Défaut : `make backup` manuel + conteneur de sauvegarde quotidienne optionnel, rétention 30 jours, dossier `./backups`.
- Réponse :

**Q-M8 — Environnement de développement** : macOS (Apple Silicon) uniquement ? Node et Python déjà installés, ou tout dans Docker ?
- Défaut : macOS Apple Silicon, `uv` et Node 22 installés localement pour le dev, Docker pour le déploiement.
- Réponse :

**Q-M9 — Données de démo** : un jeu de données fictif (2 clients, 3 missions, 6 mois d'agenda, une architecture) pour développer et faire des démos ?
- Défaut : oui, via `make seed`.
- Réponse :

## N. Interface

**Q-N1 — Langue par défaut** : français ou anglais ? Le format des dates et la semaine (début le lundi) suivent-ils la langue ?
- Défaut : français, semaine commençant le lundi, format de date selon la langue.
- Réponse :

**Q-N2 — Couleurs de l'agenda** : couleur par **nature** (mission en bleu, congés en vert…) ou par **mission** (chaque mission sa couleur) ?
- Défaut : par mission pour les demi-journées MISSION, par nature pour les autres ; légende toujours visible.
- Réponse :

**Q-N3 — Raccourcis clavier** : souhaités (saisie rapide de la journée, navigation `j`/`k`, `Ctrl+K`) ?
- Défaut : `Ctrl+K` + quelques raccourcis d'agenda.
- Réponse :

**Q-N4 — Thème** : clair, sombre, suivre le système ?
- Défaut : suivre le système, commutable.
- Réponse :

## O. Entités supplémentaires proposées

Votre liste n'étant pas exhaustive, voici des entités qui me semblent utiles. Indiquez pour chacune : **V1**, **plus tard**, ou **non**.

| Entité proposée | Intérêt | Défaut |
|-----------------|---------|--------|
| `Tag` | Classement transverse (documents, sujets, domaines) | V1 |
| `OrgUnit` | Direction, pôle, équipe du client (nécessaire pour les responsables de domaine) | V1 |
| `ContactEmployment` | Historique des postes d'un contact | V1 |
| `Meeting` (via `Task.kind`) | Réunions avec participants et compte rendu | V1 |
| `DocumentTemplate` | Modèles de documents | V1 |
| `Attachment` | Images et pièces jointes | V1 |
| `ExternalLink` | URL typées (dépôt Git, Jira, Confluence, environnement) sur domaine, mission ou sujet | V1 |
| `Decision` (ADR) | Décisions d'architecture : contexte, options, décision, date, décideurs | Plus tard |
| `GlossaryTerm` | Glossaire métier du client (acronymes !) | Plus tard |
| `Risk` / `Issue` | Points de vigilance et risques par mission | Plus tard |
| `Achievement` | Réalisations notables (pour le bilan de mission, le CV, l'entretien annuel) | Plus tard |
| `Skill` | Compétences personnelles et leur niveau | Plus tard |
| `Certification` / `Training` | Formations suivies, certifications obtenues, liées aux demi-journées TRAINING | Plus tard |
| `MissionReview` | Bilan de fin de mission (rapport d'étonnement, enseignements) | Plus tard |
| `Reminder` | Rappels (fin de mission dans 1 mois, renouvellement) | Plus tard |

- Réponse :
