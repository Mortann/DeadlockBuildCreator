# Inventaire API Deadlock — vérifié le 28 octobre 2026

Actualisation du 29 octobre : accès direct rétabli et vérification sur un compte réel ; voir [RECUPERATION_COMPTE.md](RECUPERATION_COMPTE.md) pour les corrections et la comparaison avec Statlocker/Tracklock. Les restrictions ci-dessous décrivent la recherche initiale du 28 octobre.

## Méthode et limites

Les services https://deadlock-api.com, https://api.deadlock-api.com et https://assets.deadlock-api.com ont été refusés par le proxy de cet environnement (403 CONNECT). Cela ne prouve pas une indisponibilité du service. Les sources primaires GitHub ont été lues directement : spécification OpenAPI complète (132 chemins), README backend/live-events/ingest, messages protobuf extraits du client. Aucun vrai profil ni match n’a été interrogé, et aucune latence réelle n’a été mesurée.

Spécification figée vérifiée octet pour octet contre master lors de cette recherche : https://github.com/deadlock-api/openapi-clients/blob/2c3f2adc4dd7068dd91605ab2a2c9163e0bf6000/openapi.json

## Nature et accès

Deadlock API est communautaire et non endossée par Valve (disclaimer explicite OpenAPI). Elle utilise notamment le Game Coordinator Steam, une base ClickHouse, métadonnées et démos Valve. Ne pas la qualifier d’API publique officielle Valve.

La plupart des endpoints de lecture fonctionnent sans clé selon contrat ; clés optionnelles X-API-KEY ou api_key pour limites plus élevées. Les endpoints patron nécessitent une clé liée à un abonnement actif. Blog du développeur daté 16 mars 2026 : endpoints gratuits et clés accordées gratuitement, priorisation comptes via Patreon. Ce n’est ni un engagement de disponibilité ni une garantie de politique future.

## Données exploitables

| Données | Endpoints / source | Réserves |
|---|---|---|
| Héros, capacités, armes, objets, prix, tiers, composants, propriétés/scalings, descriptions et images | `/v1/assets/heroes`, `/v1/assets/items`, `/v1/assets/modifiers`, `/v1/assets/convars` | Paramètres `client_version` et `language` (dont french), donc versionner par patch et utiliser actifs `only_active`. Données KV3 ne constituent pas à elles seules un simulateur fiable de toutes interactions. |
| Profil public Steam et recherche | `/v1/players/steam`, `/v1/players/steam-search` | account_id SteamID3 / ID64 selon endpoint ; cache, refresh limité. Données protégées non disponibles. |
| Historique joueur | `/v1/players/{account_id}/match-history` | Sans bot ami : historique stocké ClickHouse seulement. Avec bot ami : Steam + ClickHouse. Ne pas promettre historique exhaustif pour tous. |
| Winrate et héros joués, KDA, farm, dégâts, soin, précision, objectifs, deny, progression | `/v1/players/hero-stats`, historique et metadata | Winrate = wins/matches observés ; afficher période, patch, nombre matchs et couverture. HeroStats fournit davantage que KDA, dont dmg/soul, dmg/min, accuracy. |
| Rang | `/v1/players/{account_id}/rank`, `/v1/players/rank`, match-history | Contract actuel : rang lu depuis dernier match ranked, plus variation ; pas MMR secret exact. Valeur 0 si aucun rang récent. Particularité Eternus percentile. `/rank-predict` et MMR estimé anciens sont deprecated. |
| Match terminé | `/v1/matches/{match_id}/metadata` | Métadonnées JSON, 404 possible, quotas différents cache/S3/Steam. Champs optionnels. |
| Achats et ventes datés, imbue, morts et positions, courbes éco/dégâts, matrice dégâts/soins/CC, objectifs et midboss | `CMsgMatchMetaDataContents` et messages `CMsgMatchPlayerPathsData`, `CMsgMatchPlayerDamageMatrix` | Schéma du client permet ces champs, mais disponibilité à valider match par match. Métadonnées = courbes échantillonnées, pas nécessairement chaque combat détaillé. |
| Détail fin replay | `/v1/matches/demo/query` + poll job et `/demo/schema` | Requête SQL asynchrone démo, doc annonce ~55 s, NDJSON/Parquet ; 404 si démo/salts absents, serveurs Valve peuvent refuser. Pas test performance réel. |
| Builds existants, auteur, catégories, ordre compétences, annotations, imbue, priorités vente | `/v1/builds`, `/v1/builds/by-author/{account_id}`, `/v1/builds/{hero_id}/{build_id}` | Lire/importer confirmé. Aucune route publique de création/publication in-game dans ce schéma. Ne pas promettre export in-game automatique sans étude supplémentaire. |
| Stats builds | `/v1/analytics/hero-build-stats/{hero_id}` | `hero_build_id` = premier build sélectionné au début, PAS achats réels ni changements de build. Seulement builds présents en base + démos traitées, minimum historique March 1 2026. |
| Méta | `/v1/analytics/item-stats`, `item-permutation-stats`, `item-flow-stats`, `ability-order-stats`, `hero-counter-stats`, `hero-synergy-stats`, `player-performance-curve` | Filtrage héros, période, rang, modes, achats, ordre, joueur. Cache fréquent 1 h. Lane-matchup nouveau explicitement instable. |
| Patchs | `/v2/patches` | Agrège changelog forum officiel + news Steam, `/v1/patches` deprecated. |
| Données massives | site `/data-dumps` (source route) | Décrit data lake Parquet mis à jour chaque heure + MCP lecture seule et DuckDB ; aucune connexion MCP configurée ici. |

