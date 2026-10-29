# Deadlock — L’Atelier

Laboratoire de création de builds Deadlock, avec comparaison de trajectoires et prise en compte des parties du joueur.

La priorité est l’éditeur et son retour sur les choix. L’analyse après partie est la seconde priorité ; le suivi live est reporté. Les décisions produit sont conservées dans [docs/PRODUIT.md](docs/PRODUIT.md), les recherches et sources dans [docs/recherche/ETUDE.md](docs/recherche/ETUDE.md).

La direction visuelle reprend les codes du client : cartes d’objets, groupes de build et catégories colorées pour l’éditeur ; fond sombre, portraits, tracés Ambre/Saphir et chronologies interactives pour les statistiques. Les références primaires, la palette et les choix d’affichage sont consignés dans [docs/DA.md](docs/DA.md). Les détails méthodologiques sont accessibles à la demande dans l’interface.

Première version fonctionnelle :

- Plan d’achat par phase, réorganisation, adaptations conditionnelles, sauvegarde locale et import/export JSON.
- Catalogue de combat versionné de 156 objets et 4 héros : Infernus, Haze, Seven et Wraith. La review reconnaît séparément 65 héros avec leurs noms et les portraits disponibles.
- Comparaison de deux achats depuis un même inventaire et référence A/B de la trajectoire.
- Courbes exploratoires de l’arme, des PV et de la puissance Spirit, par budget ou temps indicatif.
- Historique via l’API communautaire ou import JSON. Économie et précision du héros choisi alimentent réellement les calculs lorsqu’elles sont disponibles.
- Historique paginé et review plein écran sans défilement : bilan personnel, une page par moment et adaptation, puis courbes et bilan des équipes. Carte du jeu centrale sur les versions récentes prises en charge, lecture des scènes, navigation clavier et transitions. Calcul en arrière-plan et retour de l’inventaire observé vers le laboratoire. Les règles et limites sont documentées dans [docs/REVIEW.md](docs/REVIEW.md).

