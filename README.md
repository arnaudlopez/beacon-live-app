# 🏄 Beacon Live

**Beacon Live** est une Progressive Web App (PWA) de télémétrie maritime en temps réel, conçue spécifiquement pour les surfeurs et les passionnés de la mer en Corse (La Revellata, Ajaccio, Bonifacio).

L'application agrège intelligemment les données de plusieurs bouées météorologiques et océanographiques, et les présente dans un tableau de bord moderne, rapide et mobile-first, avec un design "Glassmorphism" dynamique inspiré des couleurs de l'océan.

![PWA Ready](https://img.shields.io/badge/PWA-Ready-10b981?style=for-the-badge&logo=pwa)
![React](https://img.shields.io/badge/React-19-61dafb?style=for-the-badge&logo=react)
![Vite](https://img.shields.io/badge/Vite-8-646cff?style=for-the-badge&logo=vite)
![Supabase](https://img.shields.io/badge/Supabase-Edge_Functions-3ecf8e?style=for-the-badge&logo=supabase)

## ✨ Fonctionnalités clés

- 🌊 **Rapport Météo-Surf Intelligent** : Croise les données de houle (hauteur, période, direction, *étalement spectral exclusif*) et les rafales de vent côtier pour générer un rapport textuel dynamique (détection automatique Offshore / Onshore / Cross-shore). 
- ⏱️ **Estimation des Séries (Sets)** : Calcul physique via les groupes de vagues pour prédire la période d'attente entre deux séries et le nombre de vagues par série.
- 📡 **Agrégation Multi-Sources en Temps Réel** :
  - **Météo-France** (Stations vent de La Parata & Campo dell'Oro)
  - **CANDHIS** (Bouées houlographes La Revellata & Bonifacio)
  - **Pioupiou** (Balise anémomètre Capo di Feno)
  - **eSurfmar** (Données satellites/bouées au large MSG)
- 🚀 **Architecture "Server-Cache" Anti-Ban** : Les navigateurs des utilisateurs ne contactent plus directement les API externes. Supabase gère un cache proxy intelligent avec Edge Functions toutes les 6 minutes (bypass des limites de taux API Météo-France et erreurs CORS).
- 🗺️ **Carte Interactive Vectorielle** : Visualisation dynamique de la houle via des animations de lignes de vagues décalées géographiquement sur la mer.
- 🐳 **Prêt pour le Web et Docker** : Application multi-stage (Node + Nginx Alpine) pour un déploiement autonome et optimal en production.

## 🛠️ Stack Technique

- **Frontend** : React 19, Vite 8, Lucide React (Icônes UI)
- **Cartographie** : Leaflet & React-Leaflet v5 (Fonds de carte hybrides / satellites)
- **Graphiques** : Recharts (Historiques de vent et températures sur 24h)
- **PWA** : Vite PWA Plugin (Service workers optimisés pour mode Hors-Ligne)
- **Backend / Proxy** : Supabase (PostgreSQL statique + Deno Edge Functions)
- **Déploiement** : Docker / Nginx

## 🚀 Démarrage Rapide (Développement)

```bash
# 1. Cloner le repo
git clone https://github.com/VOTRE_COMPTE/beacon-live.git
cd beacon-live

# 2. Installer les dépendances
npm install

# 3. Variables d'environnement
# Créer un fichier .env à la racine
VITE_SUPABASE_URL="https://votre-compte.supabase.co"
VITE_SUPABASE_ANON_KEY="votre_cle_anon_publique"

# 4. Lancer le serveur local
npm run dev
```

## 🐳 Déploiement Docker (Production)

Pour toutes les instructions de déploiement sécurisé en production via conteneur, veuillez consulter le fichier dédié : [DEPLOY_DOCKER.md](./DEPLOY_DOCKER.md).

## 📄 Licence
Ce projet est libre et open-source. Vous pouvez le modifier, le distribuer et l'utiliser librement pour vérifier vos conditions de vent avant d'aller à l'eau 🤙.
