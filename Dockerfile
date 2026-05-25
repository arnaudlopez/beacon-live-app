# Étape 1 : Construction de l'application (Build)
FROM node:20-alpine AS build

WORKDIR /app

# Copier les fichiers de dépendances
COPY package*.json ./

# Installer les dépendances 
# (npm ci est plus propre pour la prod, mais on fallback sur npm install si pas de package-lock)
RUN npm ci --legacy-peer-deps || npm install --legacy-peer-deps

# Copier le reste du code
COPY . .

# Définir les variables d'environnement nécessaires au build de Vite (elles seront "cuites" dans le code HTML/JS)
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_WEATHER_BACKEND_URL

ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
ENV VITE_WEATHER_BACKEND_URL=$VITE_WEATHER_BACKEND_URL


# Construire l'application pour la production (génère le dossier /dist)
RUN npm run build

# Étape API : backend realtime local sans secrets externes obligatoires
FROM node:20-alpine AS weather-api

WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8787
ENV WEATHER_STORE_PATH=/data/weather-state.json
ENV WEATHER_POLL_MS=20000
ENV WEATHER_HEARTBEAT_MS=15000

COPY package*.json ./
RUN npm ci --omit=dev --legacy-peer-deps || npm install --omit=dev --legacy-peer-deps

COPY server ./server

EXPOSE 8787
CMD ["node", "server/realtime/server.js"]

# Étape 2 : Serveur web (Nginx) pour servir les fichiers statiques
FROM nginx:alpine AS frontend

# Copier la configuration Nginx
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copier les fichiers buildés depuis l'étape 1
COPY --from=build /app/dist /usr/share/nginx/html

# Exposer le port HTTP
EXPOSE 80

# Démarrer Nginx (pas besoin d'entrypoint custom)
CMD ["nginx", "-g", "daemon off;"]
