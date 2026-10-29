Étude DeadlockBuildCreator — 28 octobre 2026

Le besoin à résoudre est de donner un retour utile pendant la création d’un build : comprendre les synergies, organiser les achats, voir les fenêtres de puissance et savoir dans quels affrontements le plan fonctionne. Cela place un laboratoire interactif au centre du produit. L’analyse après partie peut ensuite ramener des situations réelles dans ce laboratoire ; l’assistance pendant la partie peut en devenir une extension.

Le présent document est une étude de faisabilité et une proposition produit, pas une validation en jeu. Les schémas, sources et fichiers client ont été consultés. Aucun match réel n’a été interrogé et aucun calcul n’a été vérifié dans le sandbox de Deadlock. Les domaines de l’API et du wiki ont été refusés par le proxy de cet environnement ; leurs sources GitHub accessibles ont permis de poursuivre. Ce refus ne démontre pas une panne des services.

Les références principales sont la [spécification OpenAPI figée](https://github.com/deadlock-api/openapi-clients/blob/2c3f2adc4dd7068dd91605ab2a2c9163e0bf6000/openapi.json), les [sources de l’API](https://github.com/deadlock-api/deadlock-api) et les [fichiers du client suivis par SteamDatabase](https://github.com/SteamDatabase/GameTracking-Deadlock/tree/d251cf9d9a796061c90f58724230b7e17b97121b). Ces derniers indiquent un client 6821 daté du 26 octobre 2026. Le second regard sur l’utilité des fonctions a été réalisé par un sous-agent jouant un rôle critique de joueur : c’est une simulation de jugement, sans entretiens utilisateurs ni preuve d’efficacité.

**Les données disponibles rendent le projet crédible.**

Deadlock API est un projet communautaire. Son propre contrat précise qu’il n’est pas une API officielle endossée par Valve. Les lectures sont souvent accessibles sans clé ; des clés et accès spécifiques permettent des limites supérieures. Les détails doivent être vérifiés route par route.

| Domaine | Informations documentées | Utilisation concrète | Limite à conserver dans le produit |
|---|---|---|---|
| Héros et capacités | Caractéristiques, armes, scalings, améliorations, descriptions et images | Construire le modèle d’un héros et ses paliers | Les assets ne décrivent pas nécessairement toute la logique exécutée par le jeu |
| Objets | Propriétés, catégories, composants, effets, versions et langues | Catalogue, calcul marginal, synergies et comparaison | Distinguer objets actifs, objets obsolètes et variantes selon les modes |
| Builds publiés | Auteur, groupes, notes, ordre de compétences, imbue, priorités de vente | Importer un plan et l’expliquer | Lecture documentée ; publication automatique dans le jeu non établie |
| Joueurs | Identité Steam, historique disponible, héros joués, victoires, KDA, farm, dégâts, soins, précision et objectifs selon les réponses | Profils et rythmes économiques personnels | La couverture varie ; absence de données ne signifie pas absence de partie |
| Rang | Rang récent et informations associées | Comparaisons avec une population pertinente | Ne fournit pas un MMR secret exact universel |
| Matchs terminés | Composition, résultat, achats/ventes datés, courbes économiques, statistiques, objectifs | Reconstruire la trajectoire du build et sélectionner une décision à analyser | Les métadonnées détaillées ne sont pas garanties pour tout match |
| Détail avancé | Morts/positions, dégâts/soins/contrôles, chemins et événements selon les messages et démos | Analyser certaines interactions et revoir des moments précis | Un champ prévu dans un schéma peut être absent d’un match ; les agrégats ne décrivent pas toujours un combat particulier |
| Replays | Requêtes SQL sur démonstrations, exports et jobs asynchrones | Extraire des données fines et préparer des tests de modèle | Accès dépend des références de téléchargement et de la disponibilité Valve |
| Méta | Stats d’objets et combinaisons, flux d’achats, ordres de capacités, synergies et matchups | Proposer des alternatives et situer un choix dans des pratiques observées | Données observationnelles, échantillonnage et biais importants |
| Patchs | Flux de changements et versions d’assets | Identifier les builds affectés et préserver l’analyse historique | Un ancien match doit être interprété avec ses anciennes règles |
| Parties en cours | Découverte de matchs, broadcast, événements SSE | Observation et expérimentation d’un suivi | Couverture, délai et disponibilité à mesurer avant une promesse de coach |

L’[inventaire des routes](API_ROUTES.md) conserve les 132 chemins du schéma consulté. L’[étude API détaillée](API.md) donne les endpoints, quotas et références.

Les points de couverture sont structurants : sans mécanisme ami-bot, l’historique peut se limiter aux matchs déjà stockés dans la base communautaire. Le mécanisme ami-bot ajoute une récupération Steam, mais ne garantit pas ici un rattrapage complet de tous anciens matchs et replays. Steam OpenID vérifie une identité ; il ne débloque pas automatiquement un historique privé. Le site doit pouvoir annoncer « matchs disponibles pour ce compte », avec une période et un statut d’enrichissement.

Autre piège : les statistiques d’un build sélectionné utilisent un identifiant correspondant au premier build choisi en début de partie. Cela ne prouve pas que le joueur a suivi ses achats, ni qu’il n’a pas changé de plan. Pour évaluer une trajectoire, il faut les achats réels.

**Le temps réel a plusieurs formes qui donnent des produits différents.**

Le service communautaire sait parser une démonstration diffusée d’une partie en cours. Les [sources live-events](https://github.com/deadlock-api/deadlock-api/blob/5902f7ac59dd696ed878889500d9b03680d817b5/live-events/README.md) documentent des événements de joueurs, inventaires/upgrades, vie, positions, économie, morts et objectifs. Ce service autohébergeable est distinct de la route SQL/SSE publique documentée dans l’OpenAPI.

La route de découverte `/v1/matches/active` indique une limite aux 200 premiers matchs de l’onglet Watch. Cette limite concerne la découverte : le [code de résolution d’une URL live](https://github.com/deadlock-api/deadlock-api/blob/master/api/src/routes/v1/matches/live_url.rs) appelle directement SpectateLobby avec un match_id et n’exige pas de passer par cette liste. Un accès hors liste est donc envisageable si l’identifiant est connu, sous réserve de ce qu’autorise et renvoie le Game Coordinator. Cela n’a pas été testé ici.

Le README mentionne une attente initiale pouvant atteindre environ 30 secondes pour obtenir la démo. Ce chiffre ne mesure pas le décalage entre ce que vit le joueur et ce que reçoit le service. Aucun délai de bout en bout n’a été établi pendant cette recherche.

| Approche | Ce qu’elle apporte | Dépendance et limites | Place proposée |
|---|---|---|---|
| Tableau de partie renseigné ponctuellement | Héros, menaces, inventaire ou budget utiles à une comparaison | Quelques actions manuelles ; ne pas demander le suivi de onze inventaires | Première version utilisable sur second écran |
| Capture de la fenêtre du jeu, avec consentement | Lecture possible du HUD : héros, inventaire, âmes et informations effectivement affichées | Reconnaissance à mesurer, résolutions/HDR/HUD variables ; aucun accès aux informations non affichées | Expérience ultérieure si elle réduit réellement l’effort |
| Broadcast spectateur | Événements structurés riches | Découverte, accès, délai, coût et usage pendant sa propre partie à clarifier | Recherche et observation ; fondation du coach seulement après essais |
| Client local lisant la mémoire | Certains outils annoncent une télémétrie locale riche | Ce n’est pas une API web ; maintenance et statut auprès de Valve à clarifier | Ne pas en faire un prérequis du produit |

Un navigateur peut demander le partage d’une fenêtre avec `getDisplayMedia`, puis traiter des images. La [documentation de capture d’écran](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia) impose un contexte sécurisé et une action explicite ; la permission doit être redemandée à chaque nouvelle capture. Un site ouvert ne lit donc pas spontanément le jeu. L’affichage en surimpression et la fiabilité du traitement en arrière-plan sont aussi à tester séparément. Le téléphone peut afficher un tableau synchronisé, mais ne voit pas seul l’écran du PC.

Une source spectateur peut contenir des données que le joueur n’a pas à l’écran. La conception du coach doit distinguer les informations autorisées au joueur des données réservées à l’observation ou à l’analyse après partie. Aucun projet tiers ne constitue à lui seul une approbation de Valve.

**Un build doit être modélisé comme une progression complète.**

Les données actuelles confirment les catégories Weapon, Vitality et Spirit, les composants d’amélioration, les seuils d’investissement par catégorie et la progression des capacités. Les quatre paliers ordinaires de prix observés dans les fichiers sont 800, 1 600, 3 200 et 6 400 âmes. Les anciens chiffres de guides ne doivent pas être repris par défaut.

Les catégories ne déterminent pas directement les effets : un objet Spirit peut soutenir les dégâts de balle. Un gain de Spirit peut modifier des dégâts, une durée, une portée ou une autre propriété selon la capacité. Il faut donc conserver les coefficients et les cibles d’imbue, plutôt qu’appliquer un multiplicateur commun à toutes les capacités.

L’état évalué doit inclure : héros, patch, mode, progression/niveau, capacités débloquées et améliorées, objets détenus, composants, imbues, budget disponible, emplacement disponible et hypothèses de combat. Le budget dépensable et la progression déjà acquise sont deux dimensions différentes.

Les achats peuvent franchir un seuil d’investissement et produire un gain supplémentaire. Une amélioration consomme ses composants ; le coût restant et les effets remplacés doivent être correctement comptés. La revente ordinaire est de moitié selon les données consultées, avec des mécanismes de remboursement particuliers. Quatre emplacements d’actifs sont confirmés par le schéma client `EAbilitySlots_t`. Le nombre total exact de slots d’objets et toutes les conditions actuelles d’ouverture n’ont pas été confirmés sans ambiguïté : ce sont des règles à valider, puis à versionner, avant un validateur d’inventaire.

Les variantes Street Brawl et Corrupted existent dans les données. La présence d’un asset ou la valeur par défaut d’une convar ne démontre pas leur activation dans une file particulière. L’analyse doit séparer les modes et variantes.

L’[étude mécanique détaillée](MECANIQUES.md) distingue les faits vérifiés des paramètres et formules qui restent à mesurer.

**Le laboratoire devrait répondre à cinq gestes du joueur.**

1. Ajouter ou retirer un objet : voir sa contribution au build actuel, les conditions nécessaires pour l’exploiter et ce que son achat retarde.
2. Déplacer un achat : comparer les paliers obtenus plus tôt, les périodes faibles et la difficulté à atteindre l’achat suivant.
3. Changer l’adversaire : évaluer le même build face à un héros, un inventaire, une résistance et une distance définis.
4. Déplacer un curseur de progression : voir simultanément objets, compétences, imbues et effets disponibles à ce stade.
5. Demander pourquoi un objet fonctionne mal dans ce plan : identifier une condition rarement satisfaite, un manque de survie ou une contribution faible dans le scénario choisi.

La comparaison doit montrer plusieurs résultats. Pour un premier périmètre : dégâts d’une séquence définie, dégâts soutenus incluant chargeurs et rechargements, survie face à un profil de dégâts, portée/mobilité et contraintes d’application. Une valeur universelle « puissance 83/100 » cacherait les arbitrages dont le joueur a besoin.

Les synergies peuvent être expliquées comme des chaînes de mécanismes. Exemple documenté : des dégâts Spirit appliquent l’effet de Bullet Resist Shredder, puis les tirs profitent de la résistance balle réduite. La question utile est de savoir si le héros peut appliquer cette première étape et exploiter la fenêtre suivante dans le scénario choisi. Le simple voisinage de deux objets ne prouve pas leur synergie.

Pour une mesure donnée, comparer le build de base, l’ajout de A, l’ajout de B et l’ajout des deux permet de séparer les gains individuels d’un effet combiné. Cela ne donne pas un score universel : le résultat peut être favorable sur un échange long et peu utile sur un burst court. Comparer deux alternatives doit aussi respecter le budget et le coût restant réel des composants.

Deux autres exemples montrent pourquoi le contexte compte : Healbane nécessite d’appliquer des dégâts Spirit ; Toxic Bullets demande une accumulation de tirs. Metal Skin couvre les balles, et n’est pas une invulnérabilité générale. Unstoppable ne doit pas être présenté comme une réponse activable après n’importe quel contrôle : les descriptions actuelles précisent certaines interdictions d’activation. Un conseil doit décrire la condition d’utilisation.

**Les courbes de puissance doivent garder des hypothèses explicites.**

L’axe principal devrait être le budget, avec la progression en compétences visible. Le temps devient une projection construite sur plusieurs rythmes économiques ou, lorsque l’historique le permet, sur les courbes observées du joueur. Il faut éviter de transformer mécaniquement un montant dépensé en minute de partie.

Les vues utiles seraient :

- La même trajectoire comparée à un autre ordre d’achat, avec les instants où l’avantage change.
- Plusieurs courbes séparées : échange court, dégâts soutenus, résistance à une menace et mobilité.
- Des marqueurs de seuil : composant complété, amélioration de capacité, bonus d’investissement, contre disponible.
- Une projection prudente, moyenne et favorable de l’économie ; un plan qui n’existe que dans le scénario favorable doit être signalé.
- Une comparaison avec un adversaire paramétré, à budgets identiques pour isoler les choix ou à budgets différents pour étudier une partie réelle. Ces deux questions doivent rester distinctes.

L’optimisation de l’ordre d’achat doit prendre un objectif déclaré : tenir une phase de jeu, obtenir un burst à un palier donné, farmer, ou garder assez de survie pour utiliser ses dégâts. Le moteur peut proposer quelques trajectoires qui font des compromis différents. Une trajectoire est dominée lorsqu’une autre fait au moins aussi bien sur tous les critères retenus et mieux sur l’un d’eux, dans les mêmes hypothèses. Cela permet un tri utile sans promettre une seule solution parfaite pour toute partie.

Une faiblesse importante peut être une longue attente avant un gros achat. L’évaluation doit donc considérer les états intermédiaires : avoir de meilleurs résultats avec l’inventaire final ne justifie pas nécessairement l’ordre qui y mène.

Le simulateur doit vérifier dans le jeu les règles d’empilement, caps, résistances, délais internes, procs, attenuation à distance et séquences de capacités. Il doit séparer les éléments calculés et validés, les estimations et les effets non modélisés. Un TTK contre une cible immobile ne prédit pas l’issue certaine d’un duel. Les mouvements, le terrain, les réactions, les contrôles et l’exécution du joueur changent l’affrontement.

**Les statistiques doivent compléter les mécanismes.**

Un objet de fin de partie peut avoir un fort taux de victoire parce que les joueurs déjà en avance ont davantage l’occasion de l’acheter. Les joueurs spécialistes, la durée, le rang, le patch, l’ordre d’achat et les opposants affectent aussi les comparaisons. L’API propose déjà un winrate ajusté selon la richesse à l’achat et des indicateurs de survie dans le parcours, tout en précisant leur caractère observationnel.

Le site devrait afficher la population, la période, le nombre de matchs et les conditions de comparaison. Il doit pouvoir dire que les données sont insuffisantes. Une tendance de méta peut suggérer un achat à étudier ; elle ne démontre pas son effet causal sur la victoire d’un utilisateur.

**Les fonctions proposées découlent directement du manque de retour exprimé.**

| Fonction | Retour apporté | Priorité et périmètre crédible |
|---|---|---|
| Aperçu immédiat avant/après un objet | Ce qu’il change réellement dans le build actuel | Cœur de la première preuve de valeur, sur interactions validées |
| Explication des synergies et conditions | Pourquoi deux objets ou un objet et une capacité fonctionnent ensemble | Cœur, avec un petit nombre de chaînes fiables |
| Courbes par budget et progression | Où le build devient fort, où il reste fragile | Cœur, plusieurs dimensions séparées |
| Comparaison de deux ordres d’achat | Ce qui est gagné maintenant et retardé ensuite | Cœur, avant optimisation exhaustive |
| Adversaire et scénario configurables | Contre quoi le plan fonctionne, et sous quelles hypothèses | Cœur limité à quelques profils puis élargissement |
| Suggestions d’achats ou de remplacements | Alternatives liées à une faiblesse identifiée | Après validation de la qualité des calculs et explications |
| Rejouer une décision après match | Importer inventaire et budget réels dans le laboratoire | Extension naturelle, selon couverture des métadonnées |
| Patch appliqué à mes builds | Voir quels paliers, effets et synergies ont changé | Ensuite, avec versions historiques conservées |
| Assistance semi-automatique pendant la partie | Utiliser le même raisonnement à un moment pertinent | Après validation de la collecte, de la fraîcheur et de l’utilité |

Des idées moins courantes peuvent être utiles sans devenir des gadgets :

- Le point de bascule : montrer sous quelles conditions un achat devient préférable à un autre. Par exemple, assez de tirs pour déclencher un effet ou assez de durée pour profiter d’une seconde utilisation. Les seuils ne doivent être chiffrés qu’après validation du modèle.
- « Pourquoi pas cet objet ? » : comparer une intuition du joueur à une alternative, avec les bénéfices obtenus et le problème qui resterait sans réponse.
- Le build volontairement incomplet : un noyau et des places de décision laissées ouvertes, avec les observations qui feront choisir une branche.
- Le budget de complexité : permettre de limiter les actifs ou de privilégier une séquence simple, en expliquant le compromis de performance.
- La robustesse : favoriser un plan qui reste utilisable dans plusieurs rythmes économiques et conditions d’exécution, plutôt que seulement au meilleur cas théorique.

Les fonctions à faible valeur initiale sont une note globale opaque, un chat bavard pendant les combats, un classement d’objets par winrate brut, des graphiques de DPS sans scénario et une prédiction certaine du résultat d’un duel. Elles ne résolvent pas le besoin de comprendre et risquent de masquer les limites des données.

**Le paysage existant impose une différence concrète.**

Le client propose déjà groupes de build, commentaires, ordre de capacités, imbues et priorités de vente. L’API fournit déjà flux d’achats, synergies, matchups et comparaisons statistiques. Des [calculateurs de DPS](https://github.com/sh0drun/deadlock-build-calculator), [outils de recommandations avec OCR](https://github.com/PedroGomesFR/deadlock-blueprint) et [compagnons locaux](https://github.com/deadlock-plus/deadlock-plus) existent aussi. Ces constats viennent de leurs sources et descriptions publiques, sans essai de performance en partie.

La différence à vérifier est donc la qualité du retour pendant l’édition : effets compréhensibles, états intermédiaires, hypothèses réglables, coût d’opportunité et confiance dans les calculs. La recherche ne démontre pas qu’aucun concurrent ne couvre ce besoin ; elle indique une proposition plus précise qu’un catalogue enrichi.

**Le premier périmètre devrait prouver le laboratoire.**

Commencer avec un héros bien connu du joueur, deux styles de build, une sélection d’objets représentatifs et quelques séquences définies. Disposer d’un catalogue large peut être utile, mais chaque interaction calculée doit avoir un statut de couverture. Les objets non modélisés doivent rester visibles comme tels.

La première expérience doit permettre d’ajouter un objet, lire ses effets et conditions, déplacer son achat, comparer deux trajectoires et changer un profil adverse. Elle doit produire un bénéfice avant toute connexion au compte ou collecte live. Après validation, élargir les héros et interactions, puis importer des décisions après match. Le même moteur peut ensuite proposer une adaptation pendant une partie.

Pour vérifier l’utilité, présenter à de vrais joueurs des choix de leurs propres builds, recueillir leur décision avant l’explication, puis vérifier s’ils comprennent le compromis et trouvent le retour applicable. Tester également les calculs contre des mesures reproductibles dans le sandbox. Une simulation par sous-agent aide à critiquer les idées ; elle ne remplace pas ces validations. Une hausse de winrate sur quelques parties ne suffirait pas à prouver la qualité du produit.

**Les prochains verrous techniques sont identifiés.**

1. Interroger les services depuis un réseau autorisé et comparer plusieurs profils/matchs consentis à ce que montre le jeu : présence, délai et champs réellement disponibles.
2. Confirmer slots, coûts marginaux et progression actuels, puis vérifier quelques interactions représentatives en sandbox, y compris un cas où un effet ne s’applique pas.
3. Définir un format versionné pour le héros, les objets, le scénario et la trajectoire d’achat. Préserver les règles historiques pour l’analyse des anciennes parties.
4. Valider les résultats et explications du premier laboratoire avant de généraliser son optimiseur.
5. Pour le live seulement : retrouver une partie ordinaire, mesurer le retard contre une horloge de référence, vérifier pertes/reconnexions et décider quels champs sont utilisables pendant sa propre partie.

L’accès et le coût ne sont pas uniformes : au moment du schéma, certaines récupérations de métadonnées via Steam sont limitées à trois par heure et par IP sans clé, et la résolution d’URL spectateur à six par heure et par IP. Les analytics sont souvent mis en cache pendant une heure. Un futur backend doit gérer cache, files de jobs, temporisation et résultats incomplets ; interroger tout à chaque image ne serait pas une architecture viable.

Enfin, la licence MIT du logiciel de l’API ne vaut pas automatiquement licence générale sur les assets Valve ou toutes les données. Les conditions de réutilisation doivent être clarifiées si une exploitation commerciale est envisagée. Cela ne bloque pas l’étude et la validation du concept.

La proposition retenue est un laboratoire de builds qui rend les décisions visibles et testables. Le constructeur, les comparaisons contre des héros, les retours après match et l’assistance contextuelle deviennent quatre usages du même raisonnement, avec une couverture de calcul annoncée honnêtement.
