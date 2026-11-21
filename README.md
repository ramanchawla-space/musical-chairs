# Musical Chairs — Rave Edition 🪩🪑

A multiplayer musical chairs game for team socials. One person hosts, everyone else
joins from their own laptop or phone with a link.

**Play: https://ramanchawla-space.github.io/musical-chairs/**

## Running a game

1. **Host** opens the site, picks a nickname and picture, and clicks **Host a game**.
   - Untick **I'm playing too** to run the game on a big shared screen as DJ/MC.
2. Share the **link** (or the **QR code** for phones, or just the 5-letter room code).
3. Players open the link, choose a nickname and a picture (emoji characters, or
   **📷 their own photo**), and click **Join**. There's no player limit.
4. The host picks the **vibe** (Neon Rave, Cosmic Galaxy or Synthwave Sunset), the
   **mode** and **who stops the music**, then clicks **Start the music**.

**The host must keep their tab open.** Their browser is the game server (see below).

## How a round works

- **Countdown, then the music.** Everyone dances round the chairs automatically.
  The line morphs between seven routines: Conga Orbit, Flower Power (weaves through
  the chairs), Figure Eight, Breathing Spiral, Twin Rings (counter-rotating), Star
  Trail and Snake Wave. The chairs slowly spin too.
- **The music stops at a random moment.** You'll hear a record scratch, the floor
  flashes red and you see **SIT!!!**. Now you steer:
  - Keyboard: `WASD` or arrow keys
  - Mouse: click a chair, or anywhere on the floor
  - Phone: tap or drag towards a chair
- **The chairs never sit still.** In **Wild** mode (the default) every chair roams the
  whole floor from the moment the music starts. Chairs dash to the far edges, jink
  sideways and double back, and they **speed up** when the music stops (they never slow
  down). In the scramble they average a little faster than a running player, so you
  have to cut them off, not chase them. A click only sends you to that spot, so keep
  hunting and clicking (or steering).
- **Hazards.** Every round draws a random mix from a pool of twelve, and the HUD
  warns you what's coming: **Fog** banks, low-flying **Birds**, split-second
  **Blackouts**, **Mirage chairs** (they look free but aren't real), **Giant disco
  balls** bouncing across the floor, **Bouncers** who wander about and physically block
  you, rising **Balloons**, sweeping **Laser walls**, **Smoke cannons**, **Lights out**
  (only roaming spotlights see anything), a **Spinning floor** (keys stay
  screen-relative) and a **Confetti storm**. Free chairs also blink invisible now and then.
- **It gets harder and harder.** The 🔥 level (1–10) climbs as players are booted, from
  round one up to the final showdown. Higher levels bring faster chairs, longer
  blink-outs, more bouncers, mirages and birds, and more hazards at once (up to ten).
- **The floor grows with the crowd**, so 20+ players have room to dance.
- Reach a free chair and you sit automatically. The host decides who got there first.
  Nobody can block a free chair by standing next to it.
- No chair? **BOOTED!** 🥾 You get kicked off the floor and can keep sending reactions.
- Each round brings a new chair layout (The Ring, Back to Back, Starburst, Sunflower,
  Islands, or a **Random Scatter** anywhere on the floor) and a new track. Last player sitting is crowned 👑.

| Setting | Options |
|---|---|
| Mode | **Classic**: one fewer chair than players. **Turbo**: about a quarter out each round (40 people finish in ~10 rounds) |
| Chair layout | **Shapes mix**: rotates through the shapes and random scatter. **Random anywhere**: chairs dropped at random spots every round |
| Moving chairs | **Still**: chairs spin during the music, then freeze. **Drift**: they wobble after the stop; clicking a chair locks on. **Wild**: they race everywhere, all the time, and blink invisible |
| Who stops the music | **Random**: a surprise stop after 11–26 s. **Host DJ**: the host presses **STOP** or `Space` |

Other controls: `1`–`6` send reactions (🔥😂💃🎉😱👏) and `M` mutes.

## The look

The floor is a raised 3D stage seen in perspective. It has an LED-lit side wall,
light-up tiles that shrink into the distance, light shafts and sweeping spotlights,
speaker stacks pumping to the kick, and a mirror ball throwing light specks. The
chairs are solid, with legs, a padded seat and a backrest. The floor slowly turns
while the music plays and bobs to the beat. Everything is depth-sorted, so near
players, bouncers and disco balls pass in front of far chairs.

## The music

The tracks are real rave styles synthesised live in the browser with Web Audio, so there
are no files to license or download. Nine tracks between 132 and 150 BPM use the classic
rave toolkit: distorted kicks, chopped breakbeats, squelchy 303 acid lines, the hoover,
reese bass, rave organ stabs, hardcore piano, trance-gated supersaws, laser zaps and
air horns on the drop. Everything except the kick is sidechain-pumped. Each track runs a
16-bar arrangement (intro, build, anthem hook, a breakdown with siren, snare roll and
riser, then the drop with a crash and air horn). Use **🎧 Play the music** in the lobby
to listen while everyone joins. Every device starts the track on the host's clock, so
the whole room hears the same beat.

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
