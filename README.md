# Musical Chairs — Party Edition 🪩🪑

A multiplayer musical chairs game for team socials. One person hosts, everyone else
joins from their own laptop or phone with a link.

**Play: https://ramanchawla-space.github.io/musical-chairs/**

## Running a game

1. **Host** opens the site, picks a nickname and a dancer, and clicks **Host a game**.
   - Untick **I'm playing too** to run the game on a big shared screen as DJ/MC.
2. Share the **link** (or the **QR code** for phones, or just the 5-letter room code).
3. Players open the link, choose a nickname and **a man or a woman** to play as (eight
   looks each), optionally **📷 put their own face on them**, and click **Join**. There's
   no player limit.
4. The host picks the **vibe** (time of day: Sunny Day, Twilight or Golden Hour), the
   **mode** and **who stops the music**, then clicks **Start the music**. The game then
   climbs through **five levels** on its own (see below).

**The host must keep their tab open.** Their browser is the game server (see below).

## How a round works

- **Countdown, then the music.** Everyone dances round the chairs automatically.
  The line morphs between seven routines: Conga Orbit, Flower Power (weaves through
  the chairs), Figure Eight, Breathing Spiral, Twin Rings (counter-rotating), Star
  Trail and Snake Wave. The chairs slowly spin too.
- **The music stops at a random moment**, and you never know when: about one round in
  five is a sudden stop after a few seconds, one in five plays on for up to 40 seconds,
  and the rest are in between. You'll hear a record scratch, the floor
  flashes red and you see **SIT!!!**. Now you steer:
  - Keyboard: `WASD` or arrow keys
  - Mouse: **click a free chair to grab it**. You sit on it straight away and it stops
    roaming (phones give a little buzz). The first click on a chair wins it; mirage
    chairs can't be grabbed. Clicking the floor runs you to that spot, and `WASD` /
    arrow keys steer.
  - Phone: tap a chair the same way
  - Clicks and taps during the music are ignored; only the stop counts
- **Hurry!** A countdown appears the moment the music stops, turning amber then red,
  ticking (and buzzing on phones) through the last 3 seconds. Higher levels give less
  time: 100% of the window on Chill, down to 60% on Insane.
- **The chairs never sit still.** In **Wild** mode (the default) every chair roams the
  whole checkerboard from the moment the music starts. Chairs dash into the corners and
  along the edges, jink sideways and double back, and they **speed up** when the music
  stops (they never slow down). In the scramble they move at about a running player's
  pace, so cutting them off works better than chasing.
