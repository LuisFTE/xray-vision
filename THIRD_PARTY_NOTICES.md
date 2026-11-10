# Third-party notices

This project's own code is MIT-licensed (see `LICENSE`). It bundles or uses the following.

## Bundled data

### Star and constellation data (`public/data/*.json`)
From [d3-celestial](https://github.com/ofrohn/d3-celestial) by Olaf Frohn. The star positions derive
from the ESA Hipparcos catalogue. License:

```
Copyright (c) 2015, Olaf Frohn
All rights reserved.

Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.

3. Neither the name of the copyright holder nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

## Libraries (installed via npm, not bundled)

| Package | License |
|---|---|
| [three.js](https://github.com/mrdoob/three.js) | MIT |
| [astronomy-engine](https://github.com/cosinekitty/astronomy) | MIT |
| [satellite.js](https://github.com/shashwatak/satellite-js) | MIT |
| [Leaflet](https://github.com/Leaflet/Leaflet) | BSD-2-Clause |

## Live data services (fetched at runtime, never redistributed)

| Service | Terms |
|---|---|
| [adsb.lol](https://adsb.lol) aircraft positions | ODbL 1.0, attribution required |
| [OpenStreetMap](https://www.openstreetmap.org/copyright) buildings (Overpass API), map tiles, Nominatim search | ODbL 1.0, © OpenStreetMap contributors; follow the [tile](https://operations.osmfoundation.org/policies/tiles/) and [Nominatim](https://operations.osmfoundation.org/policies/nominatim/) usage policies |
| [CelesTrak](https://celestrak.org) orbital elements | free to use; don't re-download more than needed (cached 6 h here) |

The app shows these credits on screen. Keep them visible if you fork it or record video of it.
