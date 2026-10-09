// Imperative camera API exposed by the 3D viewport to its parent. The parent
// holds the controller object and calls its methods from toolbar buttons;
// ThreeMap populates the methods on mount.
export type PresetName = 'top' | 'iso' | 'low' | 'high' | 'side';

export interface ViewController {
	setPreset?: (p: PresetName) => void;
	/** Azimuth nudge in degrees (around the vertical axis). */
	rotateBy?: (deg: number) => void;
	/** Polar nudge in degrees (toward/away from top-down). */
	tiltBy?: (deg: number) => void;
	/** Return to the default top-down view. */
	reset?: () => void;
}
