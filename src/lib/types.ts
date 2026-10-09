export interface BBox {
	minLng: number;
	minLat: number;
	maxLng: number;
	maxLat: number;
}

export type ObjectKind = 'building' | 'road' | 'water' | 'green' | 'map';

/**
 * Identifying + tag info carried by every clickable map object. The info
 * drawer and the SQLite export both read from this single source. The
 * synthetic 'map' object (ground click) uses osmType 'map' / osmId 0.
 */
export interface MapObjectBase {
	id: string; // `${osmType}/${osmId}`, or 'map'
	osmType: 'way' | 'relation' | 'map';
	osmId: number;
	kind: ObjectKind;
	tags: Record<string, string>;
	name: string | null;
}

/** A drawn selection area: a rectangle (click-drag box) or a freeform polygon. */
export type Area =
	| { type: 'bbox'; bbox: BBox }
	| { type: 'polygon'; ring: [number, number][] };
