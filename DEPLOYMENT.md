# Production Deployment & Custom Domain

L'application **Beacon Live** est désormais "Production-Ready", architecturée autour de Supabase (Backend/Cache) et de Docker (Frontend/Proxy).

## 1. Architecture Actuelle

1. **Client PWA (Docker/Nginx)** : Sert les fichiers statiques React et agit comme un Reverse Proxy privé pour contourner le blocage IP d'Infoclimat (`/api/infoclimat/`).
2. **Supabase Edge Function (`weather-cache`)** : Centralise, met en cache (6 minutes), et unifie les données de Météo-France, Pioupiou, eSurfmar et CANDHIS. Protège la clé d'API Météo-France en tant que secret serveur.

## 2. Configuration du Domaine (`ajaccio.surf`)

Puisque le domaine a été acheté sur Namecheap, la configuration nécessite deux étapes clés : le pontage DNS, et la gestion du SSL (HTTPS) via un routeur sur votre noeud Portainer.

### Étape A : DNS Namecheap
Dans le tableau de bord Namecheap (Advanced DNS), supprimez les enregistrements de parking par défaut et ajoutez :
### Étape B : Sécurisation HTTPS via votre Reverse Proxy (Traefik)
Puisque votre serveur NAS possède **déjà un proxy Traefik** configuré (qui occupe les ports 80/443/81), il n'est pas nécessaire d'installer un autre routeur.

Vous avez juste à dire à votre Traefik d'adopter le conteneur `beacon-live`.

**Pour activer Traefik sur Beacon Live :**
1. Ouvrez l'onglet **Editor** de votre stack `beacon-live` dans Portainer.
2. Dans la section `beacon-live:`, trouvez le bloc `# Option 2: Exposition via TRAEFIK` et **décommentez toutes les lignes sous `labels:`**.
3. Assurez-vous d'ajuster le nom du resolver de certificat (la ligne `tls.certresolver=`) en fonction du nom que vous utilisez dans Traefik (ex: `le`, `letsencrypt`, `myresolver`).
4. À la fin du bloc `beacon-live:`, **décommentez la ligne `- traefik_network`**.
5. Tout en bas du fichier, dans le bloc global `networks:`, **décommentez le bloc `traefik_network:`** en remplaçant ce nom par le vrai nom du réseau Docker utilisé par votre instance Traefik (souvent `proxy`, `traefik_web` ou `web`).
6. Si vous utilisez Traefik, vous pouvez **commenter le bloc `ports:`** (9888:80) car l'application n'aura plus besoin d'être exposée publiquement.
7. Cliquez sur **Update the stack**.

🎉 **Terminé !** 
Dès que Traefik va repérer les nouveaux labels Docker, il demandera automatiquement un certificat HTTPS à Let's Encrypt et redirigera `https://ajaccio.surf` vers votre application de manière invisible et hyper-sécurisée.
