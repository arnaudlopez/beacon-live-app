# Déploiement Docker pour Beacon Live

Beacon Live peut maintenant tourner en deux conteneurs locaux :

- `beacon-live` : frontend React/Vite servi par Nginx.
- `weather-api` : backend realtime Node qui expose `/api/weather`, `/api/events` et `/api/health`.

Le frontend est compilé avec `VITE_WEATHER_BACKEND_URL=/api`, puis Nginx proxyfie `/api/*` vers `weather-api:8787`. Supabase reste disponible comme fallback si cette variable n'est pas définie dans un autre build.

## Prérequis

1. Docker et Docker Compose.
2. Les variables publiques Supabase si vous voulez conserver le fallback existant.
3. Aucun secret météo n'est requis pour le mode demo local.

## Variables

Exemple `.env` :

```bash
VITE_SUPABASE_URL=https://rnjtvepcoxvzlwrulnks.supabase.co
VITE_SUPABASE_ANON_KEY=VOTRE_CLE_ANON_SUPABASE
VITE_WEATHER_BACKEND_URL=/api

WEATHER_SOURCE_MODE=real
WEATHER_POLL_MS=20000
WEATHER_HEARTBEAT_MS=15000
METEOFRANCE_KEY=VOTRE_CLE_METEOFRANCE
WINDSUP_USER=VOTRE_LOGIN_WINDSUP
WINDSUP_PASS=VOTRE_MOT_DE_PASSE_WINDSUP
WUNDERGROUND_API_KEY=
```

`WEATHER_SOURCE_MODE=real` active les adaptateurs météo Node côté `weather-api`.

Variables à ajouter dans Portainer :

- `VITE_WEATHER_BACKEND_URL=/api`
- `WEATHER_SOURCE_MODE=real`
- `WEATHER_POLL_MS=20000`
- `WEATHER_HEARTBEAT_MS=15000`
- `METEOFRANCE_KEY`
- `WINDSUP_USER`
- `WINDSUP_PASS`
- `WUNDERGROUND_API_KEY` optionnel, le backend garde une clé de compatibilité serveur si cette variable est vide.

`WEATHER_POLL_MS=20000` donne un polling backend toutes les 20 secondes pour les sources rapides. Les adaptateurs lents gardent un intervalle plus long côté serveur. Ne descendez pas sous la fréquence de publication réelle de l'amont.

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
