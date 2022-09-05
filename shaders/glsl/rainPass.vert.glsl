#define PI 3.14159265359
precision lowp float;
attribute vec2 aPosition, aCorner;
uniform sampler2D state;
uniform float density;
uniform vec2 quadSize;
uniform float glyphHeightToWidth, glyphVerticalSpacing;
uniform mat4 camera, transform;
uniform vec2 screenSize;
uniform float time, animationSpeed, forwardSpeed;
uniform bool volumetric;
varying vec2 vUV;
varying vec3 vChannel;
varying vec4 vGlyph;

highp float rand( const in vec2 uv ) {
	const highp float a = 12.9898, b = 78.233, c = 43758.5453;
	highp float dt = dot( uv.xy, vec2( a,b ) ), sn = mod( dt, PI );
	return fract(sin(sn) * c);
}

void main() {

	vUV = (aPosition + aCorner) * quadSize;
	vGlyph = texture2D(state, aPosition * quadSize);

	// Calculate the world space position
	float quadDepth = 0.0;
	if (volumetric) {
		quadDepth = fract(vGlyph.b + time * animationSpeed * forwardSpeed);
		vGlyph.b = quadDepth;
	}
	vec2 position = (aPosition * vec2(1., glyphVerticalSpacing) + aCorner * vec2(density, 1.)) * quadSize;
	vec4 pos = vec4((position - 0.5) * 2.0, quadDepth, 1.0);

	vChannel = vec3(1.0, 0.0, 0.0);

	// Convert the world space position to screen space
	if (volumetric) {
		pos.x /= glyphHeightToWidth;
		pos = camera * transform * pos;
	} else {
		pos.xy *= screenSize;
	}

	gl_Position = pos;
}
