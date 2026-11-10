import * as L from 'leaflet';

// Drop-in map: click anywhere on Earth, pick a height, and teleport there.
// Shows your current position, the live planes around you, and a search box.

const HEIGHTS = [
  ['Street', 0],
  ['Rooftop', 60],
  ['Skyscraper', 300],
  ['Helicopter', 500],
];

export class DropInMap {
  /**
   * @param {(lat:number, lon:number, h:number) => void} onDrop
   * @param {() => Array<{lat:number, lon:number, label:string}>} getPlanes
   */
  constructor(onDrop, getPlanes) {
    this.onDrop = onDrop;
    this.getPlanes = getPlanes;
    this.el = document.getElementById('map-panel');
    this.pending = null;
    this.height = 0;

    this.map = L.map('map', { zoomControl: true, worldCopyJump: true }).setView([40.758, -73.9855], 13);
    L.tileLayer('/api/osmtiles/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors',
    }).addTo(this.map);

    this.you = L.circleMarker([0, 0], { radius: 8, color: '#33e0ff', weight: 3, fillOpacity: 0.6 }).addTo(this.map);
    this.you.bindTooltip('you are here', { direction: 'top' });
    this.radius = L.circle([0, 0], { radius: 900, color: '#33e0ff', weight: 1, fill: false, dashArray: '4 6' }).addTo(this.map);
    this.target = L.circleMarker([0, 0], { radius: 9, color: '#ffd166', weight: 3, fillOpacity: 0.8 });
    this.planeLayer = L.layerGroup().addTo(this.map);

    this.map.on('click', (e) => this._setPending(e.latlng.lat, e.latlng.lng));

    // Height buttons.
    const hb = document.getElementById('map-heights');
    for (const [name, h] of HEIGHTS) {
      const b = document.createElement('button');
      b.textContent = `${name} (${h} m)`;
      b.onclick = () => this._setHeight(h);
      hb.appendChild(b);
    }
    this.heightInput = document.getElementById('map-h');
    this.heightInput.oninput = () => this._setHeight(parseFloat(this.heightInput.value) || 0, false);

    document.getElementById('map-drop').onclick = () => this.drop();
    document.getElementById('map-close').onclick = () => this.close();
    document.getElementById('map-search').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.search(e.target.value);
    });
    this._setHeight(0);
  }

  open(lat, lon, h) {
    this.el.classList.add('open');
    this.map.invalidateSize();
    this.you.setLatLng([lat, lon]);
    this.radius.setLatLng([lat, lon]);
    if (!this.pending) this.map.setView([lat, lon], Math.max(this.map.getZoom(), 13));
    this._setHeight(h);
    this._drawPlanes();
    this._planeTimer = setInterval(() => this._drawPlanes(), 5000);
  }

  close() {
    this.el.classList.remove('open');
    clearInterval(this._planeTimer);
  }

  get isOpen() {
    return this.el.classList.contains('open');
  }

  toggle(lat, lon, h) {
    this.isOpen ? this.close() : this.open(lat, lon, h);
  }

  _setPending(lat, lon) {
    this.pending = { lat, lon };
    this.target.setLatLng([lat, lon]).addTo(this.map);
    document.getElementById('map-target').textContent = `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
    document.getElementById('map-drop').disabled = false;
  }

  _setHeight(h, updateInput = true) {
    this.height = Math.max(0, Math.min(5000, h));
    if (updateInput) this.heightInput.value = String(Math.round(this.height));
  }

  drop() {
    if (!this.pending) return;
    this.onDrop(this.pending.lat, this.pending.lon, this.height);
    this.you.setLatLng([this.pending.lat, this.pending.lon]);
    this.radius.setLatLng([this.pending.lat, this.pending.lon]);
    this.target.remove();
    this.pending = null;
    document.getElementById('map-drop').disabled = true;
    document.getElementById('map-target').textContent = 'click the map to choose a spot';
    this.close();
  }

  async search(q) {
    q = q.trim();
    if (!q) return;
    const b = this.map.getBounds();
    const params = new URLSearchParams({
      q,
      format: 'jsonv2',
      limit: '1',
      // Prefer results near what's on screen, but allow anywhere.
      viewbox: [b.getWest(), b.getNorth(), b.getEast(), b.getSouth()].join(','),
    });
    const status = document.getElementById('map-target');
    status.textContent = 'searching…';
    try {
      const r = await fetch('/api/search/search?' + params);
      const [hit] = await r.json();
      if (!hit) {
        status.textContent = 'no results';
        return;
      }
      const lat = parseFloat(hit.lat);
      const lon = parseFloat(hit.lon);
      this.map.setView([lat, lon], 17);
      this._setPending(lat, lon);
      status.textContent = hit.display_name.split(',').slice(0, 3).join(',');
    } catch (e) {
      status.textContent = 'search failed: ' + e.message;
    }
  }

  _drawPlanes() {
    this.planeLayer.clearLayers();
    for (const p of this.getPlanes()) {
      L.circleMarker([p.lat, p.lon], { radius: 3, color: '#ffd166', weight: 1, fillOpacity: 0.9 })
        .bindTooltip(p.label, { direction: 'top' })
        .addTo(this.planeLayer);
    }
  }
}
