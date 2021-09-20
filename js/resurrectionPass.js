import { extractEntries, make1DTexture, makePassFBO, makePass } from "./utils.js";

const colorToRGB = ([hue, saturation, lightness]) => {
  const a = saturation * Math.min(lightness, 1 - lightness);
  const f = (n) => {
    const k = (n + hue * 12) % 12;
    return lightness - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0), f(8), f(4)];
};

export default (regl, config, inputs) => {
  const output = makePassFBO(regl, config.useHalfFloat);

  return makePass(
    {
      primary: output
    },
    regl({
      frag: `
      precision mediump float;
      #define PI 3.14159265359

      uniform sampler2D tex;
      uniform sampler2D bloomTex;
      uniform float ditherMagnitude;
      uniform float time;
      uniform vec3 backgroundColor;
      varying vec2 vUV;

      highp float rand( const in vec2 uv, const in float t ) {
        const highp float a = 12.9898, b = 78.233, c = 43758.5453;
        highp float dt = dot( uv.xy, vec2( a,b ) ), sn = mod( dt, PI );
        return fract(sin(sn) * c + t);
      }

      float rgbComponent(float p, float q, float t) {
        if (t < 0.0) t += 1.0;
        if (t > 1.0) t -= 1.0;
        if (t < 1.0 / 6.0) return p + (q - p) * 6.0 * t;
        if (t < 1.0 / 2.0) return q;
        if (t < 2.0 / 3.0) return p + (q - p) * (2.0 / 3.0 - t) * 6.0;
        return p;
      }

      vec3 hslToRgb(float h, float s, float l){
        float q = l < 0.5 ? l * (1. + s) : l + s - l * s;
        float p = 2.0 * l - q;
        return vec3(
          rgbComponent(p, q, h + 1.0 / 3.0),
          rgbComponent(p, q, h),
          rgbComponent(p, q, h - 1.0 / 3.0)
        );
      }

      void main() {

        vec3 brightness = mix(texture2D( bloomTex, vUV ).rgb, texture2D( tex, vUV ).rgb, (0.7 - length(vUV - 0.5))) * 1.25 - rand( gl_FragCoord.xy, time ) * ditherMagnitude;

        float hue = 0.35 + (length(vUV - vec2(0.5, 1.0)) * -0.4 + 0.2);
        vec3 rgb = hslToRgb(hue, 0.8, max(0., brightness.r)) * vec3(0.8, 1.0, 0.7);
        vec3 resurrectionRGB = hslToRgb(0.13, 1.0, max(0., brightness.g) * 0.5);
        gl_FragColor = vec4(rgb + resurrectionRGB + backgroundColor, 1.0);
      }
    `,

      uniforms: {
        ...extractEntries(config, [
          "backgroundColor",
        ]),
        tex: inputs.primary,
        bloomTex: inputs.bloom,
        ditherMagnitude: 0.05
      },
      framebuffer: output
    })
  );
};
