# Carte des moments de partie

Depuis l’itération du 29 octobre, la carte est l’élément central d’une page de review en plein écran. Les rues du jeu, les lignes et les événements sont affichés derrière les joueurs observés ; la review ne défile pas verticalement.

## Fond de carte distribué

Le masque de rues **City Never Sleeps** du 29 septembre 2026 est servi localement dans `public/assets/map/midtown-6711.avif`. Son URL publique, son empreinte et sa provenance Valve sont consignées dans `public/assets/map/provenance.json`. L’image a été inspectée sans modification graphique. Elle provient de la distribution publique de cet asset du jeu par Statlocker ; la route officielle de métadonnées nomme le même masque mais son URL PNG répondait 403. Le fond n’est pas une capture de l’interface de Statlocker.

La géométrie est issue de [Deadlock API, version 6821](https://api.deadlock-api.com/v1/assets/map?client_version=6821) : rayon 10752, courbes cubiques des trois lignes et positions des objectifs. Le snapshot minimal et les dates des manifests de patch sont dans `src/data/mapSnapshot.json`. Le [code du fournisseur](https://github.com/deadlock-api/deadlock-api/blob/master/crates/game-assets/src/versions/map/mod.rs) distingue la famille City Never Sleeps à partir du build 6711. La présentation locale prend en charge cette famille jusqu’au build 6821 vérifié. Un client explicitement incompatible ne reçoit pas ce fond. En l’absence de version dans les métadonnées, le patch est choisi par la date du manifeste précédant la partie : cette déduction reste indiquée dans le titre de la carte et ne prouve pas la version exacte de son client.

Les anciennes versions non couvertes conservent une vue relative, sans rues inventées. Le cadrage peut être basculé entre la vue entière (par défaut sur la carte géographique) et le voisinage du joueur. Le fond et les annotations utilisent toujours la même transformation ; les joueurs hors cadre sont comptés et ne sont pas ramenés artificiellement sur les bords.

## Projection

`src/domain/map.ts` projette les coordonnées observées sur le carré `[-R,+R]`, sans conversion en mètres :

```text
imageX = (worldX + R) / (2R) × imageSize
imageY = (R − worldY) / (2R) × imageSize
```

Le rayon est fourni par la calibration. Les positions quantifiées sont décodées avec les bornes et résolutions propres à chaque trajectoire, avant le rendu. Les positions de marqueurs d’objectifs de l’API sont des coins supérieurs gauches CSS : leur centre ajoute la moitié de la taille documentée (10%×10%, et 30%×8% pour les bases). La base représente une zone de spawn, pas la position précise d’un bâtiment. Les lignes reprennent les splines et tangentes réelles ; elles ne servent pas de calcul de trajet praticable.

## Lisibilité et intégrité

- Un joueur exige une position finie, observée avant ou à l’instant affiché et datant de douze secondes au maximum. Son âge est consultable au focus. Les manquants restent absents.
- La trajectoire du joueur étudié est visible par défaut. Sélectionner un autre portrait révèle sa trajectoire ; toutes les trajectoires adverses ne sont plus superposées d’emblée. Les flèches suivent seulement les derniers relevés du joueur.
- Les traces couvrent vingt-quatre secondes, avec rupture aux trous de plus de douze secondes et aux décès. Les sentinelles `health:0` / `alive:false` interrompent une trace sans être dessinées.
- La lecture avance le curseur par pas d’une seconde, quatre fois par seconde ; les positions restent des relevés réels. La lecture s’arrête à la fin de l’épisode et son minuteur est supprimé à la sortie de la page.
- Le marqueur de décès apparaît seulement après l’événement. Son heure est visible ; il peut rester comme événement historique pendant la séquence sans se transformer en joueur vivant. Le marqueur d’objectif change d’état uniquement lorsque la destruction a eu lieu.
- Un objectif sur la carte ne prouve pas que le joueur pouvait l’atteindre, le voir ou le défendre. Aucune vision complète, navigation ou issue de combat alternative n’est déduite du fond visuel.
- Les transitions de pages et effets visuels respectent `prefers-reduced-motion`. Les animations ne constituent pas une interpolation de positions dans le moteur.

Les tests vérifient la projection, les marqueurs d’objectifs, le refus d’une version incompatible, les données futures et la rupture des traces. Les tests navigateur vérifient le fond réel, les trois lignes, le focus des trajectoires, la lecture, la fermeture et les dimensions de la carte dans le lecteur sans défilement.
