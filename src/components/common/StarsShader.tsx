import { Rect, Shader, Skia, useClock, vec } from "@shopify/react-native-skia";
import { useDerivedValue } from "react-native-reanimated";

const source = Skia.RuntimeEffect.Make(`
  uniform float2 resolution;
  uniform float time;

  // Tweaks
  const float sprinkleSpeed = 1.2;
  const float densityMultiplier = 0.5;
  const float maximumDensity = 0.02;

  // Hash function
  float hash12(float2 p) {
    float3 p3 = fract(float3(p.x, p.y, p.x) * 0.1031);
    p3 += dot(p3, float3(p3.y, p3.z, p3.x) + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  half4 main(float2 fragCoord) {
    float2 uv = fragCoord / resolution;

    float d = hash12(fragCoord);

    d = pow(d, 3.0);

    float mult = sin(sprinkleSpeed * time + fragCoord.x + fragCoord.y) + 1.0;
    mult *= 0.5;

    d = smoothstep(1.0 - maximumDensity * densityMultiplier, 1.0, d) * mult;

    return half4(half3(d), 1.0);
  }
`)!

export default function StarsShader({
  width,
  height,
}: {
  width: number;
  height: number;
}) {
  // useClock returns a shared value that updates on UI thread - no JS re-renders
  const clock = useClock();

  // Convert clock (ms) to seconds and wrap in derived value for Skia
  const uniforms = useDerivedValue(() => ({
    resolution: vec(width, height),
    time: clock.value / 1000,
  }));

  return (
    <Rect x={0} y={0} width={width} height={height}>
      <Shader source={source} uniforms={uniforms} />
    </Rect>
  );
}
