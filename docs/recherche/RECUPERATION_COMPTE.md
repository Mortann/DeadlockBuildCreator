# Récupération des comptes — vérification du 29 octobre 2026

## Vérification en conditions réelles

Contrairement à la recherche initiale, l’accès à `api.deadlock-api.com` et au site principal fonctionne depuis cet environnement lors de cette vérification. Le schéma public hébergé a été comparé à celui du dépôt GitHub. Un compte transmis par l’utilisateur a été testé directement dans le navigateur avec le serveur de production : 332 lignes d’historique reçues et affichées, aucun héros non identifié, profil Steam et statistiques par héros présents. Les données de ce compte restent hors des sources et des archives distribuées.

La partie fournie en capture était effectivement récupérable depuis le cache de métadonnées. Elle fournit 12 joueurs, 40 achats pour le joueur, 2 696 relevés de position et 23 événements d’objectif. La review lit ces données sans avertissement de normalisation. Cela ne prouve pas que la base contient toutes les parties jouées sur ce compte.

## Origines des informations manquantes

1. **Catalogue de présentation limité à quatre héros.** La review utilisait les quatre héros du modèle de combat. Elle dispose désormais d’un catalogue de présentation distinct : 65 identités et 62 portraits disponibles depuis l’API d’assets. Le laboratoire de combat reste limité aux héros dont le modèle existe ; un héros reconnu dans l’historique n’est pas simulé avec les caractéristiques d’un autre.
2. **Sentinelle valide `time_to_kill_s: -1`.** Elle signifie ici que cette mesure n’est pas disponible. Elle n’invalide ni le décès ni ses autres mesures.
3. **Tableaux cumulatifs de combat plus courts que l’horloge globale.** Ce format existe dans les réponses réelles. Le dernier élément peut servir de total (usage corroboré par le décodeur Deadlock+). L’alignement temporel de ces tableaux n’est pas documenté : ils conservent leur total et leur caractère non aligné, sans timestamps fabriqués. Les séries réinitialisées ou trop longues restent rejetées. Une anomalie de matrice n’invalide plus les compteurs personnels indépendants.
4. **Relevés économiques espacés de plusieurs minutes.** Le plafond arbitraire de 120 secondes laissait de nombreux trous dans la courbe collective. Il suit désormais la cadence médiane des séries comportant au moins trois points, avec un maximum de 600 secondes et sans extrapolation. Les grands trous isolés restent vides.
5. **Erreur d’une référence historique affichée pour la partie ouverte.** Les échecs de références sont séparés. Un 404 n’empêche plus d’essayer les autres références. Une limite 429 arrête les demandes restantes ; seules les références réellement chargées sont intégrées.
6. **Cache seul pour les détails.** La lecture ordinaire reste rapide et sans rattrapage Steam automatique. Un 404 propose maintenant une récupération Steam explicite, avec quota et erreurs exploitables, au lieu d’imposer un import JSON.

## Services comparés

| Service | Constat vérifié | Utilisation retenue |
| --- | --- | --- |
| [Deadlock API](https://api.deadlock-api.com/docs) | Historique, Steam public, statistiques par héros, rang, métadonnées, assets, récupération via Steam. Les détails peuvent être absents même lorsqu’un match existe dans l’historique. | Source principale, cache serveur borné, lectures partielles préservées. |
| [Statlocker Public API](https://statlocker.gg/api) | La documentation de l’application propose profil, analyses et scores propriétaires (PP, MVP), avec demande de clé et approbation. Elle renvoie explicitement vers Deadlock API pour les données brutes, historiques, builds et classements. | Alternative future pour des analyses sous réserve d’accès ; pas un remplacement démontré pour récupérer les données brutes manquantes. Aucune clé demandée ni démarche envoyée. |
| [Tracklock](https://tracklock.gg/deadlock-tracker) | Site et application desktop consultés. La documentation de collecte de Deadlock API cite Tracklock parmi les bénéficiaires. Aucune API publique indépendante garantissant les métadonnées manquantes n’a été établie ici. | Référence de produit, pas de scraping de profil ni de dépendance à des routes privées. |
| [Steam Web API](https://partner.steamgames.com/doc/webapi/ISteamUser) | Profils publics via GetPlayerSummaries ; ce service n’est pas un endpoint public de replays et métadonnées Deadlock. | Les informations publiques nécessaires sont accessibles via l’adaptateur de Deadlock API, sans collecter de mot de passe Steam. |
| [Deadlock API Ingest](https://deadlock-api.com/ingest-cache) | La documentation explique les identifiants et salts nécessaires à la collecte. Elle propose un envoi ponctuel du cache Steam dans le navigateur et un outil de fond distinct. | Lien explicite « Synchroniser les parties ». Aucun dossier lu, fichier envoyé ou outil installé automatiquement. |

Les pages et scripts publics de documentation ont été consultés, ainsi que les sources [metadata.rs](https://github.com/deadlock-api/deadlock-api/blob/master/api/src/routes/v1/matches/metadata.rs) et [match_history.rs](https://github.com/deadlock-api/deadlock-api/blob/master/api/src/routes/v1/players/match_history.rs). L’annonce d’une fonction par un site ne vaut pas validation de sa disponibilité pour toutes les parties.

## Routes intégrées

- `GET /api/players/:id/history` : historique disponible, sans fabrication des parties absentes.
- `GET /api/players/:id/profile` : Steam public (nom/lien seulement), statistiques des héros en mode standard, rang et état de collecte. Les sous-requêtes sont indépendantes : l’échec du rang ne supprime pas l’historique. La liste d’amis et le nom réel ne sont ni renvoyés au navigateur ni enregistrés dans le profil.
- `POST /api/players/:id/refresh` : `force_refetch=true`, une fois par heure depuis l’application. La couverture reste celle accordée par Steam et le service ; cela ne garantit pas une archive exhaustive.
- `GET /api/matches/:id` : métadonnées disponibles en cache/S3, `disable_steam=true`.
- `POST /api/matches/:id/recover` : récupération demandée par le joueur, `disable_steam=false`. Sans clé, au plus trois tentatives par heure et par processus serveur ; la limite réelle du fournisseur peut être partagée avec d’autres clients de la même IP. Les requêtes simultanées identiques sont regroupées et une récupération réussie alimente la lecture ordinaire.

`Retry-After` est transmis. Les erreurs 404, 429 et d’accès sont distinguées. Une clé `DEADLOCK_API_KEY` facultative peut être placée dans `.env`, exclusivement côté serveur, sans préfixe `VITE_`. Les commandes Node chargent ce fichier s’il existe. Aucune clé n’est fournie, committée ou exposée au client.

Les statistiques agrégées par héros restent séparées des parties observées : elles ne créent pas de chronologie personnelle. Les champs antérieurement disponibles sont conservés si une synchronisation suivante ne peut pas charger le profil ou le rang. Les données détaillées et agrégées peuvent couvrir des modes/périodes différents ; leurs totaux ne doivent pas être forcés à correspondre.

## Tests

Régressions sur les sentinelles et matrices réelles reproduites avec des données synthétiques, séparation des domaines d’avertissements, cadence économique, récupération et cache, quotas, clé serveur, profil partiel, entrée par URL Steam. Les tests navigateur vérifient le héros Celeste hors modèle de combat, la récupération après 404 et la poursuite des références après un échec. La connexion au compte fourni a aussi été vérifiée manuellement de bout en bout, sans publier de copie de ses données.
