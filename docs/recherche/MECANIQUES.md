# Construire un build Deadlock : constats et méthode

Recherche le 28 octobre 2026. Source principale : fichiers du jeu extraits par SteamDatabase, commit `d251cf9d9a796061c90f58724230b7e17b97121b`. Le fichier `steam.inf` indique client 6821, 26 octobre 2026. Les éléments ci-dessous sont des faits de données ou des principes de décision explicitement distingués. Aucun test dans le client Deadlock n'a été réalisé.

## Ce que les données actuelles permettent de confirmer

- Le jeu conserve les catégories Weapon, Vitality, Spirit, mais la catégorie ne suffit pas à prédire le type de dégâts : un objet Spirit peut améliorer les dégâts de balle, et des attaques de balle peuvent déclencher des effets Spirit. Exemple confirmé : Bullet Resist Shredder est classé Spirit et réduit la résistance aux balles après dégâts Spirit.
- `generic_data.vdata`, `m_nItemPricePerTier` : `[0, 800, 1600, 3200, 6400, 9999]`. Les quatre paliers ordinaires observés sont donc 800/1600/3200/6400 âmes. Ne pas reprendre 500/1250/3000/6200 ou 500/1250/3500/6200 d'anciens guides.
- Le client expose des graphes d'investissement par catégorie. `heroes.vdata`, `m_MapModCostBonuses`, décrit des seuils d'âmes et bonus Weapon/Vitality/Spirit. Il faut calculer le gain de seuil en plus de l'effet propre de l'objet, et versionner ces règles. Ce ne sont pas nécessairement les anciennes règles « chaque objet T1 donne X ».
- Les niveaux, déblocages de sorts, points d'amélioration et boons dépendent de seuils d'âmes dans `m_mapLevelInfo`. Le budget dépensable et la progression acquise ne sont donc pas une seule variable.
- Revente standard : `citadel_item_sell_price_ratio 0.5`, également confirmée par le texte du client « half the purchase price ». Il existe des fenêtres de remboursement spécifiques : `citadel_autobuy_refund_time 12` pour Auto/Quick Buy, et des mécanismes de restauration des composants ; ne pas appliquer « toujours 50 % dès l'achat » sans contexte.
- Les améliorations d'objets ont de vrais composants (`m_vecComponentItems`). Unstoppable a par exemple Debuff Reducer comme composant. Le coût affiché du prochain achat doit tenir compte des composants détenus ; ne pas compter le composant et son amélioration comme deux objets indépendants. Pour une chaîne donnée, distinguer le coût total d'acquisition du résultat, les âmes déjà investies dans les composants consommés et les âmes supplémentaires à payer maintenant. Vérifier la sémantique du champ `cost` de la source avant toute soustraction afin de ne pas déduire deux fois le composant. Le dump confirme les composants mais n'a pas fourni à lui seul une observation de transaction en boutique.
- Le jeu distingue saturation d'inventaire, emplacements d'actifs et emplacements supplémentaires liés aux objectifs. Les textes actuels citent les Walkers pour les emplacements supplémentaires. **Je n'ai pas confirmé sans ambiguïté le nombre initial/maximal ni toutes les conditions dans le build actuel.** Les anciens nombres ne doivent pas être codés par habitude.
- Les capacités comportent des coefficients de scaling, des durées/portées/cooldowns, des effets d'amélioration et des paramètres spécifiques par héros. Un gain de Spirit ne correspond pas uniformément à un même pourcentage de dégâts sur tous les sorts. Les tableaux `m_vecAbilityUpgrades` permettent de lire les gains de chaque amélioration ; les points/AP et les déblocages de sorts sont distincts dans `m_mapLevelInfo`. L'ordre de dépense est une partie du build et peut atteindre un seuil de dégâts, charge ou réduction de cooldown avant un achat d'objet. Les coûts couramment cités 1/2/5 AP n'ont pas été revalidés dans la source actuelle inspectée ; ne pas les présenter comme confirmés ici.
- Les actifs ont une fenêtre d'utilisation réelle : Metal Skin indique immunité aux balles, pas immunité générale ; Unstoppable indique immunité à plusieurs contrôles, mais **ne peut pas être activé étourdi ou endormi**. Il faut distinguer prévention, purge et réduction de durée.
- Contre-soins : Healbane se déclenche sur dégâts Spirit et réduit les soins reçus ; Toxic Bullets demande une accumulation par balles puis applique saignement et réduction des soins. Un bon choix dépend donc de la capacité du héros à appliquer l'effet, pas seulement du pourcentage de réduction.
- Les données actuelles contiennent variantes Enhanced (Street Brawl) et Corrupted (Broker). Le texte précise un avantage accompagné d'un désavantage randomisé par partie. **La présence des assets ne prouve pas que le mécanisme est activé dans toutes les files ; la valeur par défaut `citadel_corrupted_item_shop_enabled=false` ne prouve pas non plus son inactivité sur les serveurs publics**, qui peuvent la modifier. Mode, patch, variante et paramètres tirés doivent faire partie de l'identité d'un objet observé.
- Street Brawl est décrit par le client comme un mode 4v4, premier à trois manches. Ses valeurs ajustées, drafts et variantes doivent rester séparées de l'analyse du mode standard.

