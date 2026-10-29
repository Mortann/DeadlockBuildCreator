Inventaire des routes de la spécification Deadlock API consultée le 28 octobre 2026.

Source figée : https://github.com/deadlock-api/openapi-clients/blob/2c3f2adc4dd7068dd91605ab2a2c9163e0bf6000/openapi.json

132 chemins documentés. Inventaire documentaire : aucune garantie de réponse, accès ou couverture dans cet environnement. Les règles de quotas sont à consulter dans la spécification pour chaque route.

| Méthode | Chemin | Fonction documentée |
|---|---|---|
| GET | `/v1/analytics/ability-max-first-stats` | Ability Max First Stats |
| GET | `/v1/analytics/ability-order-stats` | Ability Order Stats |
| GET | `/v1/analytics/ability-order-tree` | Ability Order Tree |
| GET | `/v1/analytics/badge-distribution` | Badge Distribution |
| GET | `/v1/analytics/buff-stats` | Buff Stats |
| GET | `/v1/analytics/build-item-stats` | Build Item Stats |
| GET | `/v1/analytics/game-stats` | Game Stats |
| GET | `/v1/analytics/hero-ban-stats` | Hero Ban Stats |
| GET | `/v1/analytics/hero-build-stats/{hero_id}` | Hero Build Stats |
| GET | `/v1/analytics/hero-comb-stats` | Hero Comb Stats |
| GET | `/v1/analytics/hero-counter-stats` | Hero Counter Stats |
| GET | `/v1/analytics/hero-stats` | Hero Stats |
| GET | `/v1/analytics/hero-swap-stats` | Hero Swap Stats |
| GET | `/v1/analytics/hero-synergy-stats` | Hero Synergy Stats |
| GET | `/v1/analytics/item-flow-stats` | Item Flow Stats |
| GET | `/v1/analytics/item-permutation-stats` | Item Permutation Stats |
| GET | `/v1/analytics/item-stats` | Item Stats |
| GET | `/v1/analytics/kill-death-stats` | Kill Death Stats |
| GET | `/v1/analytics/lane-matchup-stats` | Lane Matchup Stats (Subject to Change) |
| GET | `/v1/analytics/lane-soul-curve` | Lane Soul Curve (Subject to Change) |
| GET | `/v1/analytics/player-performance-curve` | Player Performance Curve |
| GET | `/v1/analytics/player-stats/metrics` | Player Stats Metrics |
| GET | `/v1/analytics/scoreboards/heroes` | Hero Scoreboard |
| GET | `/v1/analytics/scoreboards/players` | Player Scoreboard |
| GET | `/v1/assets/accolades` | List Accolades |
| GET | `/v1/assets/accolades/by-name/{name}` | Get Accolade By Name |
| GET | `/v1/assets/accolades/{accolade_id}` | Get Accolade |
| GET | `/v1/assets/build-tags` | List Build Tags |
| GET | `/v1/assets/build-tags/by-name/{name}` | Get Build Tag By Name |
| GET | `/v1/assets/build-tags/{build_tag_id}` | Get Build Tag |
| GET | `/v1/assets/client-versions` | List Client Versions |
| GET | `/v1/assets/colors` | List Colors |
| GET | `/v1/assets/convars` | List Convars |
| GET | `/v1/assets/convars/{name}` | Get Convar |
| GET | `/v1/assets/fonts` | Fonts Index |
| GET | `/v1/assets/generic-data` | Get Generic Data |
| GET | `/v1/assets/heroes` | List Heroes |
| GET | `/v1/assets/heroes/by-name/{name}` | Get Hero By Name |
| GET | `/v1/assets/heroes/{hero_id}` | Get Hero |
| GET | `/v1/assets/icons` | Icons Index |
| GET | `/v1/assets/images` | Images Index |
| GET | `/v1/assets/items` | List Items |
| GET | `/v1/assets/items/by-hero-id/{id}` | List Items By Hero |
| GET | `/v1/assets/items/by-slot-type/{slot_type}` | List Items By Slot Type |
| GET | `/v1/assets/items/by-type/{type}` | List Items By Type |
| GET | `/v1/assets/items/{id_or_class_name}` | Get Item |
| GET | `/v1/assets/loot-tables` | List Loot Tables |
| GET | `/v1/assets/map` | Map |
| GET | `/v1/assets/misc-entities` | List Misc Entities |
| GET | `/v1/assets/misc-entities/{id_or_classname}` | Get Misc Entity |
| GET | `/v1/assets/models` | Models Index |
| GET | `/v1/assets/modifiers` | List Modifiers |
| GET | `/v1/assets/modifiers/{id_or_classname}` | Get Modifier |
| GET | `/v1/assets/npc-units` | List NPC Units |
| GET | `/v1/assets/npc-units/{id_or_classname}` | Get NPC Unit |
| GET | `/v1/assets/ranked-seasons` | List Ranked Seasons |
| GET | `/v1/assets/ranks` | List Ranks |
| GET | `/v1/assets/ranks/{tier}` | Get Rank |
| GET | `/v1/assets/ranks/{tier}/{subrank}/image` | Rank Subrank Image |
| GET | `/v1/assets/sounds` | Sounds Index |
| GET | `/v1/assets/steam-info` | Get Steam Info |
| GET | `/v1/assets/steam-info/all` | Get All Steam Infos |
| GET | `/v1/builds` | Search |
| GET | `/v1/builds/by-author/{account_id}` | Fetch Live by Author |
| GET | `/v1/builds/{hero_id}/{build_id}` | Fetch Live |
| GET | `/v1/commands/resolve` | Resolve Command |
| GET | `/v1/commands/variables/available` | Available Variables |
| GET | `/v1/commands/variables/resolve` | Resolve Variables |
| GET | `/v1/commands/widgets/versions` | Widget Versions |
| GET | `/v1/crosshair/code/image` | Crosshair Code Image |
| GET | `/v1/crosshair/code/settings` | Crosshair Code Settings |
| GET | `/v1/crosshair/settings/code` | Crosshair Settings Code |
| GET | `/v1/crosshair/settings/image` | Crosshair Settings Image |
| POST | `/v1/feedback` | Submit Website Feedback |
| GET | `/v1/graphql` | GraphQL Playground |
| GET | `/v1/info` | API Info |
| GET | `/v1/info/health` | Health Check |
| GET | `/v1/leaderboard/{region}` | Leaderboard |
| GET | `/v1/leaderboard/{region}/raw` | Leaderboard as Protobuf |
| GET | `/v1/leaderboard/{region}/{hero_id}` | Hero Leaderboard |
| GET | `/v1/leaderboard/{region}/{hero_id}/raw` | Hero Leaderboard as Protobuf |
| GET | `/v1/matches/active` | Active |
| GET | `/v1/matches/active/raw` | Active as Protobuf |
| POST | `/v1/matches/custom/create` | Create Match |
| POST | `/v1/matches/custom/{lobby_id}/leave` | Leave Lobby |
| POST | `/v1/matches/custom/{lobby_id}/ready` | Ready Up |
| POST | `/v1/matches/custom/{lobby_id}/start` | Start Match |
| POST | `/v1/matches/custom/{lobby_id}/unready` | Unready |
| GET | `/v1/matches/custom/{party_id}/match-id` | Get Match ID |
| GET | `/v1/matches/demo/live/query` | Live Demo Query (SSE) |
| POST | `/v1/matches/demo/query` | Demo Query |
| GET | `/v1/matches/demo/query/{job_id}` | Demo Query Status |
| GET | `/v1/matches/demo/schema` | Demo Schema |
| GET | `/v1/matches/live/urls` | Live Broadcast URLs |
| POST | `/v1/matches/live/urls` | Ingest Live Broadcast URLs |
| GET | `/v1/matches/metadata` | Bulk Metadata |
| GET | `/v1/matches/recently-fetched` | Recently Fetched |
| POST | `/v1/matches/salts` | Match Salts Ingest |
| GET | `/v1/matches/{match_id}/live/url` | Live Broadcast URL |
| GET | `/v1/matches/{match_id}/metadata` | Metadata |
| GET | `/v1/matches/{match_id}/metadata/raw` | Metadata as Protobuf |
| GET | `/v1/matches/{match_id}/salts` | Salts |
| GET | `/v1/patches` | Notes |
| GET | `/v1/patches/big-days` | Big Days |
| GET | `/v1/patron/steam-accounts` | List Prioritized Steam Accounts |
| POST | `/v1/patron/steam-accounts` | Add Prioritized Steam Account |
| PUT | `/v1/patron/steam-accounts/{account_id}` | Replace Prioritized Steam Account |
| DELETE | `/v1/patron/steam-accounts/{account_id}` | Remove Prioritized Steam Account |
| GET | `/v1/patron/steam-accounts/{account_id}/bot-friend` | Prioritized Steam Account Bot Friend Status |
| POST | `/v1/patron/steam-accounts/{account_id}/reactivate` | Reactivate Prioritized Steam Account |
| GET | `/v1/players/hero-stats` | Hero Stats |
| GET | `/v1/players/mmr` | Batch MMR (Deprecated) |
| GET | `/v1/players/mmr/distribution` | MMR Distribution (Deprecated) |
| GET | `/v1/players/mmr/distribution/{hero_id}` | Hero MMR Distribution (Deprecated) |
| GET | `/v1/players/mmr/{hero_id}` | Batch Hero MMR (Deprecated) |
| GET | `/v1/players/rank` | Batch Rank |
| GET | `/v1/players/rank-predict/image` | Rank Predict Avg Image (Deprecated) |
| GET | `/v1/players/rank/distribution` | Rank Distribution |
| GET | `/v1/players/rank/image` | Rank Avg Image |
| GET | `/v1/players/steam` | Batch Steam Profile |
| GET | `/v1/players/steam-search` | Steam Profile Search |
| GET | `/v1/players/{account_id}/enemy-stats` | Enemy Stats |
| GET | `/v1/players/{account_id}/ingest-status` | Ingest Status |
| GET | `/v1/players/{account_id}/match-history` | Match History |
| GET | `/v1/players/{account_id}/mate-stats` | Mate Stats |
| GET | `/v1/players/{account_id}/mmr-history` | MMR History (Deprecated) |
| GET | `/v1/players/{account_id}/mmr-history/{hero_id}` | Hero MMR History (Deprecated) |
| GET | `/v1/players/{account_id}/rank` | Rank |
| GET | `/v1/players/{account_id}/rank-predict` | Rank Predict (Deprecated) |
| GET | `/v1/players/{account_id}/rank-predict/image` | Rank Predict Image (Deprecated) |
| GET | `/v1/players/{account_id}/rank/image` | Rank Image |
| GET | `/v1/sql` | Query |
| GET | `/v1/sql/tables` | List Tables |
| GET | `/v1/sql/tables/{table}/schema` | Table Schema |
| GET | `/v2/patches` | Notes |
