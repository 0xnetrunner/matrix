import std140 from "./std140.js";
import { loadTexture, loadShaderModule, makeUniformBuffer, makePass } from "./utils.js";

const { mat4, vec3 } = glMatrix;

const rippleTypes = {
	box: 0,
	circle: 1,
};

const cycleStyles = {
	cycleFasterWhenDimmed: 0,
	cycleRandomly: 1,
};

const numVerticesPerQuad = 2 * 3;

export default (context, inputs) => {
	const { config, adapter, device, canvasContext, timeBuffer } = context;

	const assets = [loadTexture(device, config.glyphTexURL), loadShaderModule(device, "shaders/wgsl/rainPass.wgsl")];

	// The volumetric mode multiplies the number of columns
	// to reach the desired density, and then overlaps them
	const volumetric = config.volumetric;
	const density = volumetric && config.effect !== "none" ? config.density : 1;
	const gridSize = [config.numColumns * density, config.numColumns];
	const numCells = gridSize[0] * gridSize[1];

	// The volumetric mode requires us to create a grid of quads,
	// rather than a single quad for our geometry
	const numQuads = volumetric ? numCells : 1;

	// Various effect-related values
	const rippleType = config.rippleTypeName in rippleTypes ? rippleTypes[config.rippleTypeName] : -1;
	const cycleStyle = config.cycleStyleName in cycleStyles ? cycleStyles[config.cycleStyleName] : 0;
	const slantVec = [Math.cos(config.slant), Math.sin(config.slant)];
	const slantScale = 1 / (Math.abs(Math.sin(2 * config.slant)) * (Math.sqrt(2) - 1) + 1);
	const showComputationTexture = config.effect === "none";

	const configData = [
		// common
		{ name: "animationSpeed", type: "f32", value: config.animationSpeed },
		{ name: "glyphSequenceLength", type: "i32", value: config.glyphSequenceLength },
		{ name: "glyphTextureColumns", type: "i32", value: config.glyphTextureColumns },
		{ name: "glyphHeightToWidth", type: "f32", value: config.glyphHeightToWidth },
		{ name: "resurrectingCodeRatio", type: "f32", value: config.resurrectingCodeRatio },
		{ name: "gridSize", type: "vec2<f32>", value: gridSize },
		{ name: "showComputationTexture", type: "i32", value: showComputationTexture },

		// compute
		{ name: "brightnessThreshold", type: "f32", value: config.brightnessThreshold },
		{ name: "brightnessOverride", type: "f32", value: config.brightnessOverride },
		{ name: "brightnessDecay", type: "f32", value: config.brightnessDecay },
		{ name: "cursorEffectThreshold", type: "f32", value: config.cursorEffectThreshold },
		{ name: "cycleSpeed", type: "f32", value: config.cycleSpeed },
		{ name: "cycleFrameSkip", type: "i32", value: config.cycleFrameSkip },
		{ name: "fallSpeed", type: "f32", value: config.fallSpeed },
		{ name: "hasSun", type: "i32", value: config.hasSun },
		{ name: "hasThunder", type: "i32", value: config.hasThunder },
		{ name: "raindropLength", type: "f32", value: config.raindropLength },
		{ name: "rippleScale", type: "f32", value: config.rippleScale },
		{ name: "rippleSpeed", type: "f32", value: config.rippleSpeed },
		{ name: "rippleThickness", type: "f32", value: config.rippleThickness },
		{ name: "cycleStyle", type: "i32", value: cycleStyle },
		{ name: "rippleType", type: "i32", value: rippleType },

		// render
		{ name: "forwardSpeed", type: "f32", value: config.forwardSpeed },
		{ name: "glyphVerticalSpacing", type: "f32", value: config.glyphVerticalSpacing },
		{ name: "glyphEdgeCrop", type: "f32", value: config.glyphEdgeCrop },
		{ name: "isPolar", type: "i32", value: config.isPolar },
		{ name: "density", type: "f32", value: density },
		{ name: "slantScale", type: "f32", value: slantScale },
		{ name: "slantVec", type: "vec2<f32>", value: slantVec },
		{ name: "volumetric", type: "i32", value: volumetric },
	];
	console.table(configData);

	const configLayout = std140(configData.map((field) => field.type));
	const configBuffer = makeUniformBuffer(
		device,
		configLayout,
		configData.map((field) => field.value)
	);

	const sceneLayout = std140(["vec2<f32>", "mat4x4<f32>", "mat4x4<f32>"]);
	const sceneBuffer = makeUniformBuffer(device, sceneLayout);

	const cellsBuffer = device.createBuffer({
		size: numCells * std140(["vec4<f32>"]).size,
		usage: GPUBufferUsage.STORAGE,
	});

	const transform = mat4.create();
	mat4.translate(transform, transform, vec3.fromValues(0, 0, -1));
	const camera = mat4.create();

	const linearSampler = device.createSampler({
		magFilter: "linear",
		minFilter: "linear",
	});

	let rainComputePipeline;
	let rainRenderPipeline;
	let computeBindGroup;
	let renderBindGroup;
	let renderPassConfig;

	const ready = (async () => {
		const [msdfTexture, rainShaderModule] = await Promise.all(assets);

		rainComputePipeline = device.createComputePipeline({
			compute: {
				module: rainShaderModule,
				entryPoint: "computeMain",
			},
		});

		const additiveBlendComponent = {
			operation: "add",
			srcFactor: "one",
			dstFactor: "one",
		};

		const presentationFormat = canvasContext.getPreferredFormat(adapter);

		rainRenderPipeline = device.createRenderPipeline({
			vertex: {
				module: rainShaderModule,
				entryPoint: "vertMain",
			},
			fragment: {
				module: rainShaderModule,
				entryPoint: "fragMain",
				targets: [
					{
						format: presentationFormat,
						blend: {
							color: additiveBlendComponent,
							alpha: additiveBlendComponent,
						},
					},
				],
			},
		});

		computeBindGroup = device.createBindGroup({
			layout: rainComputePipeline.getBindGroupLayout(0),
			entries: [configBuffer, timeBuffer, cellsBuffer]
				.map((resource) => (resource instanceof GPUBuffer ? { buffer: resource } : resource))
				.map((resource, binding) => ({
					binding,
					resource,
				})),
		});

		renderBindGroup = device.createBindGroup({
			layout: rainRenderPipeline.getBindGroupLayout(0),
			entries: [configBuffer, timeBuffer, sceneBuffer, linearSampler, msdfTexture.createView(), cellsBuffer]
				.map((resource) => (resource instanceof GPUBuffer ? { buffer: resource } : resource))
				.map((resource, binding) => ({
					binding,
					resource,
				})),
		});

		renderPassConfig = {
			colorAttachments: [
				{
					view: null,
					loadValue: { r: 0, g: 0, b: 0, a: 1 },
					storeOp: "store",
				},
			],
		};
	})();

	const setSize = (width, height) => {
		const aspectRatio = width / height;
		mat4.perspectiveZO(camera, (Math.PI / 180) * 90, aspectRatio, 0.0001, 1000);
		const screenSize = aspectRatio > 1 ? [1, aspectRatio] : [1 / aspectRatio, 1];
		device.queue.writeBuffer(sceneBuffer, 0, sceneLayout.build([screenSize, camera, transform]));
	};

	const execute = (encoder) => {
		const computePass = encoder.beginComputePass();
		computePass.setPipeline(rainComputePipeline);
		computePass.setBindGroup(0, computeBindGroup);
		computePass.dispatch(Math.ceil(gridSize[0] / 32), gridSize[1], 1);
		computePass.endPass();

		renderPassConfig.colorAttachments[0].view = canvasContext.getCurrentTexture().createView();
		const renderPass = encoder.beginRenderPass(renderPassConfig);
		renderPass.setPipeline(rainRenderPipeline);
		renderPass.setBindGroup(0, renderBindGroup);
		renderPass.draw(numVerticesPerQuad * numQuads, 1, 0, 0);
		renderPass.endPass();
	};

	const outputs = {}; // TODO

	return makePass(outputs, ready, setSize, execute);
};
