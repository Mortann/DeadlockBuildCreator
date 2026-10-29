Deadlock et ses personnages, objets et illustrations appartiennent à Valve Corporation. Ce projet de fans n’est ni affilié à Valve ni approuvé par Valve.

Les valeurs du catalogue sont extraites des fichiers client versionnés chez SteamDatabase/GameTracking-Deadlock. Le commit, la version et les empreintes des fichiers source sont conservés dans `src/data/snapshot.json`.

Les illustrations de présentation présentes dans `public/assets/` proviennent des assets du jeu distribués par le projet Deadlock Blueprint, commit `34aa8a72460479c67ec4a0fda457a389ef246eb5`. Le manifeste `public/assets/provenance.json` conserve leur origine et leur empreinte SHA-256. Les fichiers absents utilisent un pictogramme local Lucide. Les droits sur les illustrations restent ceux de Valve ; aucune licence générale des données ou approbation d’un coach n’est déduite de la licence d’un outil communautaire.

Les pictogrammes Lucide sont fournis par le paquet `lucide-react` sous licence ISC. React est sous licence MIT. Les licences des dépendances sont distribuées avec leurs paquets.

Les typographies de présentation Retail Demo, VALVEOracle et VALVEPulp sont issues des ressources utilisées par le client Deadlock et distribuées par Deadlock+, commit `0dd5027754cbdeea7fd7b2c8c668ebc7e6d73dab`. Leurs URL et empreintes sont conservées dans `public/assets/fonts/provenance.json`. Elles restent la propriété de leurs ayants droit ; leur disponibilité dans un projet communautaire ne constitue pas une licence générale de réutilisation commerciale. Les captures de `docs/references/` servent de références documentaires uniquement et montrent Deadlock+, pas une exécution du client Valve.

Le catalogue de présentation des héros et ses portraits supplémentaires proviennent de l’API publique `https://api.deadlock-api.com/v1/assets/heroes?language=english`, consultée le 29 octobre 2026. Le catalogue minimal est dans `src/data/heroRoster.json` ; les URL et empreintes des portraits sont dans `public/assets/heroes/provenance.json`. Ils restent des ressources Valve. Le script `scripts/sync_hero_roster.py` permet de les rafraîchir sans modifier les modèles de combat.