Sous Windows, le plus simple est de télécharger [Installer-Deadlock.cmd](https://raw.githubusercontent.com/Mortann/DeadlockBuildCreator/codex/deadlock-build-lab/Installer-Deadlock.cmd), puis de faire un double-clic. Node.js 24 ou plus récent est nécessaire (le fichier ouvre le site officiel s’il manque). Git n’est pas nécessaire.

L’installateur récupère la branche de développement depuis GitHub dans `%LOCALAPPDATA%\DeadlockBuildCreator`, crée un raccourci **Deadlock Atelier** sur le Bureau et dans le menu Démarrer, puis lance le site. Les prochains lancements recherchent les mises à jour et n’installent les dépendances que si nécessaire. Le navigateur s’ouvre sur `http://localhost:5173` une fois le serveur prêt. Gardez sa fenêtre ouverte ; `Ctrl+C` l’arrête.

Le port et l’adresse restent fixes pour retrouver les profils et builds du même navigateur. Si un ancien serveur utilise déjà le port, fermez sa fenêtre avant de relancer. Le fichier `.env` est conservé lors des mises à jour ; des modifications personnelles du code bloquent la mise à jour plutôt que d’être remplacées. En cas de connexion indisponible, le raccourci essaie de lancer la version déjà installée.

Si vous utilisez déjà une archive extraite ou un clone, un double-clic sur **Demarrer.cmd** suffit pour installer les dépendances et ouvrir le site. La synchronisation automatique concerne seulement les installations gérées par l’installateur. Les sources de développement sont dans la branche [`codex/deadlock-build-lab`](https://github.com/Mortann/DeadlockBuildCreator/tree/codex/deadlock-build-lab), en attente de revue.

Installation manuelle avec Node.js 24 et npm :

```sh
npm ci
npm run dev
```

Sous Windows PowerShell, si `npm.ps1` est bloqué, utilisez les commandes suivantes depuis le dossier contenant `package.json` :

```powershell
npm.cmd ci
npm.cmd run dev
```

Ouvrez ensuite `http://localhost:5173`. Pour tester votre compte : **Mon profil → Se connecter avec Steam**, ou saisir l’identifiant/URL du profil et **Charger**, puis **Mes parties**. Steam identifie le joueur ; cette connexion ne donne pas accès aux replays. Le bouton **Synchroniser** affiche la date et la source de l’historique ainsi que les détails chargés. Pour les parties absentes, **Parties manquantes** permet de sélectionner le cache `Steam/appcache/httpcache` après avoir ouvert ces parties dans le jeu. Le navigateur lit les en-têtes localement et propose les références à envoyer ; aucun fichier du cache n’est téléversé. Les détails disponibles du compte sont importés et sauvegardés progressivement. Le [parcours de synchronisation](docs/SYNCHRONISATION.md) explique les étapes, les limites et le déploiement de la connexion Steam.

Les détails sont aussi demandés à la première ouverture d’une partie résumée. Si le cache ne les contient pas, **Récupérer via Steam** lance une demande ponctuelle. Le profil affiche le rang et les statistiques par héros disponibles. Un export JSON peut être importé. Une lettre personnelle demande au moins cinq parties détaillées comparables ; les positions exigent les métadonnées de la partie. **Compléter les références** enrichit jusqu’à cinq anciennes parties depuis le bilan.

Le serveur de développement écoute sur le port 5173. Pour cet environnement cloud, `bash scripts/cloud-install.sh` configure le cache dans `/workspace` et exécute l’installation, la compilation et les tests du modèle.

```sh
npm test
npm run build
npm run test:e2e
npm start
```

Les tests navigateur utilisent Chromium système (`/usr/bin/chromium`) ou le chemin donné par `CHROMIUM_PATH`. Ils lancent le serveur de production sur le port 4173 ; compilez avant de les exécuter. `npm start` sert l’application compilée et le proxy API sur le port 4173, ou sur `PORT` si défini.

Le proxy serveur n’expose que des routes fixes pour le profil, l’historique, les métadonnées, les références de replay et Steam OpenID. Son cache dure 30 secondes pour l’historique et dix minutes pour les autres lectures. Les métadonnées ordinaires utilisent `disable_steam=true` ; une récupération Steam explicite est possible lorsqu’elles manquent. Un historique de secours renvoyé sous quota reste utilisable. Il a besoin de sorties HTTPS vers `api.deadlock-api.com` et, pour la connexion Steam, `steamcommunity.com`. Aucun mot de passe Steam ni clé d’API n’est nécessaire. Une clé facultative peut être renseignée dans `.env` en copiant `.env.example` ; elle reste sur le serveur. Hors de localhost, configurer aussi `APP_ORIGIN` avec l’origine HTTPS du site. La provenance et les API comparées sont documentées dans [docs/recherche/RECUPERATION_COMPTE.md](docs/recherche/RECUPERATION_COMPTE.md). Les erreurs ne créent aucune donnée personnelle fictive.

Imports personnels acceptés : une liste JSON de `PlayerMatchHistoryEntry`, des métadonnées contenant `match_info`, ou un objet `{ "account_id": 42, "matches": [...], "metadata": [...] }`. Pour des métadonnées multi-joueurs, indiquez explicitement l’identifiant du joueur dans la fenêtre d’import. Un SteamID64 numérique est accepté et converti sans perte de précision.

Les données personnelles restent dans ce navigateur : IndexedDB pour les profils détaillés (migration des anciens profils), localStorage pour les builds. Les imports acceptent 32 Mo. Ne changez pas de port entre deux sessions si vous voulez retrouver le même stockage local. Un historique résumé ne fournit qu’une estimation économique finale. Les courbes détaillées et la précision exigent les relevés des métadonnées. Seules les parties standard, sans abandon et du héros choisi servent à la calibration ; les modes absents ou inconnus sont exclus. L’application n’extrapole pas une courbe personnelle au-delà de sa couverture observée. Le patrimoine n’est pas assimilé à l’argent disponible, et la précision globale n’est pas assimilée à la précision contre les héros.

Le modèle de combat est **partiel et non calibré dans le sandbox**. Il compte les tirs et rechargements, les propriétés simples des objets et une résistance cible explicite. Les compétences, passifs du héros, bonus d’investissement, distance et la majorité des procs/actifs ne sont pas simulés. Les résultats constituent des projections d’arme à niveau de base, pas une prédiction certaine de duel ni un score universel de build. Les actifs et autres effets exclus sont expliqués dans l’interface.

L’analyse après partie sépare faits et pistes à examiner. Elle ne déduit pas qu’un achat a causé une mort ou une défaite. Les comparaisons historiques utilisent les parties antérieures disponibles ; elles peuvent manquer de contexte de patch, de rôle ou d’adversité. Les inventaires renvoyés au laboratoire utilisent le catalogue actuel : les objets inconnus et variantes non prises en charge sont exclus et signalés.

Les données client sont extraites du commit SteamDatabase `d251cf9d9a796061c90f58724230b7e17b97121b`, version 6821 du 26 octobre 2026. Pour reproduire le snapshot à partir des fichiers KV3 de cette version :

```sh
python scripts/sync_snapshot.py --source-dir /chemin/vers/fichiers
```

Le dossier doit contenir `abilities.vdata` et `heroes.vdata`. Le snapshot conserve les empreintes des sources. Les identifiants d’objets sont calculés avec MurmurHash2, seed `0x31415926`, comme dans le parseur communautaire. Les coûts sont les prix totaux de palier ; les composants déjà détenus sont remplacés et crédités dans le modèle d’achat.

React, TypeScript et Vite composent l’interface. Le serveur de production utilise Node sans framework ; les calculs et imports sont isolés dans `src/domain/`. Les tests unitaires emploient des données synthétiques explicitement réservées aux tests. Aucune partie de démonstration n’est injectée dans le profil utilisateur.

Les droits et origines des illustrations sont indiqués dans [NOTICE.md](NOTICE.md). Aucune affiliation ou approbation de Valve n’est revendiquée.
