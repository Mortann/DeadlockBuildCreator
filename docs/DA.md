Direction visuelle — 29 octobre 2026

L’utilisateur demande la direction artistique du client Deadlock : éditeur proche de la boutique/builds du jeu, statistiques proches des écrans de fin de partie, langage graphique prioritaire et texte limité aux informations utiles.

La recherche s’appuie sur les styles Panorama et layouts du client 6821, commit SteamDatabase `d251cf9d9a796061c90f58724230b7e17b97121b`. Les styles sont des sources du client extraites par un outil communautaire ; le jeu n’a pas été exécuté pendant cette recherche.

| Référence primaire                                                                                                                                                                                                       | Éléments étudiés                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| [citadel_base_styles.css](https://github.com/SteamDatabase/GameTracking-Deadlock/blob/d251cf9d9a796061c90f58724230b7e17b97121b/game/citadel/pak01_dir/panorama/styles/citadel_base_styles.css)                           | Palette, typographies, couleurs de catégories et d’équipes                                  |
| [citadel_shop_mod_view.css](https://github.com/SteamDatabase/GameTracking-Deadlock/blob/d251cf9d9a796061c90f58724230b7e17b97121b/game/citadel/pak01_dir/panorama/styles/citadel_shop_mod_view.css)                       | Cartes d’objets : illustration, nom, proportions, états actif/possédé                       |
| [citadel_shop_mods_build_category.css](https://github.com/SteamDatabase/GameTracking-Deadlock/blob/d251cf9d9a796061c90f58724230b7e17b97121b/game/citadel/pak01_dir/panorama/styles/citadel_shop_mods_build_category.css) | Groupes de build, encadrements, titres et groupes optionnels                                |
| [citadel_hud_hero_shop.css](https://github.com/SteamDatabase/GameTracking-Deadlock/blob/d251cf9d9a796061c90f58724230b7e17b97121b/game/citadel/pak01_dir/panorama/styles/citadel_hud_hero_shop.css)                       | Hiérarchie de boutique et navigation par catégorie                                          |
| [match_details_graphs.css](https://github.com/SteamDatabase/GameTracking-Deadlock/blob/d251cf9d9a796061c90f58724230b7e17b97121b/game/citadel/pak01_dir/panorama/styles/match_details_graphs.css)                         | Fond sombre, tracés et grilles discrets, couleurs par joueur/équipe, commandes de graphique |
| [Post-game scoreboard](https://github.com/SteamDatabase/GameTracking-Deadlock/blob/d251cf9d9a796061c90f58724230b7e17b97121b/game/citadel/pak01_dir/panorama/styles/post_game/citadel_db_post_game_scoreboard_new.css)    | Portraits, valeurs comparables, traitement Ambre/Saphir                                     |

Deux références visuelles secondaires sont conservées dans `docs/references/`. Il s’agit de captures de Deadlock+, un outil communautaire qui reproduit l’éditeur du jeu et présente ses statistiques. Elles ne sont pas présentées comme des captures prises dans le client Valve. La palette et les règles typographiques de l’application viennent des styles client ci-dessus.

| Token client                  | Valeur utilisée       |
| ----------------------------- | --------------------- |
| offBlack                      | `#10130D`             |
| offWhite                      | `#FFEFD7`             |
| courageBrightColor            | `#EC9719`             |
| fortitudeBrightColor          | `#7BBA1D`             |
| spiritBrightColor             | `#CE90FF`             |
| buildsLightColor              | `#85B5FF`             |
| team1Color / team1ColorBright | `#D4860B` / `#FBDCA0` |
| team2Color / team2ColorBright | `#4D75C3` / `#BDCBFF` |
| soulColor                     | `#70F8C1`             |

Les familles du client sont Retail Demo pour les commandes et libellés, VALVEOracle pour les titres et noms d’objets, VALVEPulp pour le logotype typographique. Les fichiers web utilisés sont servis localement ; leurs sources et empreintes sont enregistrées dans `public/assets/fonts/provenance.json`. Les 156 objets disposent de leur illustration ; les chemins et empreintes sont dans `public/assets/provenance.json`.

Décisions d’interface :

- Le build est représenté par ses cartes et groupes Lane / Mid game / Late game, avec un groupe optionnel séparé.
- Les catégories se lisent par couleur et pictogramme, sur un rail latéral.
- Les noms, phases, prix, unités et actions restent écrits. Slogans et commentaires méthodologiques disparaissent du parcours principal.
- Les synergies se lisent comme une chaîne d’icônes. Les conditions non appliquées restent atténuées et peuvent être activées explicitement.
- Les comparaisons présentent deux objets, leurs coûts et des écarts chiffrés. Le périmètre du modèle reste signalé par une pastille courte, détaillée à la demande.
- Les parties sont représentées par une courbe économique, les achats et morts horodatés, l’inventaire au curseur et des barres d’équipe. Aucun texte ne transforme une proximité de morts en diagnostic certain.
- Données manquantes : absence de courbe ou valeur « — », objets inconnus signalés visuellement. Ne jamais remplacer une absence de données par un zéro ou une courbe d’exemple.
- Les détails d’objets, conditions, sources et exclusions sont accessibles par clic, focus clavier ou infobulle. Une phrase explicative n’est conservée que si elle sert une action ou décrit un effet d’objet.

Les formes et espacements sont adaptés au web et au mobile. Le site reprend les codes observés ; il ne constitue pas une réimplémentation du renderer Panorama ni une reproduction pixel à pixel du client.
