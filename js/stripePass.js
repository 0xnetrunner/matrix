import { loadText, make1DTexture, makePassFBO, makePass } from "./utils.js";

const transPrideStripeColors = [
	[0.3, 1.0, 1.0],
	[0.3, 1.0, 1.0],
	[1.0, 0.5, 0.8],
	[1.0, 0.5, 0.8],
	[1.0, 1.0, 1.0],
	[1.0, 1.0, 1.0],
	[1.0, 1.0, 1.0],
	[1.0, 0.5, 0.8],
	[1.0, 0.5, 0.8],
	[0.3, 1.0, 1.0],
	[0.3, 1.0, 1.0],
].flat();

const prideStripeColors = [
	[1, 0, 0],
	[1, 0.5, 0],
	[1, 1, 0],
	[0, 1, 0],
	[0, 0, 1],
	[0.8, 0, 1],
].flat();

export default (regl, config, inputs) => {
	const output = makePassFBO(regl, config.useHalfFloat);

	const { backgroundColor } = config;
	const stripeColors =
		"stripeColors" in config ? config.stripeColors.split(",").map(parseFloat) : config.effect === "pride" ? prideStripeColors : transPrideStripeColors;
	const numStripeColors = Math.floor(stripeColors.length / 3);
	const stripes = make1DTexture(
		regl,
		stripeColors.slice(0, numStripeColors * 3).map((f) => Math.floor(f * 0xff))
	);

	const stripePassFrag = loadText("shaders/stripePass.frag");

	const render = regl({
		frag: regl.prop("frag"),

		uniforms: {
			backgroundColor,
			tex: inputs.primary,
			bloomTex: inputs.bloom,
			stripes,
			ditherMagnitude: 0.05,
		},
		framebuffer: output,
	});

	return makePass(
		{
			primary: output,
		},
		() => render({ frag: stripePassFrag.text() }),
		null,
		stripePassFrag.loaded
	);
};
