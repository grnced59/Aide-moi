# AGENTS.md

## Contexte du projet
Ce dépôt contient l’application web "Aide Moi" et son emballage Android via Capacitor.
Le code principal est une webapp statique avec des pages HTML et du JavaScript, packagée dans `android/`.

## Structure importante
- `index.html` : page principale
- `auth.html` : page d’authentification
- `presentation.html` : page de présentation
- `reset-password.html` : page de réinitialisation de mot de passe
- `js/` : scripts côté client
- `web/` : ressources web ou contenu packagé pour Capacitor
- `android/` : projet Android généré par Capacitor
- `package.json` : scripts et dépendances Capacitor

## Commandes utiles
- `npm install` : installe les dépendances Node
- `npm run cap:sync android` : synchronise le projet web avec Android
- `npm run cap:add:android` : ajoute la plateforme Android au projet Capacitor
- `npm run cap:open` : ouvre le projet Android dans Android Studio
- `npm run android:init` : ajoute et synchronise Android (`cap:add:android` puis `cap:sync android`)

## Règles spécifiques pour l’agent
- Toujours répondre en français, comme demandé par l’utilisateur.
- Prioriser les modifications dans la webapp statique (`*.html`, `js/`, `vendor/`, `logo/`) plutôt que dans les générés Android sauf si la tâche concerne explicitement Android.
- Vérifier `package.json` avant de proposer une commande de build ou de synchronisation.
- Si une tâche implique Capacitor ou Android, rappeler que la base se trouve dans `android/` et que la logique applicative est principalement dans la webapp.
- Ne pas inventer de tests ou de workflows qui n’existent pas dans le dépôt.

## Suggestions de personnalisation futures
- Créer un skill pour les tâches Capacitor/Android (`npm run cap:sync`, `npm run cap:open`).
- Créer un agent pour corriger et tester les pages HTML/JS de l’application web.
- Créer un fichier `.github/copilot-instructions.md` si le dépôt devient multi-module ou si plusieurs contributeurs utilisent l’IA.
