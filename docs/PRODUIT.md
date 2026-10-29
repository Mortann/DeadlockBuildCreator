Décisions produit — 28 octobre 2026

Le produit est un site web de création et d’analyse de builds pour Deadlock. Il doit aider à comprendre les effets des choix avant de jouer, à organiser la progression et à apprendre des parties réellement jouées.

Priorités confirmées par l’utilisateur :

1. Le laboratoire est avant tout un outil de création de builds. Construction et visualisation sont reliées : noyau lane / milieu / fin de partie, adaptations, ordre d’achat, synergies, courbes et comparaison de deux choix.
2. Les parties de la personne font partie des données de calcul. L’historique ne doit pas être une simple page de statistiques à côté du laboratoire. Les observations disponibles doivent alimenter le rythme économique, la précision, les projections et la reconstruction de décisions, avec leur couverture affichée.
3. L’analyse après partie est une priorité forte. Elle doit identifier des décisions problématiques avec des preuves et aider à les comprendre, en tenant compte de l’équipe et des informations disponibles au moment du choix.
4. Le suivi pendant la partie et l’écran secondaire sont secondaires. Leur développement dépendra de la fiabilité des sources live et de l’utilité démontrée des conseils.

Le manque exprimé : les constructeurs essayés ne montrent pas suffisamment l’impact des synergies, l’ordre d’achat, la progression de puissance ni ce que le build permet face aux autres héros. Le joueur doit pouvoir comparer sans refaire lui-même tous les essais en jeu.

Principes du moteur :

- Chaque résultat annonce ses hypothèses, sa source et sa couverture. Aucun historique personnel fictif.
- Distinguer observation, projection et interprétation. Une victoire ou une défaite ne démontre pas à elle seule la qualité d’un achat.
- Plusieurs dimensions de puissance ; aucun score universel arbitraire ou pourcentage d’exactitude assimilé aux échecs.
- Comparer à budget, progression et scénario explicites. Les minutes projetées utilisent les observations économiques disponibles ; une estimation de fin de partie n’est pas une courbe de lane mesurée.
- Les capacités, procs, actifs et interactions non modélisés restent signalés. Les données extraites du client ne remplacent pas une validation du moteur en sandbox.
- Respecter les patches, modes, variantes, données manquantes et préférences du joueur. Ne pas mélanger Street Brawl et mode standard.
- Le noyau définit le plan ; les branches expliquent les conditions d’adaptation et leur coût d’opportunité.

Première tranche développée : éditeur interactif, données client versionnées, comparaison A/B, projection partielle de l’arme, import/connexion de l’historique et des métadonnées, calibration personnelle quand les données le permettent, analyse descriptive des parties. Le modèle combat complet et le diagnostic tactique approfondi demanderont des itérations et des vérifications dans le jeu.

Les études et sources initiales sont conservées dans `docs/recherche/`. Les fonctionnalités souhaitées et la couverture réellement livrée doivent rester distinctes dans la documentation.

Direction visuelle confirmée le 29 octobre 2026 : reprendre les codes de la boutique/builds et des statistiques de fin de partie de Deadlock. Donner la priorité aux objets, icônes, courbes, chronologies et comparaisons graphiques. Retirer les slogans et les paragraphes qui expliquent des précautions méthodologiques dans le parcours principal ; conserver les informations indispensables sous forme compacte et les détails accessibles à la demande. Les références et choix sont consignés dans `docs/DA.md`.

Itération review du 29 octobre 2026 : quatre chapitres libres, calcul en arrière-plan, comparaison personnelle prudente, épisodes avec positions observées et preuves horodatées, audit des achats sans informations futures, puis part économique collective. Les trois premières priorités restent immédiatement visibles ; les explications longues sont hors du parcours principal. [REVIEW.md](REVIEW.md) décrit exactement ce qui est calculé. Les propositions d’erreur tactique restent conditionnées aux preuves disponibles.
