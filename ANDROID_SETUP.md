# Build Android - Aide Moi

## Prerequis
- Node.js LTS
- Android Studio (SDK + emulator ou device USB)

## Installation
```powershell
npm install
```

## Initialiser le projet Android (une seule fois)
```powershell
npm run cap:add:android
```

## Synchroniser les changements Web vers Android
```powershell
npm run cap:sync
```

## Ouvrir le projet dans Android Studio
```powershell
npm run cap:open
```

## Notes
- Le point d'entree Android est `index.html`, qui redirige vers `AideMoi_11.html`.
- Les options StatusBar/Splash sont configurees dans `capacitor.config.json`.
- Si tu modifies `AideMoi_11.html`, relance `npm run cap:sync` avant de re-builder.
