# Comptes Steam et parties manquantes

## Parcours du joueur

**Mon compte → Se connecter avec Steam** identifie le compte sur le domaine de Steam. L'identifiant ou l'URL numérique du profil restent utilisables sans connexion. Aucun mot de passe, Steam Guard, cookie de session Steam, jeton de renouvellement ou liste d'amis n'est demandé par l'Atelier.

**Mes parties → Synchroniser** ouvre le diagnostic : date de la dernière partie disponible, provenance de l'historique, date de sa vérification et nombre de parties dont les relevés statistiques ont été chargés. **Actualiser** relit la source disponible. La connexion Steam ne débloque pas les replays : Steam OpenID ne fournit que le SteamID64. Le fournisseur peut renvoyer uniquement sa base communautaire même après une demande de relecture complète. Le libellé « Steam consulté » indique l'en-tête `Called-Steam: true`, pas une garantie que toutes les requêtes internes du fournisseur ont réussi.

Pour récupérer les parties absentes :

1. Ouvrir les détails de ces parties dans Deadlock pour alimenter le cache des téléchargements Steam.
2. Dans **Parties manquantes**, choisir le dossier `Steam/appcache/httpcache`. Sous Windows, son emplacement courant est `C:\Program Files (x86)\Steam\appcache\httpcache` ; il peut différer selon l'installation de Steam.
3. Vérifier les numéros de parties et envoyer les références choisies. Le cache peut contenir aussi des parties regardées. Au plus 20 références sont sélectionnées par envoi dans l'interface.
4. Les détails disponibles du joueur sont importés immédiatement, une partie à la fois. **Collecte en attente** signifie que le fournisseur n'a pas encore publié les métadonnées ; **Vérifier les détails** réessaie leur lecture sans nouvel envoi ni récupération Steam payant un quota. Les métadonnées d'une partie ne contenant pas le compte sélectionné ne sont pas ajoutées à son historique.

L'acceptation des références ne prouve ni la disponibilité du replay chez Valve ni la réussite future de la collecte. Aucun délai n'est inventé. Une partie chargée conserve ses détails même si une vérification suivante échoue ou si la fenêtre est fermée. Aucun sondage permanent n'est lancé.

Le lien **Collecte automatique** ouvre les options du fournisseur. L'Atelier n'installe aucun compagnon, ne lit pas la mémoire du jeu ou les sessions Steam enregistrées et ne change pas les options de lancement de Deadlock.

## Lecture locale du cache

Le sélecteur de dossier est une permission du navigateur limitée au dossier choisi. Le parseur lit seulement les 512 premiers octets de chaque fichier, avec au plus 16 lectures simultanées et 20 000 fichiers. Le collecteur officiel lit lui-même un en-tête de 200 octets pour identifier les URL de téléchargement.

Seules les URL de forme `replay<cluster>.valve.net/1422450/<match>_<salt>.meta.bz2` et `.dem.bz2` sont reconnues. Autres jeux, hôtes, nombres invalides et références contradictoires sont ignorés. Les téléchargements répétés sont dédupliqués par partie et cluster ; une référence de métadonnées est nécessaire à la sélection. Les chemins, noms, octets des fichiers, cookies et autres URL ne sont jamais envoyés. Les références ne sont transmises qu'au clic sur **Envoyer**. Les originaux restent sur l'ordinateur.

`POST /api/matches/cache` accepte au plus 100 petits objets numériques et 64 Ko de JSON. Les propriétés supplémentaires sont refusées. Le serveur ajoute un libellé d'application constant et transmet uniquement ces références à `https://api.deadlock-api.com/v1/matches/salts`. Un verrou, un délai entre envois, une limite de temps et le contrôle d'origine bornent ce relais. Il ne télécharge aucune URL fournie par le navigateur.

## Authentification et déploiement

Le serveur utilise le protocole Steam OpenID 2.0 avec un état aléatoire lié à un cookie `HttpOnly; SameSite=Lax`, valide pendant dix minutes. Il vérifie le domaine du fournisseur, le `return_to` exact, les champs signés, l'identité, la fraîcheur du nonce, les paramètres dupliqués et la confirmation directe de Steam via `check_authentication`. Un callback ne peut être consommé qu'une fois. Le résultat est un court transfert d'identifiant, pas une session autorisant l'accès à des données privées.

Sur `http://localhost:5173` ou `http://127.0.0.1:5173`, aucune configuration n'est nécessaire. En déploiement, renseigner `APP_ORIGIN=https://votre-domaine.example` dans l'environnement du serveur. Le cookie utilise alors `Secure`. Les en-têtes de proxy arbitraires ne déterminent pas l'adresse de retour. L'état temporaire est conservé en mémoire du processus : un déploiement multi-instance doit assurer l'affinité des requêtes de connexion.

L'API exige des sorties HTTPS vers `api.deadlock-api.com` et la vérification OpenID vers `steamcommunity.com`. Les clés éventuelles restent exclusivement sur le serveur. Le cache local de l'historique dure 30 secondes ; les autres réponses conservent dix minutes. Un historique utilisable renvoyé par le fournisseur avec un statut 429 est conservé et signalé comme limité. Un objet d'erreur 429 n'est pas converti en historique. Les importations et le stockage prennent désormais en charge jusqu'à 5 000 entrées, au lieu de refuser les comptes dépassant 500 parties.

## Sources et vérification du 29 octobre 2026

- [Steam OpenID officiel](https://steamcommunity.com/dev) : l'identité retournée contient uniquement le SteamID64.
- [Historique du fournisseur](https://github.com/deadlock-api/deadlock-api/blob/6ae14d68df267f3a8f2d26469fbe9397cd32f926/api/src/routes/v1/players/match_history.rs) : les comptes amis d'un bot peuvent combiner Steam et ClickHouse ; les autres reçoivent uniquement les lignes stockées. L'en-tête `Called-Steam` et le retour de secours sous statut 429 sont explicites.
- [Collecteur officiel](https://github.com/deadlock-api/deadlock-api-ingest/blob/49dbf67b93fce1e2dfcf8557d4b5fbae760e54a4/src/scan_cache.rs) : format des URL et en-têtes du cache Steam.
- [Envoi des références](https://github.com/deadlock-api/deadlock-api/blob/6ae14d68df267f3a8f2d26469fbe9397cd32f926/api/src/routes/v1/matches/ingest_salts.rs) : accusé d'acceptation distinct de la collecte des métadonnées.

Le compte fourni a été vérifié en lecture : le fournisseur renvoyait toujours 332 parties, la dernière le 25 octobre à 15 h 59, heure de Paris, `Called-Steam: false`, et aucun upload de cache vérifié dans les quatorze derniers jours. Les données personnelles et captures non anonymisées restent hors du dépôt. Aucun cache personnel n'a été envoyé pendant le développement.

Les tests couvrent le protocole OpenID avec un fournisseur simulé, les rejets de callbacks falsifiés, le parseur binaire, la frontière d'envoi, les quotas et le parcours navigateur jusqu'à l'import et la sauvegarde. Une connexion complète au compte du joueur nécessite son interaction avec Steam ; aucun identifiant de connexion n'a été utilisé ici.
