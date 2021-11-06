import std140 from "./std140.js";
import { loadShaderModule, makeUniformBuffer, makePassFBO, makePass } from "./utils.js";

// Matrix Resurrections isn't in theaters yet,
// and this version of the effect is still a WIP.

// Criteria:
// Upward-flowing glyphs should be golden
// Downward-flowing glyphs should be tinted slightly blue on top and golden on the bottom
// Cheat a lens blur, interpolating between the texture and bloom at the edges

const numVerticesPerQuad = 2 * 3;

export default (context, getInputs) => {
	const { config, adapter, device, canvasContext, timeBuffer } = context;
	const ditherMagnitude = 0.05;

	const configLayout = std140(["f32", "vec3<f32>"]);
	const configBuffer = makeUniformBuffer(device, configLayout, [ditherMagnitude, config.backgroundColor]);

	const linearSampler = device.createSampler({
		magFilter: "linear",
		minFilter: "linear",
	});

	const renderPassConfig = {
		colorAttachments: [
			{
				view: null,
				loadValue: { r: 0, g: 0, b: 0, a: 1 },
				storeOp: "store",
			},
		],
	};

	const presentationFormat = canvasContext.getPreferredFormat(adapter);

	let renderPipeline;
	let output;

	const assets = [loadShaderModule(device, "shaders/wgsl/resurrectionPass.wgsl")];

	const ready = (async () => {
		const [rainShader] = await Promise.all(assets);

		renderPipeline = device.createRenderPipeline({
			vertex: {
				module: rainShader,
				entryPoint: "vertMain",
			},
			fragment: {
				module: rainShader,
				entryPoint: "fragMain",
				targets: [
					{
						format: presentationFormat,
					},
				],
			},
		});
	})();

	const setSize = (width, height) => {
		output?.destroy();
		output = makePassFBO(device, width, height, presentationFormat);
	};

	const getOutputs = () => ({
		primary: output,
	});

	const execute = (encoder) => {
		const inputs = getInputs();
		const tex = inputs.primary;
		const bloomTex = inputs.primary; // TODO: bloom
		const renderBindGroup = device.createBindGroup({
			layout: renderPipeline.getBindGroupLayout(0),
			entries: [configBuffer, timeBuffer, linearSampler, tex.createView(), bloomTex.createView()]
				.map((resource) => (resource instanceof GPUBuffer ? { buffer: resource } : resource))
				.map((resource, binding) => ({
					binding,
					resource,
				})),
		});

		renderPassConfig.colorAttachments[0].view = output.createView();
		const renderPass = encoder.beginRenderPass(renderPassConfig);
		renderPass.setPipeline(renderPipeline);
		renderPass.setBindGroup(0, renderBindGroup);
		renderPass.draw(numVerticesPerQuad, 1, 0, 0);
		renderPass.endPass();
	};

	return makePass(ready, setSize, getOutputs, execute);
};
