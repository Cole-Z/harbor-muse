# Harbor Muse 🚢

**Ask the harbor what's out there.** A one-page live ship tracker for Corpus Christi, TX, where you can ask Meta's Muse models about the ships you see on the map, by typing (your phone keyboard's dictation works too).

> 🏁 **Built for the [Meta Global AI Developer Hackathon](https://cerebralvalley.ai/e/meta-ai-developer-hackathon) (Cerebral Valley), Indie track, solo.**
> All work in this repo was created during the event window, **Oct 26 – Nov 4, 2026**, and the commit history reflects that.

🎥 **Demo video (3 min):** _coming soon_
🌐 **Live demo:** _coming soon_

---

## What it does (planned)

- 🗺️ **Live map.** Real-time ship positions around Corpus Christi Bay and the port, from the free [aisstream.io](https://aisstream.io/) AIS feed, on a [MapLibre GL](https://maplibre.org/) map with the keyless [OpenFreeMap](https://openfreemap.org/) Positron style (Leaflet + OpenStreetMap as fallback).
- 💬 **Ask Muse.** Ask questions like *"What's that big ship heading into the port?"* Muse answers from a snapshot of the live ship data: name, type, speed, heading, and destination.
- 📇 **Tap a ship** for name, type, speed, heading and destination ("unknown" when AIS doesn't say; AIS has no origin, so none is shown).
- ⏪ **Replay mode.** When the feed is quiet or no key is set, it plays back recorded real ship traffic, so there's always something to see.

## Run it

Needs Node 18+. One server file, one HTML page, no build step.

```bash
git clone https://github.com/Cole-Z/harbor-muse.git
cd harbor-muse
npm install
export AISSTREAM_API_KEY=your_key   # optional, free at aisstream.io
npm start
```

Open `http://localhost:3000` (set `PORT` to change it). With no key, or no live positions for 2 minutes, it plays recorded bay traffic from `replay.jsonl` and the badge says **REPLAY**. Keys stay on the server; see `.env.example` for the variable names.

| Endpoint | What |
|---|---|
| `GET /ships` | `{mode: "live"\|"replay", asOf, ships: [{mmsi, name, type, lat, lon, sog, cog, hdg, dest, ageSec, stale}]}` |
| `GET /health` | status of the feed and replay |
| `POST /ask` | not wired up yet (returns 501) |

Rebuild the replay file from recordings: `node tools/build-replay.js recording.jsonl ...` (capped at 2 MB). Record more: `node tools/record.js recording.jsonl 30`.

## Roadmap

- [x] Live ships on the map (aisstream.io + MapLibre/OpenFreeMap)
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