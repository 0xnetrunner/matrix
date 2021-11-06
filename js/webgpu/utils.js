const getCanvasSize = (canvas) => {
	const devicePixelRatio = window.devicePixelRatio ?? 1;
	return [canvas.clientWidth * devicePixelRatio, canvas.clientHeight * devicePixelRatio];
};

const loadTexture = async (device, url) => {
	const response = await fetch(url);
	const data = await response.blob();
	const imageBitmap = await createImageBitmap(data);

	const texture = device.createTexture({
		size: [imageBitmap.width, imageBitmap.height, 1],
		format: "rgba8unorm",
		usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
	});

	device.queue.copyExternalImageToTexture(
		{
			source: imageBitmap,
		},
		{
			texture: texture,
		},
		[imageBitmap.width, imageBitmap.height]
	);

	return texture;
};

const makePassFBO = (device, width, height, format = "rgba8unorm") =>
	device.createTexture({
		size: [width, height, 1],
		format,
		usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
		// TODO: whittle these down
	});

const loadShaderModule = async (device, url) => {
	const response = await fetch(url);
	const code = await response.text();
	return device.createShaderModule({ code });
};

const makeUniformBuffer = (device, structLayout, values = null) => {
	const buffer = device.createBuffer({
		size: structLayout.size,
		usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
		mappedAtCreation: values != null,
	});
	if (values != null) {
		structLayout.build(values, buffer.getMappedRange());
		buffer.unmap();
	}
	return buffer;
};

const make1DTexture = (device, rgbas) => {
	const size = [rgbas.length];
	const texture = device.createTexture({
		size,
		// dimension: "1d",
		format: "rgba8unorm",
		usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
	});
	const data = new Uint8ClampedArray(rgbas.map((color) => color.map((f) => f * 0xff)).flat());
	device.queue.writeTexture({ texture }, data, {}, size);
	return texture;
};

const makePass = (ready, setSize, getOutputs, execute) => ({
	ready: ready ?? Promise.resolve(),
	setSize: setSize ?? (() => {}),
	getOutputs: getOutputs ?? (() => ({})),
	execute: execute ?? (() => {}),
});

const makePipeline = (context, steps) =>
	steps.filter((f) => f != null).reduce((pipeline, f, i) => [...pipeline, f(context, i == 0 ? null : pipeline[i - 1].getOutputs)], []);

export { getCanvasSize, makePassFBO, make1DTexture, loadTexture, loadShaderModule, makeUniformBuffer, makePass, makePipeline };