## Temps réel : existe, mais flux spectateur

- `/v1/matches/active` est explicitement limité aux **200 matchs du haut de l’onglet Watch**. Un filtre account_id ne permet donc pas de retrouver n’importe quel joueur actif.
- `/v1/matches/{match_id}/live/url` spectate un match et renvoie broadcast_url. **La limite top 200 ne vaut que pour la découverte via `/active`, pas une limite prouvée de cet endpoint** : le code `api/src/routes/v1/matches/live_url.rs` appelle directement `CMsgClientToGcSpectateLobby` avec match_id et version client, sans consulter `/active`. Si match_id est connu, spectate hors top200 est possible en principe, mais accès GC/disponibilité restent non vérifiés en conditions réelles. Quota IP 6 résolutions/h, clé 50/h (avec sous-limite 10/10 min), cache résolution 1 h. `/v1/matches/live/urls` liste URLs connues ; publication URL valable 1 h.
- `/v1/matches/demo/live/query` permet SQL sur broadcast live via SSE. Projection simple émet au fil de lecture ; GROUP BY/ORDER BY finaux peuvent attendre fin de broadcast. Par client 16 flux par défaut ; limites globales et backpressure.
- Service OSS **autohébergeable séparé** live-events (Docker documenté, clé upstream optionnelle) expose `/v1/matches/{match_id}/live/demo/events` : controller joueur (hero, KDA, net_worth, dégâts, upgrades), pawn (position, HP, level, hero_build_id), équipe, NPC, objectifs, kills, combat log, chat si demandé. C’est un parser de démonstration diffusée, pas un protocole local officiellement supporté.
- README indique jusqu’à ~30 s pour attendre disponibilité de la démo initiale. **Ce n’est pas une mesure du décalage spectateur**. Aucun délai end-to-end fixe vérifié. Ne pas promettre conseil instantané ou accès à toutes parties.
- Découvrir sa partie, y accéder comme spectateur, mesurer délai/champs réellement présents et clarifier usage admis par Valve sont des verrous produit à tester. Données adverses hors vision issues spectateur ne sont pas des données légitimes à injecter comme coach joueur sans cadre explicite.

La route publique `/v1/matches/demo/live/query` figure dans l’OpenAPI du service central. En revanche `/live/demo/events` est ici documentée dans le service live-events à autohéberger : son existence OSS ne prouve pas un endpoint hébergé public équivalent ou une disponibilité opérationnelle. Ne pas confondre ces deux voies. Le cache de `/active` vaut une minute dans le code consulté, donc même la liste ne se rafraîchit pas chaque seconde.

Sources code : https://github.com/deadlock-api/deadlock-api/blob/master/api/src/routes/v1/matches/live_url.rs et https://github.com/deadlock-api/deadlock-api/blob/master/api/src/routes/v1/matches/active.rs .

## Couverture et récupération

Le projet ingest lit cache HTTP Steam (références .meta.bz2/.dem.bz2) et soumet match_id/salts pour récupérer métadonnées. README actuel ajoute lecture mémoire read-only du jeu et sessions Steam sauvegardées pour requêtes GC hors jeu. **Ce dernier ensemble est intrusif pour un produit utilisateur et n’est pas une télémétrie live locale générique** ; ne pas proposer de l’intégrer aveuglément ni de collecter mots de passe/sessions Steam. Options `--no-memory` et `--no-gc` existent. Une extension desktop pour coverage postmatch est distincte d’un site web seul.

