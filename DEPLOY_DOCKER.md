# Déploiement Docker pour Beacon Live

Beacon Live peut maintenant tourner en deux conteneurs locaux :

- `beacon-live` : frontend React/Vite servi par Nginx.
- `weather-api` : backend realtime Node qui expose `/api/weather`, `/api/events` et `/api/health`.

Le frontend est compilé avec `VITE_WEATHER_BACKEND_URL=/api`, puis Nginx proxyfie `/api/*` vers `weather-api:8787`.

## Prérequis

1. Docker et Docker Compose.
2. Aucun secret météo n'est requis pour le mode demo local.

## Variables

Exemple `.env` :

```bash
VITE_WEATHER_BACKEND_URL=/api

WEATHER_SOURCE_MODE=real
WEATHER_POLL_MS=20000
WEATHER_HEARTBEAT_MS=15000
WEATHER_REQUEST_TIMEOUT_MS=15000
WEATHER_DISABLED_SOURCE_IDS=wunderground_ISARTN1
METEOFRANCE_KEY=VOTRE_CLE_METEOFRANCE
WINDSUP_PREMIUM_ENABLED=false
WINDSUP_USER=
WINDSUP_PASS=
WUNDERGROUND_API_KEY=
VAPID_PUBLIC_KEY=VOTRE_CLE_PUBLIQUE_VAPID
VAPID_PRIVATE_KEY=VOTRE_CLE_PRIVEE_VAPID
VAPID_SUBJECT=mailto:admin@votre-domaine.fr
APP_ENV=production
APP_RELEASE=SHA_DU_COMMIT_DEPLOYE
SENTRY_DSN=DSN_DU_PROJET_SENTRY_NODE
MONITOR_HEARTBEAT_URL=URL_SECRETE_DU_HEARTBEAT
MONITOR_HEARTBEAT_INTERVAL_MS=60000
WEATHER_READY_MAX_AGE_MS=300000
```

`WEATHER_SOURCE_MODE=real` active les adaptateurs météo Node côté `weather-api`.

Par défaut, les relevés WindsUp publics, décalés de deux heures par le fournisseur, sont lus directement depuis les pages des spots. Aucun identifiant WindsUp n'est nécessaire dans ce mode.

Pour réactiver les relevés premium en temps réel, configurez le compte dans Portainer puis redéployez :

```env
WINDSUP_PREMIUM_ENABLED=true
WINDSUP_USER=VOTRE_LOGIN_WINDSUP
WINDSUP_PASS=VOTRE_MOT_DE_PASSE_WINDSUP
```

Le backend partage une seule session premium entre tous les spots. Si la connexion premium expire ou échoue, il repasse automatiquement sur les relevés publics et limite les nouvelles tentatives de connexion.

Variables à ajouter dans Portainer :

- `VITE_WEATHER_BACKEND_URL=/api`
- `WEATHER_SOURCE_MODE=real`
- `WEATHER_POLL_MS=20000`
- `WEATHER_HEARTBEAT_MS=15000`
- `WEATHER_REQUEST_TIMEOUT_MS=15000`
- `METEOFRANCE_KEY`
- `WINDSUP_PREMIUM_ENABLED=false` pour les relevés publics décalés, `true` pour le temps réel premium
- `WINDSUP_USER` et `WINDSUP_PASS` lorsque le mode premium est activé
- `WUNDERGROUND_API_KEY` optionnel, le backend garde une clé de compatibilité serveur si cette variable est vide.
- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT` (une URL `mailto:` ou HTTPS permettant de contacter l'administrateur)
- `APP_ENV=production`
- `APP_RELEASE` (SHA du commit Git déployé)
- `SENTRY_DSN` (projet Sentry Node.js, secret serveur)
- `MONITOR_HEARTBEAT_URL` (heartbeat externe Better Stack ou compatible)
- `MONITOR_HEARTBEAT_INTERVAL_MS=60000`
- `WEATHER_READY_MAX_AGE_MS=300000`

La procédure complète de monitoring, les règles anti-spam et le runbook sont documentés dans [`docs/MONITORING.md`](docs/MONITORING.md).

## Activer les notifications lorsque la PWA est fermée

Générez une seule fois une paire de clés VAPID :

```bash
npx web-push generate-vapid-keys
```

Conservez la clé privée comme un secret et renseignez les trois variables VAPID dans `.env` ou Portainer. Les clés doivent rester stables : les changer invalide les abonnements Push existants.

Le site public doit être servi en HTTPS (hors `localhost`). Sur iPhone et iPad, il faut ajouter la PWA à l'écran d'accueil avant d'activer une alerte. L'appareil doit ouvrir la PWA et accepter l'autorisation une première fois ; les alertes suivantes arrivent même si la PWA est fermée.

Après déploiement, vérifiez l'activation côté serveur :

```bash
curl https://votre-domaine.fr/api/push/public-key
curl https://votre-domaine.fr/api/health
```

La première réponse doit contenir `"configured":true` et la seconde `"pushConfigured":true`.

`WEATHER_POLL_MS=20000` donne un polling backend toutes les 20 secondes pour les sources rapides. Les adaptateurs lents gardent un intervalle plus long côté serveur. Ne descendez pas sous la fréquence de publication réelle de l'amont.

`WEATHER_REQUEST_TIMEOUT_MS=15000` borne chaque requête fournisseur. Une réponse lente, vide ou invalide marque uniquement la source concernée en erreur ; le scheduler conserve la dernière bonne mesure et poursuit les autres sources.

Pour un smoke sans credentials, utilisez temporairement :

```bash
WEATHER_SOURCE_MODE=demo
```

## Lancer en local

```bash
docker compose up --build
```

L'application est accessible sur `http://localhost:9888`.

Smoke checks :

```bash
curl http://localhost:9888/api/health
curl http://localhost:9888/api/weather
```

Le flux SSE passe aussi par le même proxy :

```bash
curl -N http://localhost:9888/api/events
```

## Persistance

Le service `weather-api` écrit son état dans le volume Docker `weather-data`, au chemin :

```bash
/data/weather-state.json
```

Ce fichier contient le dernier snapshot, les observations reçues et l'état de santé des sources. Il permet au backend de repartir avec une donnée visible après redémarrage.

Les abonnements Push, leurs seuils et les cooldowns sont persistés séparément dans le même volume :

```bash
/data/push-state.json
```

Ce fichier contient des endpoints et clés d'abonnement propres aux appareils : ne le publiez pas et protégez les sauvegardes du volume.

Pour éviter une croissance sans limite, `weather-api` ne conserve que les dernières observations dans ce fichier. La limite par défaut est :

```env
WEATHER_MAX_OBSERVATIONS=500
```

Les logs Docker des deux services sont aussi bornés par rotation (`10m` x `3` fichiers par conteneur).

## Architecture Docker

Le `Dockerfile` fournit deux targets :

1. `frontend` : build Vite puis image Nginx statique.
2. `weather-api` : runtime Node qui démarre `node server/realtime/server.js`.

Le `docker-compose.yml` démarre les deux services sur le même réseau Compose. Nginx garde l'entrée publique unique et route `/api/*` vers `weather-api`.

## Arrêt et nettoyage

```bash
docker compose down
```

Pour supprimer aussi l'historique local :

```bash
docker compose down -v
```

Après plusieurs redeploys Portainer, Docker peut garder d'anciennes images et du cache de build. À faire ponctuellement depuis le serveur si l'espace disque baisse :

```bash
docker system prune -af
docker builder prune -af
```
