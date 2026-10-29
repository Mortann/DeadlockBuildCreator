# Review par chapitres — 29 octobre 2026

La liste des parties est paginée et filtrable. Cliquer une ligne ouvre un lecteur occupant toute la fenêtre, sans défilement. Chaque moment et chaque cas de build a sa propre page ; les courbes et le bilan des équipes terminent le parcours. Les boutons précédent/suivant, les flèches du clavier et Échap permettent de naviguer ou revenir à la liste, avec restauration du focus et de la page de l’historique. Les transitions respectent la réduction des animations du système.

Le parcours contient quatre chapitres accessibles directement : **Bilan**, **Moments clés**, **Build**, **Vue d’ensemble**. Le calcul s’exécute dans un Worker dédié ; chaque chapitre devient disponible après son calcul réel. Changer de partie termine le Worker précédent et invalide ses résultats. Aucun délai artificiel ni analyse fictive n’est ajouté. Le bouton « Compléter les références » charge au plus cinq anciennes parties comparables depuis le cache communautaire, une par une avec progression réelle. Il conserve les chargements réussis si un suivant échoue ; changer de partie invalide la demande en cours.

Le code de calcul est dans `src/domain/review.ts`, la normalisation dans `src/domain/player.ts`, le rendu dans `src/components/Review.tsx`. Les valeurs et seuils ci-dessous sont des heuristiques explicites de cette version, pas des règles de Valve ni un modèle validé sur une population de joueurs.

## Bilan personnel

La lettre A/B/C/D représente une performance observée par rapport à l’historique personnel disponible. Elle n’est ni une précision de décisions, ni une note de build, ni un rang de joueur.

Références admissibles : même compte, même héros, mode standard, sans abandon, parties strictement antérieures, durée proche (écart maximal de 30 % ou 180 secondes), même version lorsqu’elle est connue des deux côtés. Les références dont les statistiques ou les acteurs sont invalides sont exclues. Un défaut de combat, de carte ou d’inventaire n’invalide pas les axes personnels indépendants. Il faut cinq références par axe et au moins trois axes variables pour une lettre. Sans données suffisantes, le résultat reste `—`.

Axes : patrimoine par minute (poids .30), morts par dix minutes inversé (.25), dégâts héros par minute (.25), dégâts d’objectif par minute (.20), soins aux équipiers par minute (.20). Les trois derniers exigent un compteur observé dans les derniers 15 % de la partie. Les poids disponibles sont renormalisés. Les compteurs manquants restent absents ; une série constante ne permet pas de classer. Le rang empirique utilise le milieu des ex æquo et quatre pseudo-observations neutres : `(moins bons + .5 × ex æquo + 2) / (n + 4)`. A ≥ .75, B ≥ .50, C ≥ .25, D sinon. Victoire et défaite n’entrent pas dans ce calcul. Les rôles, l’adversité et la vision ne sont pas normalisés ; les axes restent visibles pour comprendre la lettre.

## Moments et preuves

| Détection                             | Conditions                                                                                                                                                                                                         | Ce que cela permet d’afficher                                                                   |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| Mort / morts rapprochées              | Horodatages de décès ; regroupement si écart ≤180 s, épisode ≤300 s                                                                                                                                                | Une séquence observée, jamais un combat déclaré inutile                                         |
| Indisponibilité à la perte d’objectif | Objectif de l’équipe détruit pendant une durée de respawn effectivement enregistrée                                                                                                                                | Chronologie mort → objectif perdu → retour ; aucun lien causal affirmé                          |
| Proximité défavorable                 | 12 comptes distincts, équipes 6/6, joueur et acteurs vivants observés depuis ≤8 s, décalage entre relevés ≤3 s ; rayon 2D de 1400 unités, écart de hauteur >256 exclu si connu ; au moins deux adversaires de plus | Signal daté. Le rayon n’est ni une portée d’arme, ni un engagement, ni une preuve de visibilité |
| Rythme économique                     | ≥5 références observées au même instant ; patrimoine inférieur de plus de 20 %                                                                                                                                     | Écart personnel descriptif, pas erreur de farm démontrée                                        |
| Neutres et objectif                   | Première touche d’objectif récente, fenêtre de 10–90 s, hausse réellement mesurée de neutral_kills dans cette fenêtre                                                                                              | Coïncidence à examiner, sans trajet hypothétique ni responsabilité attribuée                    |

Les signaux proches sont regroupés, avec trois priorités visibles au bilan. Une même mort ne devient pas plusieurs erreurs. Les absences d’enregistrement ne prouvent pas l’absence d’action.