## Le jeu propose déjà un builder assez riche

Les textes client confirment : catégories personnalisées et descriptions, commentaires par objet, ordre des points de capacités, priorité de revente (0 à 100), cible d'imbue, BuildID, versions et date de mise à jour, signalement d'objets obsolètes. Un site qui se limite à sélectionner des objets et partager une liste apporte donc peu. La valeur doit venir du raisonnement, de la comparaison et de l'adaptation.

## Méthode de construction pertinente

1. Définir le rôle et la façon de gagner les combats : portée, durée d'exposition, burst ou dégâts soutenus, poursuite, initiation, soutien, pression de carte. Un héros peut avoir plusieurs archétypes légitimes.
2. Identifier le moteur du build : interactions réellement multiplicatives ou seuils critiques, moyen d'appliquer les procs et contrôles, dépendance aux niveaux/AP/imbues. Évaluer les synergies sur le kit et un scénario, pas seulement sur les tags des objets.
3. Construire une trajectoire d'achat jouable. Un build final ne dit rien sur la capacité à survivre à 4 minutes, farmer, contester un objectif ou terminer un achat coûteux avant le prochain combat. Comparer acheter maintenant, attendre, améliorer et revendre avec leur coût d'opportunité.
4. Réserver un budget d'adaptation. Menaces : soins, dégâts soutenus de balle, burst Spirit, contrôles, mobilité, portée, furtivité, canalisation. Vérifier qu'un allié couvre déjà le besoin, que les effets se cumulent et que le joueur peut appliquer/activer le contre.
5. Choisir le compromis pour ce joueur : un actif supplémentaire inutilement complexe peut valoir moins qu'une option passive légèrement moins efficace sur une cible d'entraînement. L'apprentissage des actifs est aussi une progression souhaitable ; laisser le joueur choisir.
6. Comparer à budget, patch, héros, progression et scénario comparables. Mesurer séparément burst, DPS soutenu incluant rechargement, portée, mobilité, temps de survie, sustain sous anti-heal, contrôle et utilité d'équipe. Ne pas fabriquer un « score de build » universel.
7. Après la partie, décrire ce qui est observé, ce qui est plausible et ce qui manque. Un mauvais résultat ne prouve pas un mauvais achat ; un bon résultat ne valide pas l'achat.

## Statistiques : pièges qui changent la recommandation

