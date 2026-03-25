# Production Deployment & Custom Domain

L'application **Beacon Live** est désormais "Production-Ready", architecturée autour de Supabase (Backend/Cache) et de Docker (Frontend/Proxy).

## 1. Architecture Actuelle

1. **Client PWA (Docker/Nginx)** : Sert les fichiers statiques React et agit comme un Reverse Proxy privé pour contourner le blocage IP d'Infoclimat (`/api/infoclimat/`).
2. **Supabase Edge Function (`weather-cache`)** : Centralise, met en cache (6 minutes), et unifie les données de Météo-France, Pioupiou, eSurfmar et CANDHIS. Protège la clé d'API Météo-France en tant que secret serveur.

## 2. Configuration du Domaine (`ajaccio.surf`)

Puisque le domaine a été acheté sur Namecheap, la configuration nécessite deux étapes clés : le pontage DNS, et la gestion du SSL (HTTPS) via un routeur sur votre noeud Portainer.

### Étape A : DNS Namecheap
Dans le tableau de bord Namecheap (Advanced DNS), supprimez les enregistrements de parking par défaut et ajoutez :
### Étape B : Nginx Proxy Manager (Portainer)
Pour sécuriser `ajaccio.surf` avec un certificat SSL Let's Encrypt (obligatoire pour installer une PWA sur iOS/Android), la méthode la plus fiable sous Portainer est de déployer **Nginx Proxy Manager** (NPM). 

> **Important** : Si votre serveur tourne sous Synology DSM ou Unraid, les ports 80 et 443 sont souvent déjà utilisés par le système. Il faut donc déployer NPM sur des ports alternatifs (ex: 8080 et 4443) et faire une redirection depuis votre routeur/box internet (`Port 443 WAN` -> `Port 4443 NAS`).

Si NPM n'est pas encore installé sur votre serveur, voici la Stack à déployer **séparément** dans Portainer :

```yaml
version: '3.8'
services:
  npm:
    image: 'jc21/nginx-proxy-manager:latest'
    restart: unless-stopped
    ports:
      - '8080:80'    # Port HTTP alternatif pour éviter les conflits
      - '4443:443'   # Port HTTPS alternatif pour éviter les conflits
      - '81:81'      # Panel d'administration
    volumes:
      - ./data:/data
      - ./letsencrypt:/etc/letsencrypt
```

**Une fois Nginx Proxy Manager installé :**
1. Accédez au panel admin de NPM (`http://<YOUR_SERVER_IP>:81`). Logs par défaut : `admin@example.com` / `changeme`.
2. Allez dans **Hosts > Proxy Hosts** et cliquez sur **Add Proxy Host**.
3. **Domain Names** : `ajaccio.surf`, `www.ajaccio.surf`
4. **Scheme** : `http`
5. **Forward Hostname / IP** : `<YOUR_SERVER_IP>`
6. **Forward Port** : `9888` (Le port externe de l'application beacon-live)
7. Allez dans l'onglet **SSL** :
   - SSL Certificate : **Request a new SSL Certificate**
   - Cochez **Force SSL**
   - Renseignez votre adresse email et acceptez les ToS Let's Encrypt.
8. Cliquez sur **Save**.

🎉 **Terminé !** 
Assurez-vous que votre routeur / Box internet redirige bien le trafic entrant WAN (port 443) vers l'IP de votre serveur sur le port alternatif (4443 dans cet exemple). L'application sera alors accessible mondialement et sécurisée sur `https://ajaccio.surf`.
