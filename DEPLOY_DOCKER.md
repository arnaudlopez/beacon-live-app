# Déploiement Docker pour Beacon Live

L'application **Beacon Live** est une Single Page Application (Vite + React) préparée pour un déploiement optimisé via Docker (Multi-stage build).

## Pré-requis

1. Avoir **Docker** installé sur le serveur cible.
2. Avoir les variables d'environnement Supabase publiques. (Elles sont injectées au build pour que le JS puisse interroger l'Edge Function).

## 1. Construire l'image Docker

Placez-vous à la racine du projet et lancez le build.  
⚠️ **Important** : Vous devez passer l'URL et la clé anonyme de Supabase en `build-arg` puisque l'application statique a besoin de ces valeurs pour être compilées dans le JavaScript.

```bash
docker build \
  --build-arg VITE_SUPABASE_URL="https://rnjtvepcoxvzlwrulnks.supabase.co" \
  --build-arg VITE_SUPABASE_ANON_KEY="VOTRE_CLE_ANON_SUPABASE" \
  -t beacon-live-app:latest .
```

*Note: Remplacez `VOTRE_CLE_ANON_SUPABASE` par la vraie valeur présente dans votre fichier `.env`.*

## 2. Lancer le conteneur

Une fois l'image construite, lancez le serveur Nginx avec cette commande. (Ici on expose l'application sur le port `8080`, mais vous pouvez choisir le port 80).

```bash
docker run -d -p 8080:80 --name beacon-live beacon-live-app:latest
```

L'application est maintenant accessible sur `http://localhost:8080`.

## Architecture du Dockerfile

Le `Dockerfile` utilise un **Multi-stage build** :
1. **Étape `build`** : Utilise `node:20-alpine` pour télécharger les dépendances et exécuter `npm run build`. Cette étape génère les fichiers HTML/JS/CSS minifiés mais n'est pas conservée dans l'image finale.
2. **Étape `production`** : Utilise `nginx:alpine` (très léger, ~20 Mo), copie les fichiers générés à l'étape 1, et ajoute un `nginx.conf` optimisé pour les SPA (gestion du routage côté client, fallback sur `index.html`, compression gzip et cache navigateur d'un an sur les assets statiques).

## Nettoyage

Si vous souhaitez arrêter et supprimer le conteneur :
```bash
docker stop beacon-live
docker rm beacon-live
```
