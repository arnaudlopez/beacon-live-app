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

ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY


# Construire l'application pour la production (génère le dossier /dist)
RUN npm run build

# Étape 2 : Serveur web (Nginx) pour servir les fichiers statiques
FROM nginx:alpine

# Copier la configuration Nginx
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copier les fichiers buildés depuis l'étape 1
COPY --from=build /app/dist /usr/share/nginx/html

# Exposer le port HTTP
EXPOSE 80

# Démarrer Nginx (pas besoin d'entrypoint custom)
CMD ["nginx", "-g", "daemon off;"]
