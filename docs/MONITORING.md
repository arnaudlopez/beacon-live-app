# Monitoring backend Beacon Live

Le monitoring utilise deux canaux indépendants :

- **Sentry** collecte et regroupe les bugs, erreurs fournisseur récurrentes et récupérations.
- **Un moniteur externe** (Better Stack recommandé) vérifie l'API depuis Internet et attend un heartbeat du scheduler.

Le backend n'envoie pas directement d'email. Sentry et Better Stack restent capables d'alerter quand Node, Docker ou `home101` ne répond plus.

## Variables Portainer

```env
APP_ENV=production
APP_RELEASE=SHA_DU_COMMIT_DEPLOYE
SENTRY_DSN=https://...@...ingest....sentry.io/...
MONITOR_HEARTBEAT_URL=https://uptime.betterstack.com/api/v1/heartbeat/...
MONITOR_HEARTBEAT_INTERVAL_MS=60000
WEATHER_READY_MAX_AGE_MS=300000
```

`SENTRY_DSN` et `MONITOR_HEARTBEAT_URL` sont des secrets serveur. Ils ne doivent jamais être préfixés par `VITE_` ni être copiés dans le frontend.

## Sentry

1. Créer un projet Node.js nommé `beacon-live-backend`.
2. Copier le DSN dans `SENTRY_DSN`.
3. Activer les notifications email du projet.
4. Créer un workflow pour les nouvelles issues et les régressions, priorité moyenne ou haute.
5. Créer un second workflow de fréquence pour une issue récurrente.

Le backend applique déjà ces règles anti-bruit :

- bug inattendu : signalé dès la première occurrence ;
- erreur fournisseur attendue : signalée au 3e échec consécutif ;
- incident persistant : rappel toutes les 30 occurrences ;
- mesure ancienne ou indisponible : rappel au maximum toutes les 6 heures par source ;
- récupération : signalée seulement si l'incident avait atteint 3 échecs.

Les fingerprints incluent le type d'incident, la source et le code d'erreur. Les clés API, tokens, cookies, mots de passe et URLs sensibles sont filtrés avant envoi.

## Better Stack

Créer les contrôles suivants :

1. Moniteur HTTP `Beacon Live ready` sur `https://ajaccio.surf/api/health/ready`.
   - fréquence : 3 minutes ;
   - succès attendu : HTTP 200 ;
   - confirmation : 2 échecs consécutifs ;
   - email activé.
2. Moniteur HTTP `Beacon Live live` sur `https://ajaccio.surf/api/health/live`.
   - fréquence : 3 minutes ;
   - il distingue un processus mort d'un scheduler bloqué.
3. Heartbeat `Beacon weather scheduler`.
   - attendu toutes les 2 minutes ;
   - grâce : 3 minutes ;
   - copier son URL secrète dans `MONITOR_HEARTBEAT_URL`.

## Contrats HTTP

- `/api/health/live` : HTTP 200 tant que le processus Node répond.
- `/api/health/ready` : HTTP 503 si aucun cycle scheduler récent ou si aucune donnée utilisable n'est disponible.
- `/api/health/providers` : HTTP 200 avec état détaillé `healthy`, `stale`, `unavailable` ou `error` par source.
- `/api/health` : contrat historique enrichi avec `checkedAt`, `sentryConfigured` et `heartbeatConfigured`.

Une source fournisseur dégradée ne rend pas toute l'application indisponible. Elle apparaît dans `/providers` et déclenche une issue Sentry dédiée.

## Smoke après déploiement

```bash
docker exec beacon-live-weather-api npm run monitoring:smoke
```

Le résultat ne doit contenir aucun secret et doit indiquer :

```json
{
  "sentryConfigured": true,
  "heartbeatConfigured": true,
  "heartbeat": { "sent": true }
}
```

Vérifier ensuite :

- réception de l'issue `Beacon Live monitoring smoke test` dans Sentry et par email ;
- heartbeat vert dans Better Stack ;
- `/api/health/ready` en HTTP 200 ;
- compteur de redémarrages Docker stable.

## Runbook incident

1. Consulter le fingerprint, la source, la release et la stack trace dans Sentry.
2. Comparer `lastAttemptAt` et `lastObservedAt` dans `/api/health/providers`.
3. Vérifier les logs bornés : `docker logs --since 30m beacon-live-weather-api`.
4. Corriger et déployer avec un nouvel `APP_RELEASE`.
5. Confirmer le retour de `/ready`, le heartbeat et l'événement de récupération.
