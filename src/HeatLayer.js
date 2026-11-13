import * as L from 'leaflet';
import SimpleHeat from 'simpleheat';

/** @import {HeatGradient, HeatPoint} from 'simpleheat' */
/** @import {LatLng, LatLngLiteral, LatLngTuple, LayerOptions, MapListeners, Point, ZoomAnimEvent} from 'leaflet' */

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
    // the canvas is drawn at _zoom with its corner at the _origin absolute pixel, set on each moveend and scaled from
    // them during zooms; redraws before the next moveend draw the same way, to match the transformed canvas
    /** @type {number} */
    _zoom;
    /** @type {Point} */
    _origin;
    /** @type {number | null} */
    _frame = null;

    // points projected at zoom 0 as x, y, intensity triples, so that redraws only scale them (CRS transformations
    // are linear in scale); points past _projected are projected on the next redraw, and all after redraw()
    _points = new Float64Array(0);
    _projected = 0;

    // a grid of cells reused between redraws, each an intensity-weighted x and y sum and an intensity sum
    _cells = new Float64Array(0);

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
        this._projected = 0;
        return this._requestRedraw();
    }

    /** Adds a point and redraws. @param {HeatLatLng} latlng */
    addLatLng(latlng) {
        this._latlngs.push(latlng);
        return this._requestRedraw();
    }

    /** Updates options and redraws. @param {HeatLayerOptions} options */
    setOptions(options) {
        L.Util.setOptions(this, options);
        if (this._heat) {
            this._updateOptions();
        }
        return this._requestRedraw();
    }

    /** Bounds of all points. */
    getBounds() {
        return new L.LatLngBounds(this._latlngs);
    }

    /**
     * Redraws on the next animation frame, once however many times it's called before that. Call it after changing
     * points in place, since they're only read again then.
     */
    redraw() {
        this._projected = 0;
        return this._requestRedraw();
    }

    _requestRedraw() {
        if (this._heat && !this._frame && this._map) {
            this._frame = requestAnimationFrame(() => this._redraw());
        }
        return this;
    }

    /** @returns {MapListeners} */
    getEvents() {
        return {moveend: this._reset, zoom: this._onZoom, zoomanim: this._animateZoom};
    }

    onAdd() {
        if (!this._canvas) {
            this._initCanvas();
        }
        this.getPane().appendChild(this._canvas);
        this._projected = 0; // the map may have a different CRS
        this._reset();
    }

    onRemove() {
        this._canvas.remove();
        this._cancelFrame();
    }

    _initCanvas() {
        const canvas = this._canvas = document.createElement('canvas');
        canvas.classList.add('leaflet-heatmap-layer', 'leaflet-layer', 'leaflet-zoom-animated');

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
        const map = this._map;
        const topLeft = map.containerPointToLayerPoint([0, 0]);
        this._zoom = map.getZoom();
        this._origin = map.getPixelOrigin().add(topLeft);
        L.DomUtil.setPosition(this._canvas, topLeft);

        const size = map.getSize();
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
        this._project();

        const map = this._map;
        const r = /** @type {number} */ (this._heat._r);
        const {width, height} = this._canvas;
        const maxX = width + r;
        const maxY = height + r;

        const zoom = this._zoom;
        const maxZoom = this.options.maxZoom ?? map.getMaxZoom();
        const v = 1 / 2 ** Math.max(0, Math.min(maxZoom - zoom, 12));
        const cellSize = r / 2;

        // projected points times scale are absolute pixels at zoom, and minus origin pixels on the canvas, which
        // differs from the view until moveend (e.g. while dragging)
        const scale = map.getZoomScale(zoom, 0);
        const {x: originX, y: originY} = this._origin;

        // cells are aligned to absolute pixels, so that they don't shift as the map is panned
        const offsetX = originX % cellSize;
        const offsetY = originY % cellSize;

        // with -r <= px <= width + r and |offsetX| < cellSize = r / 2, column indices are from 0 to width / cellSize + 6
        const cols = Math.ceil(width / cellSize) + 7;
        const size = 3 * cols * (Math.ceil(height / cellSize) + 7);
        if (this._cells.length < size) {
            this._cells = new Float64Array(size);
        } else {
            this._cells.fill(0, 0, size);
        }
        const cells = this._cells;
        const points = this._points;

        for (let i = 0, n = this._projected * 3; i < n; i += 3) {
            const px = points[i] * scale - originX;
            const py = points[i + 1] * scale - originY;
            if (px < -r || py < -r || px > maxX || py > maxY) continue;

            const c = 3 * ((((py + offsetY) / cellSize + 3) | 0) * cols + (((px + offsetX) / cellSize + 3) | 0));
            const k = points[i + 2];
            cells[c] += px * k;
            cells[c + 1] += py * k;
            cells[c + 2] += k;
        }

        // cells are [x, y, intensity], with x and y averaged by intensity; points with zero intensity add no heat
        /** @type {HeatPoint[]} */
        const data = [];
        for (let c = 0; c < size; c += 3) {
            const k = cells[c + 2];
            if (k) data.push([cells[c] / k, cells[c + 1] / k, k * v]);
        }

        this._heat.data(data).draw(this.options.minOpacity);
    }

    _project() {
        const map = this._map;
        const latlngs = this._latlngs;
        const n = latlngs.length;

        if (n < this._projected) this._projected = 0;
        if (n === this._projected) return;

        // grow by half when points are added, so that adding them one by one doesn't copy all on each redraw
        const capacity = this._points.length / 3;
        if (n > capacity || (this._projected === 0 && n < capacity / 2)) {
            const points = new Float64Array(3 * (this._projected ? Math.max(n, Math.ceil(capacity * 1.5)) : n));
            points.set(this._points.subarray(0, this._projected * 3));
            this._points = points;
        }

        const points = this._points;
        for (let i = this._projected; i < n; i++) {
            const latlng = latlngs[i];
            const p = map.project(latlng, 0);
            points[3 * i] = p.x;
            points[3 * i + 1] = p.y;
            points[3 * i + 2] = (Array.isArray(latlng) ? latlng[2] : latlng.alt) ?? 1;
        }
        this._projected = n;
    }

    // live zooms fire zoom on every frame; CSS zoom animations (Leaflet 1.x and 2.0 betas) fire zoomanim once at
    // the start with the target view, then zoom once at the end, which gives the same transform
    _onZoom() {
        this._updateTransform(this._map.getZoom(), this._map.getPixelOrigin());
    }

    /** @param {ZoomAnimEvent} e */
    _animateZoom(e) {
        // the pixel origin the map will have at the end, rounded as Leaflet does for CSS zoom animations
        const map = this._map;
        const viewHalf = map.getSize().divideBy(2);
        const origin = map.project(e.center, e.zoom).subtract(viewHalf).subtract(map.containerPointToLayerPoint([0, 0]));
        this._updateTransform(e.zoom, origin.round());
    }

    /**
     * Scales the canvas from the zoom it was drawn at (transform-origin 0 0 from leaflet.css) and moves its corner to
     * where it is at the given zoom and pixel origin.
     * @param {number} zoom
     * @param {Point} pixelOrigin
     */
    _updateTransform(zoom, pixelOrigin) {
        const scale = this._map.getZoomScale(zoom, this._zoom);
        L.DomUtil.setTransform(this._canvas, this._origin.multiplyBy(scale).subtract(pixelOrigin), scale);
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