L’API indique beaucoup de matchs ingérés sans salts : existence en historique ne garantit donc pas replay récupérable.

## Limites opérationnelles importantes

- Analytics : quota partagé IP 200/min, clé 400/min, global 2000/min (au moment du schéma), cache 1 h. Nécessite cache backend et backoff, pas interrogation chaque frame depuis navigateur.
- Metadata : récupération Steam sans clé 3/h/IP, avec clé 300/h ; cache beaucoup plus généreux. Une couverture insuffisante peut devenir un coût produit essentiel.
- Demo query : IP 200/h, clé 400/h, global 600/h ; jobs et files d’attente.
- Load shedding documenté : 503 + Retry-After si attente ; 504 sur délai requête, résultat d’échec temporairement mémorisé ; réduire filtres plutôt que répéter identique.
- Comptes protégés peuvent renvoyer 403 ou être exclus. L’API a procédure suppression/opt-out via Steam Auth.

## Implications d’analyse

Ne jamais assimiler winrate brut d’un objet tardif à effet causal : joueurs déjà riches gagnent davantage, parties longues sélectionnent survivants, spécialistes s’auto-sélectionnent. L’API fournit déjà `adjusted_win_rate` dans item-flow (standardisation par richesse à l’achat), explicitement observationnel non causal, plus `reached_per_column` et baseline wins pour biais de survie. Bâtir aide décision avec contexte et incertitude, pas score magique.

Variantes nouvelles : corrupted items depuis 2026-09-29/build 6712, et enhanced Street Brawl depuis 2026-04-08. Même item_id pour variantes : stocker flags/upgrade_info et patch, ne pas déduire uniquement d’item_id.

## Sources primaires supplémentaires

- Architecture backend : https://github.com/deadlock-api/deadlock-api/tree/5902f7ac59dd696ed878889500d9b03680d817b5
- Flux live : https://github.com/deadlock-api/deadlock-api/blob/5902f7ac59dd696ed878889500d9b03680d817b5/live-events/README.md
- Origines, gratuité et écosystème : https://github.com/deadlock-api/deadlock-api/blob/master/website/content/blog/how-deadlock-api-started.md
- Ingest, source et limites : https://github.com/deadlock-api/deadlock-api-ingest/blob/49dbf67b93fce1e2dfcf8557d4b5fbae760e54a4/README.md
- Métadonnées protocole client : https://github.com/SteamTracking/Protobufs/blob/master/deadlock/citadel_gcmessages_common.proto
- Privacy : https://github.com/deadlock-api/deadlock-api/blob/master/website/src/routes/data-privacy.tsx
- Data lake : https://github.com/deadlock-api/deadlock-api/blob/master/website/src/routes/data-dumps.tsx

## Réutilisation, liaison Steam et couverture historique

La licence https://github.com/deadlock-api/deadlock-api/blob/master/LICENSE est MIT et autorise notamment la vente de copies du **logiciel** sous conditions de conservation de notice. Cela ne prouve pas une licence générale sur les assets Valve, ni une permission contractuelle de monétiser tous jeux de données personnels, ni une validation d’un coach live. Les documents consultés n’établissent pas de licence distincte des données ou conditions commerciales complètes. Le blog cite des utilisateurs commerciaux connus (Tracklock/U.GG et Mobalytics), preuve d’écosystème, pas contrat pour notre produit. À confirmer auprès du mainteneur si monétisation prévue ; pas besoin de bloquer une maquette/recherche.

Steam OpenID ne fournit qu’une identité SteamID64 vérifiable, pas un accès illimité à l’historique privé ni les sessions du Game Coordinator. Exemple d’usage consulté : https://github.com/deadlock-api/deadlock-api/blob/master/website/src/lib/steam-auth.ts . Lier un compte à notre site ne doit donc pas être présenté comme débloquant automatiquement toutes données. Le mécanisme ami-bot de l’API et les outils ingest sont des étapes séparées, à consentement explicite.

Même si le contrat match-history dit « full history » pour les amis bots, il ne documente pas ici une garantie de profondeur/rétroactivité, de conservation de toutes démos ou de rattrapage de tous champs historiques. Formulation produit sûre : « historique disponible pour ce compte », avec couverture mesurée, date dernier match, source et statut enrichissement. Les matchs anciens peuvent rester sans métadonnées/replay. L’amélioration des collectes futures n’implique pas la reconstitution complète du passé.
