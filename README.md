# 🎬 ClipCut - Application de Montage Vidéo Mobile

ClipCut est une application de montage vidéo mobile moderne développée en React Native et TypeScript. Elle propose un flux de travail complet inspiré des logiciels de montage professionnels comme CapCut ou Premiere, adapté aux interfaces tactiles.

## 🚀 Fonctionnalités Clés

### 1. Gestion de Projets & Persistance locale
- **Dashboard Interactif** : Créez, éditez et supprimez vos projets.
- **Ratios prédéfinis** : Support des formats 9:16 (TikTok/Reels), 16:9 (YouTube), 1:1 (Instagram) et 4:3 (iPad/Rétro).
- **Sauvegarde automatique** : Persistance automatique de vos modifications (clips, textes, transitions) dans la mémoire de l'application.

### 2. Timeline Multi-piste
- **Compositing & Superposition** : Deux pistes vidéo distinctes pour superposer des médias (Canal 0 : Piste principale, Canal 1 : Piste de superposition/Overlay).
- **Piste Audio dédiée** : Intégration de pistes sonores avec visualiseur d'ondes audio (waveform).
- **Positionnement temporel** : Déplacez librement n'importe quel clip sur la timeline grâce au réglage précis de décalage (`startOffset`).

### 3. Outil de Découpe (Split) Précis
- **Coupe intelligente** : Divise instantanément le clip sélectionné à l'endroit exact de la playhead (tête de lecture centrale).
- **Gestion des Keyframes au split** : Conservation et répartition automatique des keyframes de part et d'autre de la coupe.

### 4. Panneau de Propriétés & Édition
- **Transformations physiques** : Réglez l'Échelle (Scale), l'Opacité, la Rotation, et la Vitesse de lecture de chaque clip.
- **Système de Keyframes (◊)** : Posez et animez des points clés d'animation sur la timeline.
- **Incrustation de Texte** : Ajoutez des textes personnalisés et déplacez-les directement du bout des doigts sur la zone d'aperçu.
- **Transitions** : Appliquez des transitions (Fade, Glitch, Zoom, Blur) entre les clips de la piste principale.

### 5. Prévisualisation & Export
- **Lecteur de simulation actif** : Interface caméra active (REC, grille, timecode dynamique et ondes audio synchronisées lors de la lecture).
- **Moteur d'Exportation** : Simulation d'assemblage des clips, des transitions, des textes et des pistes audio.

---

## 🛠️ Configuration & Lancement

### Prérequis
Assurez-vous d'avoir configuré votre environnement de développement React Native pour Android/iOS (voir [React Native CLI Setup](https://reactnative.dev/docs/set-up-your-environment)).

### Installation
1. Clonez le dépôt git.
2. Ouvrez un terminal dans le dossier du projet `ClipCut` et installez les dépendances :
   ```bash
   npm install
   ```

### Lancer Metro
Démarrez le serveur Metro de développement :
```bash
npm start
```

### Lancer l'application
Dans un autre terminal, lancez le build pour votre plateforme cible :

#### Android
```bash
npm run android
```

#### iOS
```bash
bundle exec pod install
npm run ios
```
