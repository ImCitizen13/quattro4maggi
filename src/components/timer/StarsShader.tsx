import { useEffect, useState } from "react";
import { Rect, Shader, Skia, vec } from "@shopify/react-native-skia";

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
  const [time, setTime] = useState(0);

  useEffect(() => {
    let startTime = Date.now();
    let animationFrameId: number;

    const animate = () => {
      const currentTime = (Date.now() - startTime) / 1000;
      setTime(currentTime);
      animationFrameId = requestAnimationFrame(animate);
    };

    animationFrameId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <Rect x={0} y={0} width={width} height={height}>
      <Shader
        source={source}
        uniforms={{
          resolution: vec(width, height),
          time: time,
        }}
      />
    </Rect>
  );
}
