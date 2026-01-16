// float sdf(vec2 xy) {
//     vec2 p = project(xy, transform);
//     float circleRadius = r * (1.0 - smoothstep(0.8, 1.0, progress));
//     float sdf1 = sdCircle(p + vec2(0, -r), c1, circleRadius);
//     float sdf2 = sdRoundedBox(p - box.xy - box.zw * 0.5, box.zw * 0.5, vec4(r));
//     float k = 20 + 20 * (1.0 - abs(2.0 * progress - 1.0));
//     float d = smin(sdf1, sdf2, k);
//     return d;
//   }
  