- Le winrate d'un objet coûteux est biaisé par le fait d'avoir pu l'acheter, souvent dans une partie déjà favorable. Corrélation d'achat-victoire ≠ effet causal de l'objet.
- Héros, rang, patch, région, mode, durée et temps d'achat changent les distributions. Un objet acheté en quatrième position n'est pas comparable au même objet rushé.
- Les builds très spécialisés ont parfois peu de parties et des joueurs experts ; montrer taille d'échantillon et incertitude plutôt qu'un classement de quelques dixièmes.
- Inventaire final, ordre d'achat, reventes et fenêtres de combat répondent à des questions différentes. Un inventaire final n'est pas une recette d'achat.
- Une contre-performance sur un matchup peut venir de la phase de lane, d'une différence de niveau ou de coordination, pas des objets. Pas de diagnostic psychologique ou tactique certain à partir d'un KDA seul.
- Les recommandations devraient indiquer le motif et l'effet attendu : « tu peux appliquer cette réduction de soins régulièrement », plutôt que « cet objet a le meilleur winrate ».

## Exigences d'un futur simulateur

Les assets ne sont pas un moteur complet. Avant de promettre un DPS exact, il faut valider dans le sandbox du jeu : ordre d'application des modificateurs, résistances et réductions, règles d'empilement, cooldowns et durée, limites de vitesse, procs/ICD, atténuation à distance, hitbox/headshots, chargeurs/rechargement, caps et conditions d'activation. La formule mathématique `PV / (1 - résistance finale)` peut décrire une résistance finale positive isolée, mais ne suffit pas à retrouver la résistance finale, les boucliers, les réductions spécifiques ni les soins. Aucune formule de stacking non vérifiée n'est validée par cette recherche.

Un premier calculateur peut annoncer des résultats limités et expliqués sur quelques scénarios fiables, puis étendre sa couverture. Les scénarios devraient préciser durée du combat, distance, précision, résistance cible, application des procs et disponibilité des actifs ; résultats sous forme de fourchettes lorsque les hypothèses varient.

## Sources précises

Toutes les URL ci-dessous pointent vers le commit observé, afin que les règles puissent être reproduites.

