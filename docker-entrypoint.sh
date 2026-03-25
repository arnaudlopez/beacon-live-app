#!/bin/sh
# Injecte les variables d'environnement dans la configuration nginx (token Infoclimat)
envsubst '${INFOCLIMAT_TOKEN}' < /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf
exec nginx -g 'daemon off;'
