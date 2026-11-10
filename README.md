# X-Ray Vision

See the city around you through your walls: a hologram of every building at its real height, every
plane in the sky (live), satellites, and the real stars, sun, moon and planets, even at noon. It runs in the Quest 3 browser (WebXR passthrough) or in a desktop browser.

Everything is public data. No keys and no hardware are needed.

| Layer | Source | Refresh |
|---|---|---|
| Planes | [adsb.lol](https://adsb.lol) public ADS-B network (ODbL) | every 5 s, dead-reckoned in between |
| Buildings | OpenStreetMap via Overpass API | once per location, cached in `.cache/` |
| Satellites | CelesTrak (`stations` + `visual` groups) | orbits cached 6 h, propagated locally with SGP4 |
| Stars / constellations | d3-celestial (Hipparcos, mag ≤ 5.5) | bundled in `public/data/` |
| Sun, moon, planets | astronomy-engine | computed locally |
| Drop-in map + search | OpenStreetMap tiles + Nominatim (Leaflet) | tiles cached 7 days, search 1 req/s |

## Run

```bash
npm install    # three, astronomy-engine, satellite.js — no build step, no bundler
npm run dev    # zero-dependency HTTPS server in server.mjs; prints desktop + headset URLs
```

- **Desktop:** open `https://localhost:5173` and accept the self-signed certificate warning.
  Drag to look, scroll to zoom, Q/E to rotate north, H to hide the panel.
- **Quest 3:** the PC and the headset must be on the same Wi-Fi. In the Quest browser open
  `https://<your PC's LAN IP>:5173` (printed by `npm run dev`), accept the
  certificate warning, then press **ENTER X-RAY VISION**.
  - If the Quest can't connect, allow port 5173 through Windows Firewall (WSL runs in mirrored
    networking mode, so the dev server shows up on the PC's own IP).

## In the headset

- **Right stick ←/→:** rotate the world until north lines up. The trick: line up a hologram
  building with the real one out the window, or point the red **N** marker north.
- **Left stick ↑/↓:** float up or down (stand on top of the Empire State Building, etc.).
- Teleport anywhere: press **M** (or the map button) on desktop, search or click a spot, pick a height, **DROP IN**. Or use URL params:
  `?lat=40.7484&lon=-73.9857&h=320`.

The world only lines up with your real surroundings when the location is where you physically are.
Anywhere else it's "teleport mode". Use that for filming, so your real location never shows.

## Code map

- `src/geo.js` — WGS84 → local east/north/up → scene coordinates
- `src/sky.js` — stars, constellations, sun/moon/planets, horizon + compass
- `src/planes.js` — live aircraft, labels, trails, smoothing
- `src/satellites.js` — SGP4 satellites from CelesTrak
- `src/buildings.js` — OSM buildings extruded into a hologram city
- `src/map.js` — 2D drop-in map (Leaflet): search, click, pick height, teleport
- `src/labels.js` — text sprites with constant angular size (readable at any distance)
- `server.mjs` — HTTPS dev server (self-signed cert in `.cert/`) + caching proxy for the public APIs

## Ideas next

- Use the Quest room mesh as a portal, so walls become windows (true "through the wall" occlusion)
- MTA subway trains under the floor (GTFS-Realtime), ships (AIS), ISS pass alerts
- Look-at-to-inspect: gaze at a plane for its route and origin/destination

## License

MIT. Use it, fork it, film it. See `LICENSE`. Data sources and bundled star data are credited in
`THIRD_PARTY_NOTICES.md`; keep the on-screen attributions visible.
