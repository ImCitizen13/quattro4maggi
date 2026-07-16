
// utils/svgPathExtractor.ts
export function extractPathsFromSvg(svg: string): string {
  const paths: string[] = [];
  const regex = /<path[^>]*d="([^"]+)"/g;
  let match;
  while ((match = regex.exec(svg))) {
    paths.push(match[1]);
  }
  // Combine all paths into one
  return paths.join(" ");
}
