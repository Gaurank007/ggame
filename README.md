# NEON VANGUARD

NEON VANGUARD is a canvas arena space-fighter. GitHub Pages hosts the browser game; a separate Node.js service hosts online rooms and runs their simulation.

## Publish the website and online server

1. Push this repository to GitHub on the `main` branch.
2. In the repository, open **Settings → Pages** and set the source to **GitHub Actions**. The workflow in `.github/workflows/pages.yml` publishes the game files automatically.
3. Create a free account at Render, choose **New → Blueprint**, and connect this repository. Render detects `render.yaml`, builds the Node service, and starts it. Wait until the service is live and copy its hostname, such as `neon-vanguard-server.onrender.com`.
4. In `online-config.js`, set the URL to the service's secure WebSocket address (replace the example with the hostname Render assigned):

   ```js
   window.NEON_KITES_WS_URL = 'wss://neon-vanguard-server.onrender.com';
   ```

5. Commit and push that change. GitHub Actions republishes the page. Open the GitHub Pages URL, choose **ONLINE**, create a room, then share the five-character code with players anywhere. They open the same website and join by code.

The backend uses the same URL as its HTTPS site, with `wss://` for WebSockets. GitHub Pages serves only the client; the Render service serves the Node server and runs the authoritative game loop. Do not put secrets in `online-config.js`; it is public website code.

Render's free web services sleep after 15 minutes without inbound traffic, and the next connection can take about a minute while the service wakes. Rooms live in server memory, so they end if the service restarts or sleeps. For always-on multiplayer or persistent rooms, use an always-on server plan and add persistent storage if needed.

## Run locally

Install a current Node.js LTS release, then run in this folder:

```sh
npm install
npm start
```

Open `http://localhost:3000`. The online client connects to the same host automatically when `online-config.js` is empty. You can also open `index.html` directly for offline bot matches.

## Online protocol

Rooms have a five-character join code and support up to eight pilots. The host selects the game settings and starts the match; in team mode, bots fill remaining places on each team when enabled. Players can choose their team, and lobby team summaries show human counts and expected bot fill. Training rooms use balanced teams, respawning bots, and no score-based end condition. The server simulates at 30 ticks per second and broadcasts snapshots at 20 per second using negotiated WebSocket compression; it drops stale client input when the send queue is backed up. Per-viewer snapshots cap cosmetic particles, shorten trails, and include only local damage numbers.

## Controls

- Move: WASD or arrow keys
- Aim: mouse
- Shoot: hold mouse button or Space
- Dash: Shift
- Scoreboard: hold Tab
- Pause / resume: Escape or the in-game pause button; the pause screen offers settings and quit-to-menu
- Training: choose **TRAINING** on the home screen to practice against stationary targets for every ship class
- Touch: left joystick to move; right joystick to aim and auto-fire; use FIRE when auto-fire is disabled; SKILL and DASH are separate buttons. Settings can force touch controls on or off, or detect them automatically.
- Fullscreen: use the home-screen or pause-screen **FULLSCREEN** button
- Settings: adjust volume, screen shake, flashing, effects, motion, and touch auto-fire
- Rules: open **RULES** on the home screen for combat, ship, match-mode, and touch-control tabs
- Developer checks: press **F3** and select **RUN RULE CHECKS** to print gameplay PASS/FAIL results on screen and in the console. During online play, the panel reports round-trip time, snapshot spacing, decoded JSON payload rate, and artificial incoming delay. Snapshot wire traffic is compressed.
- Team passives: Specters increase allied fire rate, Bulwarks grant shield layers, Aegis pilots increase allied skill-point regeneration, and Eclipse team kills grant temporary invisibility and speed.
- Match setup: offline team battles let the player choose Cyan or Magenta and preview each team’s bot/class roster; online lobbies show team fill, pilot readiness, and enforce the per-team class cap.
- Specter has 100 health, and standard bullets deal 10 damage per hit.
- Each class has a distinct projectile silhouette: Specter darts, Bulwark pellets, Aegis beam flares, and Eclipse hexes.
- Bulwark's nuke slows enemies in range by 80% during its charge, including their dash speed.
- Specter bind covers a 420-unit radius (30% shorter than the previous 600 units); its ready indicator is a pulsing outline.
- In free-for-all, pilots can choose from eight high-contrast ship colors. Team battles lock all Cyan players to Cyan and all Magenta players to red-magenta.
- Online training: the room host can choose **Training** under Ruleset; the room runs as teams with bots and continues without a score-race end.

## Development checks

```sh
npm run check
npm test
```
