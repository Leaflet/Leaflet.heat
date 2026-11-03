import * as L from 'leaflet';
import SimpleHeat from 'simpleheat';

/** @import {HeatGradient, HeatPoint} from 'simpleheat' */
/** @import {LatLng, LatLngLiteral, LatLngTuple, LayerOptions, MapListeners, ZoomAnimEvent} from 'leaflet' */

/**
 * @typedef {object} HeatLayerProps
 * @property {number} radius Radius of each point, in pixels.
 * @property {number} blur Blur around each point, in pixels.
 * @property {number} minOpacity Opacity the heatmap starts at.
 * @property {number} max Cell intensity that maps to the end of the gradient.
 * @property {number} [maxZoom] Zoom at which points reach full intensity; the map's `maxZoom` if not set.
 * @property {HeatGradient} [gradient] Color stops in the 0..1 range, e.g. `{0.4: 'blue', 0.65: 'lime', 1: 'red'}`.
 */

/** @typedef {LayerOptions & Partial<HeatLayerProps>} HeatLayerOptions */

/**
 * A point, with its intensity (1 if not set) in `alt` or the third array element.
 * @typedef {LatLng | LatLngLiteral | LatLngTuple} HeatLatLng
 */

/**
 * A heatmap layer drawn on a single canvas that covers the map view.
 * @extends {L.Layer<HeatLayerOptions & HeatLayerProps>}
 */
export class HeatLayer extends L.Layer {
    // both created on the first onAdd
    /** @type {HTMLCanvasElement} */
    _canvas;
    /** @type {SimpleHeat} */
    _heat;
    /** @type {number | null} */
    _frame = null;

    /**
     * @param {HeatLatLng[]} latlngs
     * @param {HeatLayerOptions} [options]
     */
    constructor(latlngs, options) {
        super();
        this._latlngs = latlngs;
        L.Util.setOptions(this, options);
    }

    /** Replaces the points and redraws. @param {HeatLatLng[]} latlngs */
    setLatLngs(latlngs) {
        this._latlngs = latlngs;
        return this.redraw();
    }

    /** Adds a point and redraws. @param {HeatLatLng} latlng */
    addLatLng(latlng) {
        this._latlngs.push(latlng);
        return this.redraw();
    }

    /** Updates options and redraws. @param {HeatLayerOptions} options */
    setOptions(options) {
        L.Util.setOptions(this, options);
        if (this._heat) {
            this._updateOptions();
        }
        return this.redraw();
    }

    /** Bounds of all points. */
    getBounds() {
        return new L.LatLngBounds(this._latlngs);
    }

    /** Redraws on the next animation frame, once however many times it's called before that. */
    redraw() {
        if (this._heat && !this._frame && this._map) {
            this._frame = requestAnimationFrame(() => this._redraw());
        }
        return this;
    }

    getEvents() {
        /** @type {MapListeners} */
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
        const r = /** @type {number} */ (this._heat._r);
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
        /** @type {HeatPoint[][]} */
        const grid = [];
        /** @type {HeatPoint[]} */
        const data = [];

        for (const latlng of this._latlngs) {
            const p = map.latLngToContainerPoint(latlng);
            if (p.x < -r || p.y < -r || p.x > maxX || p.y > maxY) continue;

            const x = Math.floor((p.x - offsetX) / cellSize) + 2;
            const y = Math.floor((p.y - offsetY) / cellSize) + 2;
            const k = ((Array.isArray(latlng) ? latlng[2] : latlng.alt) ?? 1) * v;

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

    /** @param {ZoomAnimEvent} e */
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