- **Hazards (levels 2–5).** Every round draws a random mix from a pool of twelve, and the HUD
  warns you what's coming. They only appear **once the music stops**, so the dance
  itself stays clear and easy to follow: **Fog** banks, low-flying **Birds**, split-second
  **Blackouts**, **Mirage chairs** (they look free but aren't real), **Giant disco
  balls** bouncing across the floor, **Bouncers** who wander about and physically block
  you, rising **Balloons**, sweeping **Laser walls**, **Smoke cannons**, **Lights out**
  (only roaming spotlights see anything), a **Spinning floor** (keys stay
  screen-relative) and a **Confetti storm**. Free chairs also blink invisible now and then.
- **Five levels, one game.** Each level plays round after round until one dancer is left
  standing (they win the level, +300). Then the game moves up a level on its own and
  **everyone comes back in**, including anyone booted and anyone who joined mid-game.
  After level 5 the game ends, and the most points wins. The host can also press
  **End game** at any time to go straight to the final podium with the scores so far.

  | Level | Chairs | Obstacles (after the stop) |
  |---|---|---|
  | 1 Chill | slow, and they slow right down at the stop | none |
  | 2 Easy | a bit quicker | 1 light obstacle |
  | 3 Medium | faster, free chairs blink | 2 light obstacles |
  | 4 Hard | fast | 3 light obstacles |
  | 5 Insane | they speed up at the stop | 4 from the full pool (fog, blackouts, smoke, lights out, spinning floor…) |
- **The board grows with the crowd**, so 20+ players have room to dance.
- **The round table.** The moment you sit, your chair stops roaming and carries you to a
  seat round a table that appears in the middle of the board. Free chairs keep roaming
  but stay clear of the table.
- Reach a free chair and you sit automatically. The host decides who got there first.
  Nobody can block a free chair by standing next to it.
- No chair? **BOOTED!** 🥾 You're off the floor for the rest of this level, but you keep
  every point you've earned, can still score by predicting, and you're back in next level.
- Each round brings a new chair layout (The Ring, Back to Back, Starburst, Sunflower,
  Islands, or a **Random Scatter** anywhere on the floor) and a new track.

| Setting | Options |
|---|---|
| Mode | **Classic**: one fewer chair than players. **Turbo**: about a quarter out each round (40 people finish a level in ~10 rounds; recommended for big groups, since there are five levels) |
| Chair layout | **Shapes mix**: rotates through the shapes and random scatter. **Random anywhere**: chairs dropped at random spots every round |
| Moving chairs | **Still**: chairs spin during the music, then freeze. **Drift**: they wobble after the stop; clicking a chair locks on. **Wild**: they race everywhere, all the time, and blink invisible |
| Who stops the music | **Random**: a surprise stop after 11–26 s. **Host DJ**: the host presses **STOP** or `Space` |

Other controls: `1`–`6` send reactions (🔥😂💃🎉😱👏) and `M` mutes.

## Points and staying in the game

- **Points every round.** Sitting scores 100, plus up to 250 for speed (it drains over
  about 4 seconds after the stop), plus 100 for being first down. A pop-up over your head
  shows what you earned and how fast you sat ("FIRST! +417 ⚡0.55s").
- **Special chairs.** Every round a few chairs are 👑 **thrones** (gold, with a crown,
  +300) and a few more are 🥈 **silver chairs** (+150). They glow and never blink out.
- **Bonus tiles.** Each round some squares of the board turn ✨ **gold** (+150) or ◇
  **silver** (+75). Grab any chair while it's rolling over one to collect it. What counts is
  where the chair is at the moment you grab it.
- **Combos.** A special chair on a special tile pays a combo instead of the two bonuses:
  💎 **Jackpot**, a throne on a gold tile: **+1000**. Throne on silver +600, silver chair on
  gold +450, silver on silver +300.
- **Streaks.** Survive round after round for a growing bonus (+25 per round in a row).
- **Out? Keep playing.** Booted players get a **"Who's out next?"** panel during the
  countdown and the music. Call the next player booted for +200. Picks lock when the
  music stops.
- **The jumbotron** shows everyone's points live, leaders first.
- **Round results** name the fastest sitter and show your points, streak and prediction.
- **Between levels** a card shows who won the level and the leaderboard so far.
- **The final podium** shows the top 3 by points (the most points wins the game), plus
  awards for the quickest sit, the longest streak, the best fortune teller, the throne
  collector, the tile hunter and the most levels won.

## The look

The game is played **on a tropical beach**. The board is polished marble: ivory
Calacatta squares with gold veining and deep espresso squares, each bevelled like a real
stone tile, with gold inlay between them and a gold compass-star medallion at the centre.
A gold-and-walnut frame runs round the edge, and the players and chairs reflect softly in
the polished floor. The board sits on a raised wooden deck on golden sand. Behind it a
turquoise sea rolls in and washes up as foam, with a glittering path under the sun, a
sailboat and a little island on the horizon, and seagulls gliding past. Palm trees sway
round the deck (two frame the view in the foreground), festoon lights hang between
bamboo poles, tiki torches flicker at the corners, and umbrellas shade loungers in the
margins. A crowd of holidaymakers in beachwear (board shorts, bikinis and sarongs, sun
hats and sunglasses) stands round the deck with cocktails, beers and coconuts: they sip
and sway to the music, go wild when it stops, and clap and cheer the results. The side
scenery is pulled in so it stays on screen on both sides. The vibe picks the time of day: **Sunny Day**, **Twilight** (moon, stars,
glowing lights) or **Golden Hour** (the sun sinking into the sea). A **jumbotron** on the
left lists every player live (dancing, running, seated, booted or out, and which round
they went out in), with a count of who's still in.

Every player is a **real person**, a man or a woman in their chosen look, who walks,
dances to the beat, sprints when the music stops and sits on the chair they win. The
chairs are red-painted wood and stand on the floor with contact shadows. While the
music plays the scene stays calm: no obstacles and no spinning floor.

## The music

The tracks are synthesised live in the browser with Web Audio, so there are no files to
license or download. **Every round plays a different song** (never the one that just
played), drawn from nine easy-going tracks between 104 and 120 BPM. They use a soothing
palette: a soft round kick, brushed shakers and finger snaps, warm sine bass, mellow pads,
electric piano, plucks, glassy bells and a breathy flute. Everything runs through a gentle
low-pass with a plate reverb and a light echo. **When only one chair is left**, the final
plays its own peppy track, *Final Showdown*: 128 BPM in a bright major key, with a
bouncing disco octave bass, handclaps, driving hi-hats, tambourine and off-beat chord
stabs, and no intro. Use **🎧 Play the music** in the lobby to listen while everyone
joins. Every device starts the track on the host's clock, so the whole room hears the
same beat.

## How the multiplayer works

GitHub Pages only serves static files, so the **host's browser is the server**.
Players connect straight to it over WebRTC (PeerJS, star topology). The free PeerJS
cloud handles the handshake and TURN relays help on strict office networks.

- **The dance isn't streamed.** Each round the host sends a seed, the dance order and
  a music start time. Every browser computes the same choreography locally, so 40
  dancers glide smoothly with zero position traffic.
- **Clock sync.** Every client pings each second and keeps the lowest-latency sample,
  which gives an offset accurate to about 1 ms on a LAN.
- **The scramble.** Your own movement runs locally, so steering has no lag. Positions
  go to the host at about 16 Hz and are relayed to everyone, and other players are
  interpolated about 110 ms behind. The host arbitrates every chair claim, so two
  people can't sit in the same chair.
- **Resilience.** Refreshing rejoins you as the same player. Players who go silent
  are evicted after 9 s and booted at the end of the round, so nobody hangs the game.
  Latecomers wait for the next game. The host's timers run in a Web Worker so the
  game keeps time if the host switches tabs.

## Development

```bash
npm install
npm run dev        # http://localhost:5173/musical-chairs/
npm test           # unit tests + production build + browser suites
./deploy.sh        # build and publish to GitHub Pages
```

### Tests

`npm test` runs everything. The browser suites run against the **production build**
using real Chrome instances that talk over real WebRTC.

| Suite | What it proves |
|---|---|
| `unit/core` | Chair layouts never overlap (1–60 chairs × 5 layouts). The dance never teleports. Conga lines don't pile up. Everything is deterministic |
| `unit/hub` | Full games to a champion. Chair races (first claim wins). Anti-teleport checks. Timeouts, replay if nobody sits, turbo, DJ mode, host-only commands, reconnects, latecomers, mid-round drop-outs, 40-player turbo |
| `e2e/game` | 5 browsers play a whole game: roster sync, theme switching, clock sync, identical choreography on every screen, mouse and keyboard steering, agreed eliminations, champion, play again |
| `e2e/resilience` | Big-screen host, refresh in the lobby, a player's browser dies mid-round, a latecomer joins, Host-DJ mode with `Space` |
| `e2e/mobile` | 390 px phone: no overflow, photo upload (sent as a ~3 KB JPEG), tap-to-move into a chair and win |
| `e2e/cloud` | The same flow over the real public PeerJS cloud (the production path) |

Screenshots of each run go to `test/artifacts/`.

## Playing on office / corporate networks

If players inside a company network get **"couldn't connect to the host"** or time out on
**Join**, the firewall is blocking WebRTC. Office firewalls usually only let through TCP on
ports 80/443, and PeerJS's free TURN relay only listens on 3478. The fix is a TURN relay
that runs over **TLS on port 443**, which the firewall sees as ordinary HTTPS.

1. Create a free TURN app at [metered.ca](https://www.metered.ca/stun-turn) (the free tier is plenty for a party game) and copy its credentials API URL.
2. Build with it: `VITE_ICE_URL="https://<app>.metered.live/api/v1/turn/credentials?apiKey=<key>" ./deploy.sh`
   (or pass a static list: `VITE_ICE_SERVERS='[{"urls":"turns:host:443?transport=tcp","username":"u","credential":"p"}]'`).
3. To try one out without rebuilding, add `&iceurl=<url-encoded endpoint>` to the page URL.

If the error says it **can't reach the game's connection server**, the proxy is blocking
`0.peerjs.com` itself. A TURN relay won't fix that; ask IT to allow `*.peerjs.com`, or use phone data.
