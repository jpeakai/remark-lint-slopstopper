import Color from "colorjs.io";

// WCAG contrast math. Colour parsing,
// conversion and contrast are delegated to colorjs.io, which reads every CSS
// Color Level 4 syntax.

export const wcagRatio = (fg: string, bg: string): number =>
  new Color(fg).contrast(new Color(bg), "WCAG21");

export const alphaOf = (color: string): number =>
  new Color(color).to("srgb").alpha ?? 1;

export function withOpacity(color: string, alpha: string | number): string {
  const value = new Color(color);
  value.alpha = (value.alpha ?? 1) * Number(alpha);
  return value.toString();
}

// A colour in sRGB with any out-of-gamut channel clipped, as a browser paints
// it on an sRGB page.
const inSrgb = (color: string): Color =>
  new Color(color).to("srgb").toGamut({ method: "clip" });

// Simple alpha-over in gamma-encoded sRGB, the model browsers use for opacity.
// A translucent fill has no contrast of its own until the backdrop behind it is
// known, so this resolves it to the box a reader sees. colorjs.io blends it, per
// SLOP-0025: a premultiplied mix in sRGB from the backdrop to the opaque
// foreground, by the foreground's alpha, is alpha-over exactly, its alpha
// fa + ba(1 - fa). Each colour is clipped to sRGB before the blend.
export const compositeOver = (fg: string, bg: string): string => {
  const f = inSrgb(fg);
  const fa = f.alpha ?? 1;
  f.alpha = 1;
  const mixed = Color.mix(inSrgb(bg), f, fa, {
    space: "srgb",
    premultiplied: true,
  });
  // Nothing over nothing leaves no colour to divide the alpha back out of.
  const out = mixed.alpha === 0 ? new Color("srgb", [0, 0, 0], 0) : mixed;
  return out
    .toGamut({ method: "clip" })
    .toString({ format: "hex", collapse: false });
};
