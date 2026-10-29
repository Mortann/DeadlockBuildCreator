# Métadonnées utilisées par la review

Révision 29 octobre 2026. Sources consultées : [CMsgMatchMetaDataContents et messages Paths/DamageMatrix](https://github.com/SteamTracking/Protobufs/blob/master/deadlock/citadel_gcmessages_common.proto), [décodeur de trajectoires Deadlock+](https://github.com/deadlock-plus/deadlock-plus/blob/0dd5027754cbdeea7fd7b2c8c668ebc7e6d73dab/packages/match/src/paths.ts), [totaux de matrice Deadlock+](https://github.com/deadlock-plus/deadlock-plus/blob/0dd5027754cbdeea7fd7b2c8c668ebc7e6d73dab/crates/ring1/dp-mvp/src/totals.rs), et [schéma API](https://api.deadlock-api.com/openapi.json). Les fichiers de recherche locaux ont été examinés ; une vérification directe sur un compte et une partie réels a ensuite été réalisée le 29 octobre, voir recherche/RECUPERATION_COMPTE.md.

La normalisation ne complète pas une donnée absente par zéro : achats absents ≠ inventaire vide, compteur absent ≠ compteur nul, équipe absente ≠ Ambre. Un relevé économique exige une heure et un patrimoine réellement fournis.

| Donnée source                        | Usage                                                                                                                         |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `players[].stats`                    | Économie, tirs, dégâts héros/reçus/objectifs, auto-soins/soins alliés, neutres, compteurs économiques et défensifs optionnels |
| `players[].items`                    | Achats, ventes, variantes ; inventaires historiques des douze acteurs                                                         |
| `players[].death_details`            | Heure, durée de respawn, position de mort et du tueur, slot du tueur                                                          |
| `match_info.match_paths`             | Chemins quantifiés par slot, intervalle et bornes/résolutions propres ; santé en pourcentage                                  |
| `match_info.objectives` / `mid_boss` | Destruction, propriétaire, type et première touche lorsque présents                                                           |
| `match_info.damage_matrix`           | Compteurs cumulatifs par source, acteur émetteur et destinataire                                                              |

Déquantification : `x_min + x_pos[i] / x_resolution × (x_max − x_min)`, idem Y. Temps : `i × interval_s`. Les échantillons à santé 0 restent des sentinelles mortes pour interrompre les traces ; leurs coordonnées n’indiquent pas l’endroit du décès. Aucune interpolation de trajectoire ou remplissage vers le passé n’est réalisé.

Dans la matrice, `source_details` contient les noms et types parallèles, `damage_dealers[].damage_sources[].damage_to_players[].damage` les valeurs cumulatives aux `sample_time_s`. Une somme directe des valeurs temporelles serait incorrecte. Les tableaux cumulatifs courts sont valides : leur total final est conservé sans inventer l’alignement sur l’horloge globale. Le temps avant mort à −1 est traité comme une mesure absente. Les noms de sources ne constituent pas une classification des types de dégâts. Les totaux génériques ne sont pas additionnés aux lignes détaillées.

Les équipes et objectifs contradictoires deviennent inconnus. Les comptes sont dédupliqués ; les slots ambigus ne sont plus associés à une trajectoire. Les séries dupliquées/réinitialisées/invalides sont supprimées. Un import tronqué ou rejeté ajoute un code dans `telemetryWarnings`, accessible en détail sur l’état « Données partielles ». La note et les inférences qui dépendent du domaine concerné sont inhibées. Les warnings sont conservés lors des fusions qui gardent des télémétries anciennes.

Bornes : fichier/API 32 MiB ; au plus 500 parties retenues, 64 acteurs/slots source, 1000 relevés de statistiques et achats par acteur, 500 décès, 21601 points par trajectoire, 5000 timestamps de combat. Les bornes et incohérences déclenchent des avertissements de couverture, pas un diagnostic complet. Les deux limites de taille sont appliquées côté import et côté lecture réseau ; le cache serveur est limité à 128 MiB de payloads, 100 entrées et 10 minutes.

Les profils détaillés sont conservés dans IndexedDB, séparément des builds locaux. Les anciens profils localStorage sont migrés. Les écritures et suppressions sont ordonnées pour empêcher qu’une sauvegarde en retard rétablisse un profil effacé. Les références historiques envoyées au Worker n’emportent pas leurs trajectoires et matrices inutiles.

Voir [REVIEW.md](REVIEW.md) pour les règles de calcul et [CARTE.md](CARTE.md) pour l’intégrité spatiale.
