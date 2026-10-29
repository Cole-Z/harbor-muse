# Harbor Muse 🚢

**Ask the harbor what's out there.** A one-page live ship tracker for US waters, centered on wherever you are, where you can ask Meta's Muse models about the ships you see on the map, by typing (your phone keyboard's dictation works too).

> 🏁 **Built for the [Meta Global AI Developer Hackathon](https://cerebralvalley.ai/e/meta-ai-developer-hackathon) (Cerebral Valley), Indie track, solo.**
> All work in this repo was created during the event window, **Oct 26 – Nov 4, 2026**, and the commit history reflects that.

🎥 **Demo video (3 min):** _coming soon_
🌐 **Live demo:** _coming soon_

---

## What it does (planned)

- 🗺️ **Live map near you.** Your phone's location centers the map and tells the server which waters to watch (a ~25 nm box around you, anywhere in the US). Real-time positions come from the free [aisstream.io](https://aisstream.io/) AIS feed, on a [MapLibre GL](https://maplibre.org/) map with the keyless [OpenFreeMap](https://openfreemap.org/) Positron style (Leaflet + OpenStreetMap as fallback).
- 💬 **Ask Muse.** Ask questions like *"What's that big ship heading into the port?"* Muse answers from a snapshot of the live ship data: name, type, speed, heading, and destination.
- 📇 **Tap a ship** for name, type, speed, heading and destination ("unknown" when AIS doesn't say; AIS has no origin, so none is shown).
- ⏪ **Replay demo.** If location is denied or unavailable, the map opens on Corpus Christi Bay (our beach demo home) and plays recorded real traffic when the live feed is quiet or no key is set. If you're located elsewhere and nothing live is near you yet, the badge says **WAITING** instead of jumping you to Texas.

## Run it

Needs Node 20.6+ (uses Node's built-in `--env-file`, no dotenv). One server file, one HTML page, no build step.

```bash
git clone https://github.com/Cole-Z/harbor-muse.git
cd harbor-muse
npm install
cp .env.example .env   # then fill in AISSTREAM_API_KEY (free at aisstream.io) and MUSE_API_KEY (Ask, coming soon)
npm start              # runs node --env-file=.env server.js; without a .env it just runs node server.js
```

Hosted (Render, Fly, …): set `AISSTREAM_API_KEY` / `MUSE_API_KEY` as host env vars and run `node server.js`.

If live ships aren't near you, the map says "No ships nearby right now" and offers "Watch Corpus Christi demo (replay)"; it never switches to the Texas replay on its own. The subscription is soft-capped at 10 bounding boxes (Corpus Christi box always kept, overlapping boxes merged, oldest viewers dropped first); if aisstream rejects the boxes the server falls back to the Corpus Christi box.

Open `http://localhost:3000` (set `PORT` to change it). Geolocation needs a secure context: `localhost` works, hosted copies need HTTPS. Keys live only on the server (see `.env.example`); people using a hosted copy never paste a key. The server keeps one aisstream connection and subscribes to the Corpus Christi demo box plus a box around each active viewer.

| Endpoint | What |
|---|---|
| `GET /ships?lat=&lon=&radiusDeg=&demo=1` | `{mode: "live"\|"replay"\|"waiting", asOf, ships: [{mmsi, name, type, lat, lon, sog, cog, hdg, dest, ageSec, stale}], note?}`, filtered to your area |
| `POST /view` | `{lat, lon, accuracy?}` (US only); adds your area to the live subscription for 10 min |
| `GET /health` | status of the feed and replay |
| `POST /ask` | not wired up yet (returns 501) |

**Muse models.** Ask uses `muse-spark-1.3` (preferred, 5 attempts on intermittent 404 `model_not_found`), then falls back to `muse-spark-1.1` (5 attempts) with the same request body. No Contributor model is used. Only the fallback model name is logged.

**Add to Home Screen (PWA).** Harbor Muse ships a web manifest and a small service worker, so it can be installed: iOS Safari → Share → Add to Home Screen; Android Chrome → menu → Install app. It opens full-screen. The service worker caches only the app shell (page, manifest, icons); map tiles, the map library CDN, and live ship data always go to the network and are never cached. Offline you get the shell, not the map. Installing needs HTTPS (or `localhost`).

Rebuild the replay file from recordings: `node tools/build-replay.js recording.jsonl ...` (capped at 2 MB). Record more: `node tools/record.js recording.jsonl 30`.

## Roadmap

- [x] Live ships on the map (aisstream.io + MapLibre/OpenFreeMap)
- [x] US-wide: map and feed follow your location
- [ ] Ask Muse about ships from live data
- [x] Replay mode with recorded feed data
- [ ] Hosted live demo
- [ ] 3-minute demo video

## Credits

- Ship data: [aisstream.io](https://aisstream.io/)
- Map: [Leaflet](https://leafletjs.com/) and © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors
- AI: Meta Muse models

## Author

**Cole Zill**, [GitHub](https://github.com/cole-z) · [Portfolio](https://cole-z.github.io/)