- Version du client : https://github.com/SteamDatabase/GameTracking-Deadlock/blob/d251cf9d9a796061c90f58724230b7e17b97121b/game/citadel/steam.inf
- Prix par palier et paramètres globaux : https://github.com/SteamDatabase/GameTracking-Deadlock/blob/d251cf9d9a796061c90f58724230b7e17b97121b/game/citadel/pak01_dir/scripts/generic_data.vdata#L988
- Progression et bonus d'investissement : https://github.com/SteamDatabase/GameTracking-Deadlock/blob/d251cf9d9a796061c90f58724230b7e17b97121b/game/citadel/pak01_dir/scripts/heroes.vdata
- Définitions capacités/objets, composants et paramètres : https://github.com/SteamDatabase/GameTracking-Deadlock/blob/d251cf9d9a796061c90f58724230b7e17b97121b/game/citadel/pak01_dir/scripts/abilities.vdata
- Descriptions exactes des objets : https://github.com/SteamDatabase/GameTracking-Deadlock/blob/d251cf9d9a796061c90f58724230b7e17b97121b/game/citadel/resource/localization/citadel_mods/citadel_mods_english.txt
- Règles exprimées dans l'interface, builder, modes et variantes : https://github.com/SteamDatabase/GameTracking-Deadlock/blob/d251cf9d9a796061c90f58724230b7e17b97121b/game/citadel/resource/localization/citadel_main/citadel_main_english.txt
- Convars (revente, remboursements, variantes ; valeurs par défaut, pas état d'une partie) : https://github.com/SteamDatabase/GameTracking-Deadlock/blob/d251cf9d9a796061c90f58724230b7e17b97121b/DumpSource2/convars.txt
- API assets communautaire et pipeline d'extraction : https://github.com/josalame/deadlock-api-assets
- Documentation assets à reconsulter : https://assets.deadlock-api.com/docs (accès direct refusé par le proxy pendant cette recherche).
- Wiki à reconsulter pour vérification secondaire : https://deadlock.wiki/Items (accès direct refusé par le proxy pendant cette recherche).

## Points encore ouverts

Nombre et règles exactes des slots au patch courant ; caps/règles d'empilement mathématiques ; activation réelle et couverture des variantes selon les files ; validation numérique en sandbox ; qualité des recommandations sur de vrais joueurs. Ces limites doivent empêcher une promesse de simulateur exact ou d'expertise exhaustive avant expérimentation.

## Complément ciblé : retour pendant la création du build

La priorité exprimée est un atelier qui répond pendant l'édition : quels objets se renforcent, quel achat faire d'abord, comment la puissance évolue et contre quels adversaires. Ce besoin peut être servi avant tout accès à une partie en direct.

### Fonctionnement recommandé

Le joueur fixe héros, patch/mode, objectif de jeu et budget. Le panneau central est une séquence d'achats, avec déblocages/AP et cible d'imbue. Chaque modification montre les écarts du build à budget comparable sur quelques scénarios explicites : burst court, combat soutenu incluant recharge, survie à un profil de dégâts, capacité à rejoindre/retenir une cible. Les durées et distances sont configurables ; 3 secondes et 12 secondes peuvent servir de valeurs d'interface, pas de vérités universelles.

La comparaison face à un héros doit distinguer son kit de son build. « Contre Haze » n'est pas assez précis si ses objets, sa portée d'engagement et son budget changent. Proposer un profil adverse standard documenté puis des variantes burst/soutenu/résistances, et permettre de remplacer ce profil par un inventaire observé ou choisi. L'adversaire n'est pas supposé immobile et sans capacité défensive.

Une recommandation expose une chaîne causale de mécanique, avec ses conditions : « tes dégâts Spirit appliquent Bullet Resist Shredder ; tes tirs suivants profitent de la réduction ; le bénéfice chute si tu n'as pas de fenêtre pour tirer ». Une compatibilité de tags ou une corrélation dans les builds populaires ne suffit pas à affirmer une synergie.

Une courbe de puissance doit d'abord être affichée **par budget/progression**, puis projetée dans le temps avec une hypothèse d'âmes par minute ou la trajectoire personnelle observée. Une courbe « minute 10 » sans hypothèse de farm est trompeuse. Montrer séparément l'effet de l'achat, des boons/AP et des seuils d'investissement. Inclure les creux : économiser un gros objet laisse le joueur plus faible avant le pic.

Pour l'ordre d'achat, résoudre un problème sous contraintes : budget de départ, revenus choisis, objectifs imminents, slots disponibles, composants, reventes et limite d'actifs. Comparer 2–3 trajectoires : pression immédiate, pic plus tardif, sécurité/contre. Appeler cela « meilleur pour cet objectif et ces hypothèses », pas « ordre optimal absolu ». Commencer avec un petit ensemble d'objets candidats sélectionnés par l'utilisateur, plutôt qu'un moteur qui prétend explorer tous les inventaires et styles de jeu.

### Données nécessaires et niveau de fiabilité

| Résultat souhaité | Données nécessaires | Ce qu'il faut encore valider |
| --- | --- | --- |
| Coût et calendrier d'achat | Prix versionnés, composants, inventaire, ventes, revenus hypothétiques/observés | Sémantique coût total/marginal API, exceptions de remboursement et consommation composants |
| Effet sur les sorts | Valeurs de base, coefficients Spirit, rang/AP, upgrades, imbue, cooldown/durée/portée, conditions | Ordre exact de cumul, arrondis, overrides propres au sort et aux variantes |
| Burst | Dégâts et timings d'animation/cast, charges, cooldowns, procs, résistance cible | Ce qui peut réellement être enchaîné, exclusivité d'actions, ciblage, projectile et délai d'application |
| DPS soutenu | Dégâts par balle, pellets, cadence, chargeur, recharge, distance, précision/headshots, procs | Caps, cadence effective, buildup/ICD, ordre des multiplicateurs et atténuation |
| Survie | PV, boucliers/barrières, résistances finales, soins/lifesteal, anti-soins, profil entrant | Empilement résistance/réduction, exclusions immunités, soin effectif pendant engagement |
| Contrôle et mobilité | Durées, portée, cooldown, vitesse, stamina, dash, restrictions, immunités/purge | Rendements décroissants et vitesse effective, animation, fenêtres d'utilisation |
| Matchup | Kit/build/progression adverses, profils de dégâts et contrôles, objectifs | Exécution réelle, positionnement et coordination ne sont pas déterministes |

### Explications marginales utiles

- « Ce changement gagne X dégâts dans le scénario choisi, mais retarde ton achat défensif de Y âmes. »
- « Le gain de Spirit améliore ce sort et sa durée, mais pas cet autre paramètre : son coefficient n'existe pas. »
- « L'essentiel du gain vient du seuil d'investissement franchi ; acheter un autre objet de la même catégorie peut atteindre le même seuil. »
- « Cet upgrade consomme le composant ; le prochain paiement et la valeur totale du résultat sont deux montants différents. »
- « Cette combinaison ajoute surtout du burst, tandis que le rechargement limite toujours le combat prolongé. »
- « Tu as davantage de dégâts théoriques, mais pas de nouvelle solution pour entrer à portée ou survivre au contrôle. »

Les X/Y doivent être calculés seulement si les règles concernées sont validées. Sinon afficher la direction de l'effet et les hypothèses, ou une fourchette ; ne pas transformer l'incertitude en décimales.

### Mathématiques : frontière à respecter

Le moteur peut calculer exactement les transformations dont les règles et paramètres ont été vérifiés, puis simuler des scénarios transparents. Les assets servent de paramètres, pas de preuve que l'algorithme de combat a été reproduit. Tant que les tests en sandbox ne confirment pas les règles de stacking/résistance/cooldown/procs et les actions simultanées, les projections détaillées doivent être étiquetées estimations. Le sandbox sert à **valider le moteur du site**, sans renvoyer le joueur y faire seul toutes ses comparaisons.

Il faut éviter un score global mélangeant 20 % de dégâts avec deux secondes de contrôle et de la mobilité. Montrer plusieurs axes et les compromis donne un outil plus honnête et plus utile. Une fois quelques héros et interactions vérifiés, élargir progressivement avec une indication de couverture par effet.

### Dernière vérification des slots

Le schéma actuel `EAbilitySlots_t.h` énumère explicitement quatre slots d'actifs (`ESlot_ActiveItem_1` à `_4`), confirmation primaire pour la limite d'actifs du modèle. `EItemSlotTypes_t.h` distingue Weapon/Armor/Tech, Universal et UniversalLocked ; cela ne suffit pas à établir le nombre total d'emplacements équipables. `CCitadelAbilityComponent.h` utilise des vecteurs dynamiques pour les capacités, sans constante de taille d'inventaire dans la structure inspectée. Les fichiers Pawn et HUD consultés n'ont pas levé l'incertitude sur le total initial/maximal.

Sources additionnelles :

- https://github.com/SteamDatabase/GameTracking-Deadlock/blob/d251cf9d9a796061c90f58724230b7e17b97121b/DumpSource2/schemas/client/EAbilitySlots_t.h
- https://github.com/SteamDatabase/GameTracking-Deadlock/blob/d251cf9d9a796061c90f58724230b7e17b97121b/DumpSource2/schemas/client/EItemSlotTypes_t.h
- https://github.com/SteamDatabase/GameTracking-Deadlock/blob/d251cf9d9a796061c90f58724230b7e17b97121b/DumpSource2/schemas/client/CCitadelAbilityComponent.h
