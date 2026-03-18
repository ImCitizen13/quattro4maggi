import { Group, Image, Rect, useImage } from "@shopify/react-native-skia";
import React from "react";
import { StyleSheet } from "react-native";
import { useSharedValue, withSpring } from "react-native-reanimated";
import { imageArray } from "../../../assets/Bubbles/256/images.generated";

const BOTTOM_BOUNDS = 160;
const WIDTH = 100;
const NUMBER_OF_CIRCLES = 17;
const IMAGE_SIZE_MAX = 64;
const IMAGE_SIZE_MIN = 16;
const DURATIONS = [3000, 5000];
const IMAGES = imageArray;



function randomPointInConeUniform(maxWidth: number, height: number) {
//   const r = Math.random();
//   const y = height * (1 - Math.sqrt(r)); // ← this corrects the density
//   const spread = maxWidth * (1 - y / height);
//   const x = (Math.random() * 2 - 1) * spread;

  // AFTER — tip at bottom center, spreads upward
  const r = Math.random();
  const t = Math.sqrt(r); // t=0 at tip, t=1 at top
  const y = height * (1 - t); // y=H at bottom, y=0 at top
  const spread = (maxWidth*0.5) * t; // spread grows as y decreases ← key change
  const x = (maxWidth/2) + (Math.random() * 2 - 1) * spread; // centered on centerX

  return { x, y };
}

function getPointDirection(x: number, y: number){
    
}

