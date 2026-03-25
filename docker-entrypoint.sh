#!/bin/sh
# Injecte le token Infoclimat dans la conf nginx au démarrage (sans toucher aux variables nginx $uri, $args, etc.)
sed "s|__INFOCLIMAT_TOKEN__|${INFOCLIMAT_TOKEN}|g" /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf
exec nginx -g 'daemon off;'