Les dégâts reçus utilisent les différences de compteurs cumulatifs à leurs bornes réellement enregistrées, à l’intérieur de la fenêtre demandée (tolérance 15 s). Les séries réinitialisées, non monotones ou dupliquées sont rejetées. Les tableaux cumulatifs plus courts que l’horloge conservent leur total final sans alignement temporel supposé ; ils ne servent pas à attribuer les dégâts à un épisode. Seules les sources détaillées nommées sont additionnées ; les lignes génériques `Ability`, `Bullet`, `Melee`, `Misc`, `UnknownAbility` et les noms absents sont exclus pour éviter tout double compte. Les sources affichées peuvent donc être partielles. Les dégâts alliés sont exclus. Un nom de source ne démontre pas un type balle/Spirit.

## Scènes

Avant → Moment → Suite partage un curseur avec la chronologie. « Suite » vise d’abord la perte d’objectif associée. Les preuves agrégées gardent leurs propres horodatages/fenêtres : changer la scène ne transforme pas un total de séquence en mesure instantanée.

Les positions sont observées, jamais extrapolées. Âge maximal d’affichage 12 s, traces sur 24 s, rupture aux trous >12 s et aux décès. Les échantillons morts invalident les derniers points vivants ; leurs coordonnées sentinelles ne sont jamais affichées. Les positions du tueur ne sont introduites qu’à leur horodatage exact, jamais dans « Avant ». Un décès antérieur peut rester marqué comme événement historique, avec son heure, sans devenir une position vivante. Les flèches relient deux relevés successifs ; elles ne sont pas des routes praticables calculées.

La vue proche recentre sur la position connue du joueur ou son décès, avec un cercle de rayon réel. « Tous » montre les autres positions fraîches. Les versions récentes prises en charge disposent du fond de rues réel ; les anciennes versions non couvertes restent en vue relative, sans terrain inventé. Voir [CARTE.md](CARTE.md) pour la projection et les conditions d’un fond géographique calibré. Aucune coordonnée d’objectif n’est déduite de son seul identifiant.

## Audit des achats

Le moteur reconstruit les inventaires détenus **avant** un achat ou moment. Il ne consulte pas les achats adverses futurs. Il recherche :

- des soins adverses récemment observés (≥250 sur 120 s) ou un objet de sustain effectivement détenu ; options Healbane et Toxic Bullets, avec conditions d’application distinctes ;
- des objets actifs de contrôle identifiés, avec Debuff Reducer comme option conditionnelle ;
- une concentration de sources de dégâts relevées (≥400 et≥50 % des sources de la fenêtre), avec une option de réserve de PV, sans déduire un type de dégâts.

Une réponse équipée par le joueur ou un allié est montrée. « Aucune réponse équipée relevée » exige les inventaires connus et reconnus des six alliés. Les inventaires incomplets restent inconnus. Les suggestions sont limitées à deux par famille ; les acteurs impliqués dans les moments détectés sont prioritaires. Les objets non modélisés empêchent une comparaison de coût complète.

Les prix et effets sont ceux du catalogue versionné local. Le coût d’achat crédite les composants détenus et se compare à l’achat observé. Le patrimoine ne devient jamais du cash disponible : aucune alternative n’est déclarée achetable à cet instant, aucun montant de dégâts évités ni résultat de duel n’est prédit. Les différences de version sont signalées. Le raccourci vers le laboratoire permet d’étudier l’inventaire effectivement observé.

## Vue d’ensemble

La **part des âmes** est `patrimoine équipe / patrimoine des deux équipes`, avec 50 % comme parité économique. Elle exige douze acteurs distincts et six par équipe. Chaque point exige les douze patrimoines : interpolation entre observations selon la cadence médiane (au moins trois points), sans franchir un intervalle de plus de 1,5 fois cette cadence, avec un plancher de 120 s et un plafond de 600 s, aucune extrapolation, courbe interrompue aux trous. Les marqueurs de moments ouvrent leur chapitre. Cette mesure n’est pas une probabilité de victoire : un tel modèle exigerait un jeu de données, une validation hors échantillon et une calibration par patch.

L’économie individuelle, les achats, décès et référence personnelle restent reliés au curseur d’inventaire. Aucun historique résumé ne produit une fausse courbe détaillée.

## Validation et limites restantes

Les tests de calcul couvrent références, absence de données, absence de fuite d’informations futures, resets, doubles comptes, couverture collective et scènes. Les tests navigateur utilisent le Worker de production sous CSP et des parties **synthétiques réservées aux tests**. Aucun profil de démonstration n’est injecté dans l’application.

Les formats ont été vérifiés contre les sources primaires et décodeurs cités dans [TELEMETRIE.md](TELEMETRIE.md). La connexion à un compte réel et la review d’une partie récente ont été vérifiées de bout en bout le 29 octobre ; voir RECUPERATION_COMPTE.md. La couverture dépend toujours des métadonnées disponibles. Le moteur ne dispose pas de trajectoires navigables, vision/fog complète, intentions d’équipe, rotations optimales, simulateur complet de capacités ou modèle probabiliste de victoire. Il n’attribue donc pas de verdict à un combat inutile, un farm excessif ou une défense ratée à partir des seuls KDA et timestamps.
