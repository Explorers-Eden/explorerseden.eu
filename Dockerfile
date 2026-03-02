FROM php:8.2-apache

WORKDIR /var/www/html
COPY . .

RUN a2enmod rewrite headers

EXPOSE 80