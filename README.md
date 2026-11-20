# ⚡ KI STRIKE Z — Bataille navale multijoueur

Bataille navale en temps réel avec une esthétique d'anime de combat des années 90 : rayons de Ki, attaques ultimes, explosions, tremblements d'écran et sons rétro synthétisés.

## Lancer le jeu

```bash
npm install
npm start
```

Ouvre ensuite **http://localhost:3000**.

- **Jouer à deux sur le même ordinateur** : ouvre deux onglets. Dans le premier, clique sur « Créer une arène ». Dans le second, entre le code affiché (ex. `ZETA-77`) ou ouvre le lien copié.
- **Jouer sur deux appareils** (même Wi-Fi) : au démarrage, le serveur affiche une adresse `Réseau : http://192.168.x.x:3000`. Ouvre-la sur l'autre appareil.
- **Jouer en solo** : choisis « 1v1 contre l'IA ».

Variables d'environnement : `PORT` (3000 par défaut).

## Commandes

| Touche / geste | Action |
|---|---|
| Clic | Placer un vaisseau, ou tirer |
| `R` / clic droit / bouton ↻ | Pivoter le vaisseau ou la zone de l'attaque ultime |
| `U` | Armer l'attaque ultime (quand le Ki est à 100 %) |
| `Échap` | Annuler l'attaque ultime |

## Règles

- 5 vaisseaux sur une grille 10×10 (tailles 5, 4, 3, 3 et 2). Les joueurs tirent chacun leur tour.
- **Jauge de Ki** : +25 si tu touches, +5 si tu rates, +12 par dégât encaissé.
- À 100 % de Ki : **attaque ultime** sur une ligne de 3 cases (horizontale ou verticale). La jauge revient ensuite à 0.

## Architecture

```
server.js          Express + Socket.io : arènes, tours, Ki, validation, déconnexions
server/ai.js       IA à carte de probabilités (n'utilise que l'information publique)
shared/rules.js    Règles communes au serveur et au navigateur
public/
  index.html       Écrans : accueil, salon d'attente, placement, combat, fin de partie
  css/style.css    Interface arcade, contours épais façon cel-shading
  js/background.js Décor en parallaxe sur canvas (pré-rendu hors écran)
  js/fx.js         Moteur d'effets : salves, rayon ultime, explosions, particules, tremblements
  js/ships.js      Vaisseaux en SVG
  js/board.js      Composant de grille
  js/audio.js      Effets sonores Web Audio (aucun fichier audio)
  js/main.js       Contrôleur client et file d'animations
tests/smoke.js     Test de bout en bout (vrais clients Socket.io)
```

**Anti-triche** : le serveur est l'unique autorité. Il valide le placement, le tour, chaque case visée et le niveau de Ki. Un client ne reçoit jamais la position des vaisseaux adverses, seulement le résultat de ses tirs. La flotte adverse restante n'est révélée qu'au perdant, une fois la partie terminée.

**Déconnexion** : un joueur déconnecté dispose de 20 s pour revenir. Il récupère alors tout l'état de la partie, par exemple après un rechargement de page. Passé ce délai, son adversaire gagne par forfait.

## Tests

```bash
npm test
```
