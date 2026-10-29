# Carte des moments de partie

Le composant `TacticalMap` affiche les coordonnées réellement enregistrées. Il fonctionne sans carte de fond : la **vue relative** conserve les positions relatives et le rapport entre les axes, sans dessiner de rues, obstacles ou chemins imaginaires. Le mode **Proche** se centre sur la position connue du joueur ou son décès, avec un cercle d’observation de rayon réel. **Tous** recadre sur l’ensemble des observations fraîches. Les joueurs hors cadre sont comptés, sans être déplacés artificiellement au bord. Le repère relatif se recadre selon les observations ; il ne permet donc pas de comparer visuellement des distances entre deux moments distincts.

## Données et projection

`src/domain/map.ts` contient une projection affine testée. L'axe Y des coordonnées du monde pointe vers le haut et celui du SVG vers le bas. Pour une image carrée couvrant `[-R,+R]` sur les deux axes :

```text
imageX = (worldX + R) / (2R) × imageSize
imageY = (R - worldY) / (2R) × imageSize
```

Cette convention et un rayon historique de `10752` sont corroborés par [Deadlock+ — paths.ts](https://github.com/deadlock-plus/deadlock-plus/blob/0dd5027754cbdeea7fd7b2c8c668ebc7e6d73dab/packages/match/src/paths.ts) et [son extraction du minimap client](https://github.com/deadlock-plus/deadlock-plus/blob/0dd5027754cbdeea7fd7b2c8c668ebc7e6d73dab/crates/ring2/dp-gamedata/src/art.rs). **Ce rayon n'est pas utilisé par défaut dans l'application** : une version différente du jeu peut modifier la carte. Aucune conversion en mètres n'est effectuée.

La route `GET /v1/assets/map` du [schéma OpenAPI de Deadlock API](https://api.deadlock-api.com/openapi.json) fournit un `radius`, des couches d'image et des positions d'objectifs. Depuis le build `6711`, les couches `minimap`, `plain` et `mid` décrites dans ce schéma peuvent être le même masque de rues sur fond transparent, et non un fond entièrement composé. Les coordonnées normalisées des objectifs partent du coin supérieur gauche ; leur éventuel décalage d'icône doit être traité séparément de leur position réelle.

Les positions des joueurs proviennent des `CMsgMatchPlayerPathsData` de métadonnées. La déquantification est effectuée avant le rendu dans l'adaptateur de données, avec les bornes et résolutions propres à chaque trajectoire. Le composant ne décode pas ces données et ne les complète pas.

## Activation d'un fond géographique

Le rendu d'une véritable carte nécessite explicitement les deux propriétés :

```tsx
coordinateSpace="world"
calibration={{ radius: rayonVerifie, imageSrc: '/assets/map/version-verifiee.png', clientVersion: versionVerifiee }}
```

L'intégrateur doit vérifier que l'image, son cadrage, l'orientation et le rayon correspondent aux coordonnées de la partie. `clientVersion` sert à transmettre cette provenance ; le composant ne prétend pas vérifier cette correspondance automatiquement. Une image absente ou invalide fait revenir à la vue relative. Les coordonnées hors de l'image restent hors champ et ne sont pas artificiellement rabattues sur une bordure.

Aucun fond géographique n'est distribué actuellement. Les requêtes vers les domaines de Deadlock API et de ses assets ont été refusées par le proxy de cet environnement (`CONNECT 403`). Les sources GitHub consultées documentent l'extraction depuis les ressources installées du jeu, mais ne fournissent pas de fond public dont le cadrage et la version puissent être vérifiés ici. Il n'est donc pas possible d'en déduire une panne du service, ni de garantir un fond adapté à une partie donnée.

## Intégrité du rendu

- Un marqueur joueur exige des coordonnées finies et une observation antérieure ou égale au moment affiché. Il expire après douze secondes ; son âge reste disponible au focus. Ce délai est une règle d'affichage conservatrice, pas une propriété du jeu.
- Les traces relient uniquement des relevés fournis pendant les vingt-quatre secondes précédentes, sans franchir un trou de plus de douze secondes ni un décès. Les échantillons `health:0` / `alive:false` interrompent la trace sans être dessinés. Une liaison droite entre deux relevés n'est pas un chemin praticable calculé.
- Aucune observation future, extrapolation, position par défaut ou interpolation n'est ajoutée. Les positions manquantes ne deviennent pas des joueurs au centre de la carte.
- Un décès et un objectif sont dessinés uniquement si leur position a été fournie. Un objectif ne prouve pas que le joueur pouvait l'atteindre, le voir ou le défendre.
- Les flèches `observed` montrent un lien entre points fourni par l'analyse. Les flèches `suggested` sont en pointillés et portent la légende « Option ». Elles ne prouvent ni la faisabilité d'un déplacement, ni un résultat alternatif.
- Sans fond vérifié, le libellé « Vue relative » et le repère sans rues sont permanents. Ni lignes, ni bâtiments, ni distance de trajet ne sont inventés.

Les portraits locaux déjà présents dans `public/assets/heroes` suivent la provenance existante de `public/assets/provenance.json`. Les autres marqueurs sont du SVG et des icônes Lucide, sans nouvelle image tierce. Toute future image de carte doit être ajoutée avec URL source, date/version, empreinte SHA-256 et statut d'autorisation dans une fiche de provenance sous `public/assets/map/`. Les droits des ressources du jeu restent ceux de leurs ayants droit ; aucune permission nouvelle n'est déduite de leur accessibilité.

Validation ciblée : `npm test -- tests/map.test.ts` couvre les axes et bornes, la conservation des rapports spatiaux, l'absence de rabattement sur les bords, le rejet des observations futures et la rupture des traces aux trous de télémétrie.
