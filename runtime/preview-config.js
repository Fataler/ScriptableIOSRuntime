/** Logical widget sizes (Scriptable canvas points). */
export const PREVIEW_LOGICAL_SIZES = {
  micro: { w: 76, h: 76 },
  mini: { w: 320, h: 320 },
  medium: { w: 680, h: 320 },
  large: { w: 680, h: 680 }
};

/** Match iPhone @3x home-screen widgets in preview. */
export const PREVIEW_DEVICE_PIXEL_RATIO = 3;

/**
 * Browser canvas text metrics are usually a bit more optimistic than real
 * Scriptable-on-iPhone rendering, especially for bold/heavy Cyrillic text.
 * Keep preview slightly conservative so layouts fail earlier locally.
 */
export const PREVIEW_TEXT_METRICS = {
  lineHeightMultiplier: 1.24,
  widthMultiplier: 1.05,
  weightWidthMultiplier: {
    regular: 1,
    medium: 1.01,
    bold: 1.03,
    heavy: 1.05
  },
  emojiWidthMultiplier: 1.08
};

export const SIZE_TO_WIDGET_FAMILY = {
  micro: "accessoryCircular",
  mini: "small",
  medium: "medium",
  large: "large"
};

export const WIDGET_FAMILY_TO_SIZE = {
  accessoryCircular: "micro",
  accessoryInline: "micro",
  small: "mini",
  medium: "medium",
  large: "large"
};

export function widgetFamilyForSize(size) {
  return SIZE_TO_WIDGET_FAMILY[size] ?? "medium";
}

export function widgetSizeForFamily(family, allowedSizes = ["micro", "mini", "medium", "large"]) {
  const preferred = WIDGET_FAMILY_TO_SIZE[family] ?? "medium";
  if (allowedSizes.includes(preferred)) return preferred;
  if (family === "accessoryCircular" || family === "accessoryInline") {
    return allowedSizes.includes("micro") ? "micro" : allowedSizes[0];
  }
  return allowedSizes.includes("medium") ? "medium" : allowedSizes[0];
}
