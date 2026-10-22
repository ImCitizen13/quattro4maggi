// ============================================================================
// Spike 11a: draw a snapshot texture 1:1 onto the canvas
// ============================================================================
//
// Raw WGSL on purpose: the spike isolates drawElementImageToTexture. The
// particle passes (11c/11d) move to TypeGPU.

const BLIT_WGSL = /* wgsl */ `
@group(0) @binding(0) var snap: texture_2d<f32>;

@vertex
fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  // Full-screen triangle.
  let uv = vec2f(f32((i << 1u) & 2u), f32(i & 2u));
  return vec4f(uv * 2.0 - 1.0, 0.0, 1.0);
}

@fragment
fn fs(@builtin(position) p: vec4f) -> @location(0) vec4f {
  // textureLoad, not a sampler: one canvas pixel = one snapshot texel.
  let dims = vec2i(textureDimensions(snap));
  let xy = clamp(vec2i(p.xy), vec2i(0), dims - 1);
  return textureLoad(snap, xy, 0);
}
`;

export const drawSnapshot = (
  device: GPUDevice,
  context: GPUCanvasContext,
  format: GPUTextureFormat,
  texture: GPUTexture,
) => {
  const module = device.createShaderModule({ code: BLIT_WGSL });
  const pipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: { module, entryPoint: "vs" },
    fragment: { module, entryPoint: "fs", targets: [{ format }] },
    primitive: { topology: "triangle-list" },
  });
  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: texture.createView() }],
  });

  const encoder = device.createCommandEncoder();
  const pass = encoder.beginRenderPass({
    colorAttachments: [
      {
        view: context.getCurrentTexture().createView(),
        clearValue: [0, 0, 0, 0],
        loadOp: "clear",
        storeOp: "store",
      },
    ],
  });
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);
  pass.draw(3);
  pass.end();
  device.queue.submit([encoder.finish()]);
};
