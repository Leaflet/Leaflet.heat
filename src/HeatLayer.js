import * as L from 'leaflet';
import SimpleHeat from 'simpleheat';

export class HeatLayer extends L.Layer {
    constructor(latlngs, options) {
        super();
        this._latlngs = latlngs;
        L.Util.setOptions(this, options);
    }

    setLatLngs(latlngs) {
        this._latlngs = latlngs;
        return this.redraw();
    }

    addLatLng(latlng) {
        this._latlngs.push(latlng);
        return this.redraw();
    }

    setOptions(options) {
        L.Util.setOptions(this, options);
        if (this._heat) {
            this._updateOptions();
        }
        return this.redraw();
    }

    getBounds() {
        return new L.LatLngBounds(this._latlngs);
    }

    redraw() {
        if (this._heat && !this._frame && this._map) {
            this._frame = requestAnimationFrame(() => this._redraw());
        }
        return this;
    }

    getEvents() {
        const events = {moveend: this._reset};
        if (this._zoomAnimated) {
            events.zoomanim = this._animateZoom;
        }
        return events;
    }

    onAdd() {
        if (!this._canvas) {
            this._initCanvas();
        }
        this.getPane().appendChild(this._canvas);
        this._reset();
    }

    onRemove() {
        this._canvas.remove();
        this._cancelFrame();
    }

    _initCanvas() {
        const canvas = this._canvas = document.createElement('canvas');
        canvas.classList.add('leaflet-heatmap-layer', 'leaflet-layer', `leaflet-zoom-${this._zoomAnimated ? 'animated' : 'hide'}`);
        canvas.style.transformOrigin = '50% 50%';

        const size = this._map.getSize();
        canvas.width = size.x;
        canvas.height = size.y;

        this._heat = new SimpleHeat(canvas);
        this._updateOptions();
    }

    _updateOptions() {
        this._heat.radius(this.options.radius, this.options.blur);
        this._heat.max(this.options.max);

        if (this.options.gradient) {
            this._heat.gradient(this.options.gradient);
        }
    }

    _reset() {
        const topLeft = this._map.containerPointToLayerPoint([0, 0]);
        L.DomUtil.setPosition(this._canvas, topLeft);

        const size = this._map.getSize();
        if (this._canvas.width !== size.x) {
            this._canvas.width = size.x;
        }
        if (this._canvas.height !== size.y) {
            this._canvas.height = size.y;
        }

        this._redraw();
    }

    _cancelFrame() {
        if (this._frame) {
            cancelAnimationFrame(this._frame);
            this._frame = null;
        }
    }

    _redraw() {
        this._cancelFrame();

        const map = this._map;
        const r = this._heat._r;
        const size = map.getSize();
        const maxX = size.x + r;
        const maxY = size.y + r;

        const maxZoom = this.options.maxZoom ?? map.getMaxZoom();
        const v = 1 / 2 ** Math.max(0, Math.min(maxZoom - map.getZoom(), 12));
        const cellSize = r / 2;
        const panePos = map._getMapPanePos();
        const offsetX = panePos.x % cellSize;
        const offsetY = panePos.y % cellSize;

        // cells are [x, y, intensity] with x/y averaged by intensity; data holds the same arrays as the grid
        const grid = [];
        const data = [];

        for (const latlng of this._latlngs) {
            const p = map.latLngToContainerPoint(latlng);
            if (p.x < -r || p.y < -r || p.x > maxX || p.y > maxY) continue;

            const x = Math.floor((p.x - offsetX) / cellSize) + 2;
            const y = Math.floor((p.y - offsetY) / cellSize) + 2;
            const k = (latlng.alt ?? latlng[2] ?? 1) * v;

            const row = grid[y] ??= [];
            const cell = row[x];

            if (!cell) {
                data.push(row[x] = [p.x, p.y, k]);
            } else {
                cell[0] = (cell[0] * cell[2] + p.x * k) / (cell[2] + k);
                cell[1] = (cell[1] * cell[2] + p.y * k) / (cell[2] + k);
                cell[2] += k;
            }
        }

        this._heat.data(data).draw(this.options.minOpacity);
    }

    _animateZoom(e) {
        const scale = this._map.getZoomScale(e.zoom);
        const offset = this._map._getCenterOffset(e.center)._multiplyBy(-scale).subtract(this._map._getMapPanePos());
        L.DomUtil.setTransform(this._canvas, offset, scale);
    }
}

// 1.x keeps defaults on the prototype, and without a copy of its own, mergeOptions would change every L.Layer
if (L.version.startsWith('1.')) {
    HeatLayer.prototype.options = Object.create(L.Layer.prototype.options);
}
HeatLayer.mergeOptions({
    radius: 25,
    blur: 15,
    minOpacity: 0.05,
    max: 1
    // maxZoom falls back to the map's
});
