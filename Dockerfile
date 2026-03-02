FROM php:8.2-apache

WORKDIR /var/www/html
COPY . .

EXPOSE 9000