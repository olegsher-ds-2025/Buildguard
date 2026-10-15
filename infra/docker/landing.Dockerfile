# syntax=docker/dockerfile:1
#
# Static landing page (apps/landing) behind nginx. Build context is the repo root, same as the other
# Dockerfiles. No Node stage: the site is plain HTML/CSS/JS. BUILD_SHA cache-busts the css/js URLs: every
# `?v=__V__` placeholder in the HTML is replaced at build time.

FROM nginxinc/nginx-unprivileged:1.27-alpine
ARG BUILD_SHA=dev
USER root
COPY apps/landing /usr/share/nginx/html
COPY infra/docker/landing.nginx.conf /etc/nginx/conf.d/default.conf
RUN find /usr/share/nginx/html -name '*.html' -exec sed -i "s/__V__/${BUILD_SHA}/g" {} +
USER nginx
EXPOSE 8080