export default function BubbleGenerator({
  lowerBounds,
  width,
}: {
  lowerBounds: number;
  width: number;
}) {
  const images = [
    useImage(IMAGES[0]),
    useImage(IMAGES[1]),
    useImage(IMAGES[2]),
    useImage(IMAGES[3]),
    useImage(IMAGES[4]),
    useImage(IMAGES[5]),
    useImage(IMAGES[6]),
    useImage(IMAGES[7]),
    useImage(IMAGES[8]),
    useImage(IMAGES[9]),
    useImage(IMAGES[10]),
    useImage(IMAGES[11]),
    useImage(IMAGES[12]),
    useImage(IMAGES[13]),
    useImage(IMAGES[14]),
    useImage(IMAGES[15]),
    useImage(IMAGES[16]),
    useImage(IMAGES[0]),
    useImage(IMAGES[1]),
    useImage(IMAGES[2]),
    useImage(IMAGES[3]),
    useImage(IMAGES[4]),
    useImage(IMAGES[5]),
    useImage(IMAGES[6]),
    useImage(IMAGES[7]),
    useImage(IMAGES[8]),
    useImage(IMAGES[9]),
    useImage(IMAGES[10]),
    useImage(IMAGES[11]),
    useImage(IMAGES[12]),
    useImage(IMAGES[13]),
    useImage(IMAGES[14]),
    useImage(IMAGES[15]),
    useImage(IMAGES[16]),
    useImage(IMAGES[0]),
    useImage(IMAGES[1]),
    useImage(IMAGES[2]),
    useImage(IMAGES[3]),
    useImage(IMAGES[4]),
    useImage(IMAGES[5]),
    useImage(IMAGES[6]),
    useImage(IMAGES[7]),
    useImage(IMAGES[8]),
    useImage(IMAGES[9]),
    useImage(IMAGES[10]),
    useImage(IMAGES[11]),
    useImage(IMAGES[12]),
    useImage(IMAGES[13]),
    useImage(IMAGES[14]),
    useImage(IMAGES[15]),
    useImage(IMAGES[16]),
    useImage(IMAGES[0]),
    useImage(IMAGES[1]),
    useImage(IMAGES[2]),
    useImage(IMAGES[3]),
    useImage(IMAGES[4]),
    useImage(IMAGES[5]),
    useImage(IMAGES[6]),
    useImage(IMAGES[7]),
    useImage(IMAGES[8]),
    useImage(IMAGES[9]),
    useImage(IMAGES[10]),
    useImage(IMAGES[11]),
    useImage(IMAGES[12]),
    useImage(IMAGES[13]),
    useImage(IMAGES[14]),
    useImage(IMAGES[15]),
    useImage(IMAGES[16]),
  ];

  const centers = [
    useSharedValue(randomPointInConeUniform(width, lowerBounds)),
    useSharedValue(randomPointInConeUniform(width, lowerBounds)),
    useSharedValue(randomPointInConeUniform(width, lowerBounds)),
    useSharedValue(randomPointInConeUniform(width, lowerBounds)),
    useSharedValue(randomPointInConeUniform(width, lowerBounds)),
    useSharedValue(randomPointInConeUniform(width, lowerBounds)),
    useSharedValue(randomPointInConeUniform(width, lowerBounds)),
    useSharedValue(randomPointInConeUniform(width, lowerBounds)),
    useSharedValue(randomPointInConeUniform(width, lowerBounds)),
    useSharedValue(randomPointInConeUniform(width, lowerBounds)),
    useSharedValue(randomPointInConeUniform(width, lowerBounds)),
    useSharedValue(randomPointInConeUniform(width, lowerBounds)),
    useSharedValue(randomPointInConeUniform(width, lowerBounds)),
    useSharedValue(randomPointInConeUniform(width, lowerBounds)),
    useSharedValue(randomPointInConeUniform(width, lowerBounds)),
    useSharedValue(randomPointInConeUniform(width, lowerBounds)),
    useSharedValue(randomPointInConeUniform(width, lowerBounds)),
    useSharedValue(randomPointInConeUniform(width, lowerBounds)),
    useSharedValue(randomPointInConeUniform(width, lowerBounds)),
    useSharedValue(randomPointInConeUniform(width, lowerBounds)),
    useSharedValue(randomPointInConeUniform(width, lowerBounds)),
    useSharedValue(randomPointInConeUniform(width, lowerBounds)),
    useSharedValue(randomPointInConeUniform(width, lowerBounds)),
    useSharedValue(randomPointInConeUniform(width, lowerBounds)),
    useSharedValue(randomPointInConeUniform(width, lowerBounds)),
    useSharedValue(randomPointInConeUniform(width, lowerBounds)),
    useSharedValue(randomPointInConeUniform(width, lowerBounds)),
    useSharedValue(randomPointInConeUniform(width, lowerBounds)),
    useSharedValue(randomPointInConeUniform(width, lowerBounds)),
    useSharedValue(randomPointInConeUniform(width, lowerBounds)),
    useSharedValue(randomPointInConeUniform(width, lowerBounds)),
    useSharedValue(randomPointInConeUniform(width, lowerBounds)),
    useSharedValue(randomPointInConeUniform(width, lowerBounds)),
    useSharedValue(randomPointInConeUniform(width, lowerBounds)),
    useSharedValue(randomPointInConeUniform(width, lowerBounds)),
    useSharedValue(randomPointInConeUniform(width, lowerBounds)),
    useSharedValue(randomPointInConeUniform(width, lowerBounds)),
    useSharedValue(randomPointInConeUniform(width, lowerBounds)),
    useSharedValue(randomPointInConeUniform(width, lowerBounds)),
    useSharedValue(randomPointInConeUniform(width, lowerBounds)),
    useSharedValue(randomPointInConeUniform(width, lowerBounds)),
    useSharedValue(randomPointInConeUniform(width, lowerBounds)),
    useSharedValue(randomPointInConeUniform(width, lowerBounds)),
    useSharedValue(randomPointInConeUniform(width, lowerBounds)),
    useSharedValue(randomPointInConeUniform(width, lowerBounds)),
    useSharedValue(randomPointInConeUniform(width, lowerBounds)),
    useSharedValue(randomPointInConeUniform(width, lowerBounds)),
    useSharedValue(randomPointInConeUniform(width, lowerBounds)),
    useSharedValue(randomPointInConeUniform(width, lowerBounds)),
    useSharedValue(randomPointInConeUniform(width, lowerBounds)),
    useSharedValue(randomPointInConeUniform(width, lowerBounds)),
    useSharedValue(randomPointInConeUniform(width, lowerBounds)),
    useSharedValue(randomPointInConeUniform(width, lowerBounds)),
    useSharedValue(randomPointInConeUniform(width, lowerBounds)),
    useSharedValue(randomPointInConeUniform(width, lowerBounds)),
    useSharedValue(randomPointInConeUniform(width, lowerBounds)),
    useSharedValue(randomPointInConeUniform(width, lowerBounds)),
    useSharedValue(randomPointInConeUniform(width, lowerBounds)),
    useSharedValue(randomPointInConeUniform(width, lowerBounds)),
    useSharedValue(randomPointInConeUniform(width, lowerBounds)),
    useSharedValue(randomPointInConeUniform(width, lowerBounds)),
    useSharedValue(randomPointInConeUniform(width, lowerBounds)),
    useSharedValue(randomPointInConeUniform(width, lowerBounds)),
    useSharedValue(randomPointInConeUniform(width, lowerBounds)),
    useSharedValue(randomPointInConeUniform(width, lowerBounds)),
    useSharedValue(randomPointInConeUniform(width, lowerBounds)),
    useSharedValue(randomPointInConeUniform(width, lowerBounds)),
    useSharedValue(randomPointInConeUniform(width, lowerBounds)),
  ];
//   const centers = 

  const bubbleScales = [
    useSharedValue(0),
    useSharedValue(0),
    useSharedValue(0),
    useSharedValue(0),
    useSharedValue(0),
    useSharedValue(0),
    useSharedValue(0),
    useSharedValue(0),
    useSharedValue(0),
    useSharedValue(0),
    useSharedValue(0),
    useSharedValue(0),
    useSharedValue(0),
    useSharedValue(0),
    useSharedValue(0),
    useSharedValue(0),
    useSharedValue(0),
  ];

  const startAnimation = (index: number) => {
    centers[index].value.y = withSpring(-IMAGE_SIZE_MAX, {
      duration: DURATIONS[1],
      dampingRatio: 1,
    });
  };

  return (
    <Group>
      <Rect width={width} height={lowerBounds} color={"blue"} />
      {images.map((img, idx) => {
        return (
          <Image
            key={idx}
            fit="contain"
            x={centers[idx].value.x}
            y={centers[idx].value.y}
            image={img}
            width={IMAGE_SIZE_MIN}
            height={IMAGE_SIZE_MIN}
          />
        );
      })}
    </Group>
  );
}

const styles = StyleSheet.create({});
