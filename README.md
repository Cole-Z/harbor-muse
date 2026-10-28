# Harbor Muse 🚢

**Ask the harbor what's out there.** A one-page live ship tracker for Corpus Christi, TX, where you can ask Meta's Muse models about the ships you see on the map, by typing or by voice.

> 🏁 **Built for the [Meta Global AI Developer Hackathon](https://cerebralvalley.ai/e/meta-ai-developer-hackathon) (Cerebral Valley), Indie track, solo.**
> All work in this repo was created during the event window, **Oct 26 – Nov 4, 2026**, and the commit history reflects that.

🎥 **Demo video (3 min):** _coming soon_
🌐 **Live demo:** _coming soon_

---

## What it does (planned)

- 🗺️ **Live map.** Real-time ship positions around Corpus Christi Bay and the port, from the free [aisstream.io](https://aisstream.io/) AIS feed, on a [Leaflet](https://leafletjs.com/) map.
- 💬 **Ask Muse.** Ask questions like *"What's that big ship heading into the port?"* Muse answers from a snapshot of the live ship data: name, type, speed, heading, and destination.
- 🎙️ **Voice.** Speak your question (transcribed by Muse) and hear the answer read aloud through your browser's built-in speech.
- ⏪ **Replay mode.** When the feed is quiet or no key is set, it plays back recorded real ship traffic, so there's always something to see.

## Setup (planned, kept tiny on purpose)

One Node server file, one HTML page, Leaflet from a CDN, no build step.

```bash
git clone https://github.com/Cole-Z/harbor-muse.git
cd harbor-muse
export AISSTREAM_API_KEY=your_key   # free at aisstream.io
export MUSE_API_KEY=your_key
npm start
```

Then open `http://localhost:3000`. No keys? It runs in replay mode.

## Roadmap

- [ ] Live ships on the map (aisstream.io + Leaflet)
- [ ] Ask Muse about ships from live data
- [ ] Voice questions and spoken answers
- [ ] Replay mode with recorded feed data
- [ ] Hosted live demo
- [ ] 3-minute demo video

## Credits

- Ship data: [aisstream.io](https://aisstream.io/)
- Map: [Leaflet](https://leafletjs.com/) and © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors
- AI: Meta Muse models

## Author

**Cole Zill**, [GitHub](https://github.com/cole-z) · [Portfolio](https://cole-z.github.io/)