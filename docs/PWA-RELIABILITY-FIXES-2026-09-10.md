# Corrections de fiabilité — 10 septembre 2026

Les problèmes de l'[audit](./AUDIT-PWA-2026-09-10.md) ont été traités dans le code local. Aucun déploiement de production effectué.

## Comportement après correction

- HTTP et SSE démarrent indépendamment. Une requête HTTP bloquée n'empêche plus le temps réel ; elle est annulée après 12 secondes.
- Au retour visible, à `pageshow` ou au retour réseau : resynchronisation immédiate dédupliquée. Les connexions et requêtes sont fermées/annulées lorsque la page est cachée ou hors ligne.
- Reconnexion SSE progressive de 1 à 30 secondes avec aléa ; surveillance des heartbeats, reconnexion si le flux reste silencieux plus de 45 secondes. Polling HTTP toutes les 60 secondes uniquement en absence de flux sain.
- Les réponses HTTP dépassées et leurs erreurs sont ignorées après une mise à jour plus récente. Le serveur fournit un identifiant de session et une révision croissante, y compris pour les changements de santé des sources.
- Le dernier snapshot valide est conservé dans localStorage, par URL backend, pendant au maximum 48 heures depuis son enregistrement. Son affichage indique qu'il provient du stockage local ; sa date n'est pas remplacée par la date de reconnexion. Le stockage plein ou inaccessible ne bloque pas l'application.
- Le bandeau distingue connexion, temps réel, actualisation périodique, reconnexion, pause et hors ligne. Un bouton permet de relancer une actualisation. L'âge des observations et la difficulté d'une station sont signalés séparément de l'état réseau.
- Les contrôles d'alerte sont bloqués pendant une opération pour éviter les doubles activations. Une panne de configuration Push reste un état inconnu et récupérable, avec nouvelle vérification au retour réseau/visible et chaque minute au premier plan.
- La désactivation vérifie toujours l'abonnement de l'appareil, même après un échec de lecture de configuration. Si la suppression ou la mise à jour serveur échoue, ON est conservé et l'interface explique que la désactivation n'est pas confirmée.
- Les notifications locales ne fonctionnent que lorsque l'absence de Push est confirmée. L'interface le précise. La confirmation visuelle d'une activation ne peut plus transformer un abonnement réussi en échec apparent.
- Les alertes locales et serveur excluent les mesures sans date, futures de plus d'une minute, vieilles de plus de **30 minutes**, ou marquées en erreur. Les mesures plus anciennes peuvent rester consultables, mais ne déclenchent pas d'alerte. Cela concerne notamment les fournisseurs qui diffusent avec un décalage de deux heures.
- Le backend supprime les données dépassant 48 heures même lorsque la source échoue continuellement. Une observation dont les valeurs sont identiques mais dont la date avance est bien actualisée.
- Jusqu'à trois sources sont interrogées simultanément. Les résultats sont publiés sans attendre les fournisseurs lents. Les écritures du store fichier sont sérialisées et les envois Push concurrents sont regroupés pour éviter les doublons et l'accumulation de notifications.
- Les abonnements Push acceptent les services Google FCM, Mozilla en production, Apple et Windows, avec validation HTTPS et des clés cryptographiques. Limite de 1 000 abonnements et de 32 alertes par inscription ; délai d'envoi Push de 5 secondes ; limitation des mutations dans l'API et par adresse côté Nginx.
- Les en-têtes de sécurité sont inclus explicitement dans les locations Nginx. Les API sont exclues du fallback de navigation PWA. Le contrôle des mises à jour du service worker reprend au retour visible/réseau.
- Les graphiques sont chargés séparément : le bundle d'entrée passe d'environ 597 kB à 229 kB minifié (178 à 73 kB gzip). Le poids total de l'application reste proche de l'ancien ; le gain concerne le chargement initial. La hauteur du panneau d'historique s'adapte au contenu pour éviter le débordement du graphique de direction sur mobile.
- Les copies de travail, données et sorties de navigateur sont exclues du lint/build Docker lorsqu'approprié. Le lint global redevient exploitable.

## Validation

- 246 tests réussis dans 27 fichiers, dont 24 nouveaux cas de régression.
- ESLint global et contrôle des espaces du diff réussis.
- Build de production et builds Docker des deux cibles frontend/API réussis.
- Vérification de syntaxe Nginx et des en-têtes HTTP réellement servis.
- Essais dans Chromium, avec backend de démonstration et Nginx locaux : fonctionnement en ligne, coupure réseau, rechargement de la PWA sans réseau avec conservation des mesures, retour réseau et reconnexion après redémarrage du conteneur API.
- Vérification à largeur mobile : aucun débordement horizontal. Les erreurs réseau de console pendant une coupure simulée sont attendues ; elles ne sont pas présentées comme une erreur technique brute dans l'interface.
- Les transitions de visibilité, les requêtes retardées, les timeouts et les réponses hors ordre sont également couverts par les tests automatisés.

Aucun vrai abonnement Push ni envoi de notification effectué pendant la validation. Les tests utilisent des expéditeurs simulés et les conteneurs de démonstration n'ont pas de clés VAPID. La validation sur une PWA installée sur un iPhone/Android physique, ainsi que le comportement du proxy de production, restent à réaliser après déploiement.

## Exploitation

La configuration Docker standard utilise `VITE_WEATHER_BACKEND_URL=/api`. La CSP autorise les connexions de même origine ; un backend d'une autre origine nécessite une adaptation explicite de `nginx-security-headers.conf` et de la politique des mutations Push.

Les diagnostics de connexion sont conservés uniquement dans le sessionStorage du navigateur, sous `beacon_connection_diagnostics_v1`, avec un maximum de 50 événements. Ils contiennent dates, types d'événements, visibilité, disponibilité réseau et durées ; aucune mesure météo, clé ni URL d'abonnement. Aucun envoi de télémétrie externe n'a été ajouté.

Les changements introduisent le dossier `shared/` et le fichier `nginx-security-headers.conf`, inclus par le Dockerfile. Il faut reconstruire **les deux services** lors du déploiement. Les snapshots déjà persistés restent lisibles ; le nouveau serveur émet ses révisions à partir d'une nouvelle session.

## Ajustement UX après retour utilisateur

Les vérifications automatiques des alertes et la restauration du cache s'effectuent sans bandeau. Le statut réseau et la date des données restent discrets en bas de page ; une interruption temporaire n'ajoute pas de message d'erreur si des mesures sont déjà affichées. Les échecs d'activation/désactivation restent visibles, ainsi que la restriction des alertes locales lorsqu'une alerte est effectivement activée. Le libellé de connexion a été simplifié et l'indicateur redondant « Données reçues » retiré.

Le premier chargement est également silencieux en cas de coupure : tant qu’aucune mesure n’est disponible, la zone météo affiche un état vide neutre. Les erreurs de transport ne sont plus relayées en bandeau, même sans cache. Trois tests du tableau de bord couvrent ce cas, la conservation des mesures et les erreurs liées à une action sur les alertes.
