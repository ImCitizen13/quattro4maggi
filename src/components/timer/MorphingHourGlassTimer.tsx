import {
  Canvas,
  Fill,
  Group,
  Paint,
  Path,
  RuntimeShader,
  Shader,
  Skia,
  Text as SKText,
  useFont,
} from "@shopify/react-native-skia";
import { Stack } from "expo-router";
import React, { useMemo } from "react";
import {
  PixelRatio,
  StyleSheet,
  useColorScheme,
  useWindowDimensions,
  View,
} from "react-native";
import {
  Gesture,
  GestureDetector,
  GestureUpdateEvent,
  PanGestureHandlerEventPayload,
} from "react-native-gesture-handler";
import {
  cancelAnimation,
  clamp,
  interpolate,
  ReduceMotion,
  useAnimatedReaction,
  useDerivedValue,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { BGSHADER } from "./BGTailwindShader";
import { BShader, DEFAULT_PRISM_COLORS } from "./BShader";
import BubbleGenerator from "./BubbleGenerator";
import { DissolveShader } from "./DissolveShader";

const BUBBLE_RADIUS = 200;
const FONT_SIZE = 32;
const SPRING_SNAP_PROPS = {
  stiffness: 550,
  damping: 140,
  mass: 9,
  overshootClamping: undefined,
  energyThreshold: 6e-9,
  velocity: -300,
  reduceMotion: ReduceMotion.System,
};

// Smooth follow spring — high stiffness + damping for responsive but not jerky tracking
const SPRING_FOLLOW_PROPS = {
  stiffness: 300,
  damping: 30,
  mass: 1,
  reduceMotion: ReduceMotion.System,
};
// Background color (RGB 0-1) — change this to control the bubble/canvas bg
// const TEXT = "It's Me"; //Who likes to \n build UI";
// const TEXT_2 = "MEltohamy";
// const TEXT_3 = "I like to build UI";
const TEXT = "Hi There.";
const TEXT_3 = "I like to build stuff.";
const TEXT_GAP = 15; // vertical spacing between text lines
const MORPH_DELAY_MS = 2000; // pause before morphing to next text
const MORPH_DURATION_MS = 1000; // morph animation duration

// SVG viewBox dimensions — used to scale paths to match FONT_SIZE
const ENGLISH_SVG_HEIGHT = 32;
const ENGLISH_SVG_WIDTH = 234;
const ENGLISH_PATH_SCALE = FONT_SIZE / ENGLISH_SVG_HEIGHT; // 1.0
const ENGLISH_SCALED_WIDTH = ENGLISH_SVG_WIDTH * ENGLISH_PATH_SCALE;

const ARABIC_SVG_HEIGHT = 43;
const ARABIC_SVG_WIDTH = 119;
const ARABIC_PATH_SCALE = FONT_SIZE / ARABIC_SVG_HEIGHT; // ≈ 0.74
const ARABIC_SCALED_WIDTH = ARABIC_SVG_WIDTH * ARABIC_PATH_SCALE;

// Dissolve edge glow color (warm gold)
const DISSOLVE_EDGE_COLOR = [0.0, 0.0, 0.0] as const;

// SVG path data for name morph animation
const ENGLISH_NAME_PATH =
  "M-0.00019908 24.032V20.832H3.6158V4.83198H-0.00019908V1.63198H10.6878V4.83198H7.0718V20.832H10.6878V24.032H-0.00019908ZM14.8331 8.83198L13.6171 7.35998C14.4491 6.97598 15.1317 6.53865 15.6651 6.04798C16.1984 5.55731 16.4651 5.13065 16.4651 4.76798C16.4651 4.49065 16.3477 4.24532 16.1131 4.03198C15.8784 3.79731 15.6651 3.60531 15.4731 3.45598C15.0037 3.07198 14.6837 2.75198 14.5131 2.49598C14.3637 2.23998 14.2891 1.97331 14.2891 1.69598C14.2891 1.18398 14.4704 0.778647 14.8331 0.47998C15.1957 0.159981 15.6651 -1.90735e-05 16.2411 -1.90735e-05C16.8384 -1.90735e-05 17.3717 0.159981 17.8411 0.47998C18.3317 0.778647 18.7157 1.19465 18.9931 1.72798C19.2704 2.26131 19.4091 2.89065 19.4091 3.61598C19.4091 4.17065 19.2917 4.71465 19.0571 5.24798C18.8224 5.78131 18.4917 6.28265 18.0651 6.75198C17.6597 7.22132 17.1797 7.63732 16.6251 7.99998C16.0704 8.36265 15.4731 8.63998 14.8331 8.83198ZM21.9671 24.032V7.23198H25.2951V10.816L24.6871 11.2C24.8577 10.6453 25.1244 10.112 25.4871 9.59998C25.8711 9.08798 26.3297 8.63998 26.8631 8.25598C27.4177 7.85065 28.0044 7.53065 28.6231 7.29598C29.2631 7.06131 29.9137 6.94398 30.5751 6.94398C31.5351 6.94398 32.3777 7.10398 33.1031 7.42398C33.8284 7.74398 34.4257 8.22398 34.8951 8.86398C35.3644 9.50398 35.7057 10.304 35.9191 11.264L35.4071 11.136L35.6311 10.592C35.8657 10.1013 36.1857 9.64265 36.5911 9.21598C37.0177 8.76798 37.4977 8.37332 38.0311 8.03198C38.5644 7.69065 39.1297 7.42398 39.7271 7.23198C40.3244 7.03998 40.9111 6.94398 41.4871 6.94398C42.7457 6.94398 43.7804 7.19998 44.5911 7.71198C45.4231 8.22398 46.0417 9.00265 46.4471 10.048C46.8737 11.0933 47.0871 12.3946 47.0871 13.952V24.032H43.7591V14.144C43.7591 13.184 43.6311 12.4053 43.3751 11.808C43.1404 11.1893 42.7777 10.7306 42.2871 10.432C41.7964 10.1333 41.1671 9.98398 40.3991 9.98398C39.8017 9.98398 39.2364 10.0906 38.7031 10.304C38.1911 10.496 37.7431 10.7733 37.3591 11.136C36.9751 11.4986 36.6764 11.9253 36.4631 12.416C36.2497 12.8853 36.1431 13.408 36.1431 13.984V24.032H32.8151V14.08C32.8151 13.2053 32.6871 12.4693 32.4311 11.872C32.1751 11.2533 31.8017 10.784 31.3111 10.464C30.8204 10.144 30.2231 9.98398 29.5191 9.98398C28.9217 9.98398 28.3671 10.0906 27.8551 10.304C27.3431 10.496 26.8951 10.7733 26.5111 11.136C26.1271 11.4773 25.8284 11.8933 25.6151 12.384C25.4017 12.8533 25.2951 13.3653 25.2951 13.92V24.032H21.9671ZM61.3006 24.032V1.63198H64.6926L72.8526 14.912L71.2206 14.88L79.4766 1.63198H82.6766V24.032H79.2206V14.848C79.2206 12.928 79.2632 11.2 79.3486 9.66398C79.4552 8.12798 79.6259 6.60265 79.8606 5.08798L80.3086 6.27198L72.9806 17.6H70.8686L63.7646 6.39998L64.1166 5.08798C64.3512 6.51731 64.5112 7.98931 64.5966 9.50398C64.7032 10.9973 64.7566 12.7786 64.7566 14.848V24.032H61.3006ZM95.9648 24.352C94.2368 24.352 92.7008 23.9893 91.3568 23.264C90.0341 22.5173 88.9888 21.504 88.2208 20.224C87.4741 18.944 87.1008 17.472 87.1008 15.808C87.1008 14.4853 87.3141 13.28 87.7408 12.192C88.1675 11.104 88.7541 10.1653 89.5008 9.37598C90.2688 8.56531 91.1755 7.94665 92.2208 7.51998C93.2875 7.07198 94.4395 6.84798 95.6768 6.84798C96.7648 6.84798 97.7781 7.06132 98.7168 7.48798C99.6555 7.89331 100.466 8.45865 101.149 9.18398C101.853 9.90932 102.386 10.7733 102.749 11.776C103.133 12.7573 103.314 13.8346 103.293 15.008L103.261 16.416H89.5328L88.7968 13.792H100.413L99.9328 14.336V13.568C99.8688 12.864 99.6341 12.2346 99.2288 11.68C98.8235 11.1253 98.3115 10.688 97.6928 10.368C97.0741 10.048 96.4021 9.88798 95.6768 9.88798C94.5248 9.88798 93.5541 10.112 92.7648 10.56C91.9755 10.9866 91.3781 11.6266 90.9728 12.48C90.5675 13.312 90.3648 14.3466 90.3648 15.584C90.3648 16.7573 90.6101 17.7813 91.1008 18.656C91.5915 19.5093 92.2848 20.1706 93.1808 20.64C94.0768 21.1093 95.1115 21.344 96.2848 21.344C97.1168 21.344 97.8848 21.2053 98.5888 20.928C99.3141 20.6506 100.093 20.1493 100.925 19.424L102.589 21.76C102.077 22.272 101.447 22.72 100.701 23.104C99.9755 23.488 99.1968 23.7973 98.3648 24.032C97.5541 24.2453 96.7541 24.352 95.9648 24.352ZM106.939 24.032V0.351982H110.235V24.032H106.939ZM119.182 24.032V4.95998H112.91V1.63198H129.102V4.95998H122.638V24.032H119.182ZM136.896 24.352C135.253 24.352 133.781 23.9786 132.48 23.232C131.2 22.464 130.186 21.4293 129.44 20.128C128.693 18.8053 128.32 17.3013 128.32 15.616C128.32 13.9306 128.693 12.4373 129.44 11.136C130.186 9.81331 131.2 8.77865 132.48 8.03198C133.781 7.26398 135.253 6.87998 136.896 6.87998C138.517 6.87998 139.968 7.26398 141.248 8.03198C142.549 8.77865 143.573 9.81331 144.32 11.136C145.066 12.4373 145.44 13.9306 145.44 15.616C145.44 17.3013 145.066 18.8053 144.32 20.128C143.573 21.4293 142.549 22.464 141.248 23.232C139.968 23.9786 138.517 24.352 136.896 24.352ZM136.896 21.344C137.898 21.344 138.794 21.0986 139.584 20.608C140.373 20.096 140.992 19.4133 141.44 18.56C141.888 17.6853 142.101 16.704 142.08 15.616C142.101 14.5066 141.888 13.5253 141.44 12.672C140.992 11.7973 140.373 11.1146 139.584 10.624C138.794 10.1333 137.898 9.88798 136.896 9.88798C135.893 9.88798 134.986 10.144 134.176 10.656C133.386 11.1466 132.768 11.8293 132.32 12.704C131.872 13.5573 131.658 14.528 131.68 15.616C131.658 16.704 131.872 17.6853 132.32 18.56C132.768 19.4133 133.386 20.096 134.176 20.608C134.986 21.0986 135.893 21.344 136.896 21.344ZM149.031 24.032V0.351982H152.327V10.688L151.751 11.072C151.964 10.3253 152.38 9.64265 152.999 9.02398C153.618 8.38398 154.354 7.87198 155.207 7.48798C156.06 7.08265 156.935 6.87998 157.831 6.87998C159.111 6.87998 160.178 7.13598 161.031 7.64798C161.884 8.13865 162.524 8.89598 162.951 9.91998C163.378 10.944 163.591 12.2346 163.591 13.792V24.032H160.295V14.016C160.295 13.056 160.167 12.2666 159.911 11.648C159.655 11.008 159.26 10.5493 158.727 10.272C158.194 9.97331 157.532 9.84531 156.743 9.88798C156.103 9.88798 155.516 9.99465 154.983 10.208C154.45 10.4 153.98 10.6773 153.575 11.04C153.191 11.4026 152.882 11.8293 152.647 12.32C152.434 12.7893 152.327 13.3013 152.327 13.856V24.032H150.695C150.418 24.032 150.14 24.032 149.863 24.032C149.586 24.032 149.308 24.032 149.031 24.032ZM174.526 24.352C173.14 24.352 171.87 23.968 170.718 23.2C169.588 22.432 168.681 21.3866 167.998 20.064C167.316 18.7413 166.974 17.248 166.974 15.584C166.974 13.8986 167.316 12.4053 167.998 11.104C168.702 9.78132 169.641 8.74665 170.814 7.99998C172.009 7.25331 173.342 6.87998 174.814 6.87998C175.689 6.87998 176.489 7.00798 177.214 7.26398C177.94 7.51998 178.569 7.88265 179.102 8.35198C179.657 8.79998 180.105 9.32265 180.446 9.91998C180.809 10.5173 181.033 11.1573 181.118 11.84L180.382 11.584V7.23198H183.71V24.032H180.382V20.032L181.15 19.808C181.022 20.384 180.756 20.9493 180.35 21.504C179.966 22.0373 179.465 22.5173 178.846 22.944C178.249 23.3706 177.577 23.712 176.83 23.968C176.105 24.224 175.337 24.352 174.526 24.352ZM175.39 21.312C176.393 21.312 177.278 21.0666 178.046 20.576C178.814 20.0853 179.412 19.4133 179.838 18.56C180.286 17.6853 180.51 16.6933 180.51 15.584C180.51 14.496 180.286 13.5253 179.838 12.672C179.412 11.8186 178.814 11.1466 178.046 10.656C177.278 10.1653 176.393 9.91998 175.39 9.91998C174.409 9.91998 173.534 10.1653 172.766 10.656C172.02 11.1466 171.422 11.8186 170.974 12.672C170.548 13.5253 170.334 14.496 170.334 15.584C170.334 16.6933 170.548 17.6853 170.974 18.56C171.422 19.4133 172.02 20.0853 172.766 20.576C173.534 21.0666 174.409 21.312 175.39 21.312ZM188.248 24.032V7.23198H191.576V10.816L190.968 11.2C191.139 10.6453 191.406 10.112 191.768 9.59998C192.152 9.08798 192.611 8.63998 193.144 8.25598C193.699 7.85065 194.286 7.53065 194.904 7.29598C195.544 7.06131 196.195 6.94398 196.856 6.94398C197.816 6.94398 198.659 7.10398 199.384 7.42398C200.11 7.74398 200.707 8.22398 201.176 8.86398C201.646 9.50398 201.987 10.304 202.2 11.264L201.688 11.136L201.912 10.592C202.147 10.1013 202.467 9.64265 202.872 9.21598C203.299 8.76798 203.779 8.37332 204.312 8.03198C204.846 7.69065 205.411 7.42398 206.008 7.23198C206.606 7.03998 207.192 6.94398 207.768 6.94398C209.027 6.94398 210.062 7.19998 210.872 7.71198C211.704 8.22398 212.323 9.00265 212.728 10.048C213.155 11.0933 213.368 12.3946 213.368 13.952V24.032H210.04V14.144C210.04 13.184 209.912 12.4053 209.656 11.808C209.422 11.1893 209.059 10.7306 208.568 10.432C208.078 10.1333 207.448 9.98398 206.68 9.98398C206.083 9.98398 205.518 10.0906 204.984 10.304C204.472 10.496 204.024 10.7733 203.64 11.136C203.256 11.4986 202.958 11.9253 202.744 12.416C202.531 12.8853 202.424 13.408 202.424 13.984V24.032H199.096V14.08C199.096 13.2053 198.968 12.4693 198.712 11.872C198.456 11.2533 198.083 10.784 197.592 10.464C197.102 10.144 196.504 9.98398 195.8 9.98398C195.203 9.98398 194.648 10.0906 194.136 10.304C193.624 10.496 193.176 10.7733 192.792 11.136C192.408 11.4773 192.11 11.8933 191.896 12.384C191.683 12.8533 191.576 13.3653 191.576 13.92V24.032H188.248ZM220.441 31.392L223.833 23.552L223.865 26.176L215.481 7.23198H219.321L224.569 19.584C224.675 19.7973 224.803 20.128 224.953 20.576C225.102 21.0026 225.23 21.4293 225.337 21.856L224.505 22.048C224.675 21.6 224.835 21.152 224.985 20.704C225.155 20.256 225.315 19.808 225.465 19.36L229.849 7.23198H233.753L226.841 24.032L223.993 31.392H220.441Z";
const ARABIC_NAME_PATH =
  "M9.51652 35.048L3.37252 36.2L5.29252 32.392L11.4365 31.24L9.51652 35.048ZM4.31977 15.28C4.42644 15.28 4.47977 15.312 4.47977 15.376C4.47977 15.4187 4.46911 15.4613 4.44777 15.504C4.10644 16.208 3.69044 17.008 3.19977 17.904C2.70911 18.8 2.33577 19.664 2.07977 20.496C1.97311 20.8373 1.88777 21.1893 1.82377 21.552C1.78111 21.9147 1.75977 22.2667 1.75977 22.608C1.75977 23.5467 1.99444 24.304 2.46377 24.88C2.95444 25.4347 3.60511 25.84 4.41577 26.096C5.24777 26.352 6.16511 26.48 7.16777 26.48C7.59444 26.48 8.01044 26.4693 8.41577 26.448C8.84244 26.4053 9.25844 26.3413 9.66377 26.256C12.1384 25.808 14.4104 24.9227 16.4798 23.6C15.4131 23.5147 14.4211 23.2693 13.5038 22.864C12.6291 22.48 12.0638 21.8613 11.8078 21.008C11.7438 20.816 11.7118 20.624 11.7118 20.432C11.7118 19.984 11.8184 19.4827 12.0318 18.928C12.3518 18.032 12.7464 17.1893 13.2158 16.4C13.5144 17.3173 14.1118 18.0107 15.0078 18.48C15.9251 18.9493 16.9171 19.2587 17.9838 19.408C18.4531 19.472 18.8478 19.6747 19.1678 20.016C19.4878 20.3573 19.6478 20.7733 19.6478 21.264C19.6478 21.84 19.3918 22.512 18.8798 23.28C18.3891 24.048 17.7384 24.816 16.9278 25.584C16.1171 26.3307 15.2424 27.024 14.3038 27.664C13.3651 28.304 12.4371 28.848 11.5198 29.296C9.91977 30.0853 8.33044 30.5867 6.75177 30.8C6.53844 30.8213 6.33577 30.8427 6.14377 30.864C5.95177 30.864 5.75977 30.864 5.56777 30.864C5.01311 30.864 4.46911 30.8107 3.93577 30.704C3.42377 30.576 2.93311 30.384 2.46377 30.128C1.56777 29.6373 0.927773 29.0507 0.543773 28.368C0.181107 27.664 -0.000226561 26.7573 -0.000226561 25.648C-0.000226561 25.1573 0.0317734 24.6773 0.0957734 24.208C0.181107 23.7387 0.29844 23.248 0.447773 22.736C0.853107 21.3067 1.45044 19.8987 2.23977 18.512C2.62377 17.8293 2.97577 17.2213 3.29577 16.688C3.61577 16.1547 3.91444 15.7067 4.19177 15.344C4.21311 15.3013 4.25577 15.28 4.31977 15.28ZM19.1663 11.6C18.9103 11.1947 18.9103 10.736 19.1663 10.224C19.4009 9.71201 19.6356 9.18935 19.8703 8.65601C20.1049 8.12268 20.3396 7.58935 20.5743 7.05601C20.7023 6.73601 20.9476 6.46935 21.3103 6.25601C21.6729 6.04268 22.1103 5.95735 22.6223 6.00001L24.4463 6.19201C24.7236 6.21335 24.8836 6.33068 24.9263 6.54401C24.9689 6.73601 24.9689 6.97068 24.9263 7.24801C24.6916 8.46401 24.3716 9.50935 23.9663 10.384C23.5823 11.2373 23.1236 11.9413 22.5903 12.496C21.5663 13.5627 20.4249 14.3733 19.1663 14.928C17.9716 15.4613 16.7556 15.9627 15.5183 16.432C14.3449 16.88 13.3849 17.6907 12.6383 18.864H12.6063L12.0303 18.448C12.4143 17.5307 12.7876 16.72 13.1503 16.016C13.5343 15.312 13.8969 14.6933 14.2383 14.16C14.9423 13.1147 16.4676 12.304 18.8143 11.728L19.1663 11.6ZM27.9288 12.624L29.9448 8.88001L31.1608 27.088L29.1768 30.864L27.9288 12.624ZM36.1305 39.6C35.9385 39.6 35.8212 39.376 35.7785 38.928C35.7359 38.5013 35.7145 38.1387 35.7145 37.84C35.7145 37.648 35.7145 37.4347 35.7145 37.2C35.7359 36.9867 35.7572 36.7627 35.7785 36.528L36.3865 29.104C35.7679 29.2533 35.0105 29.4347 34.1145 29.648C33.2399 29.8613 32.3545 30.0747 31.4585 30.288C30.5839 30.5013 29.8265 30.6933 29.1865 30.864L29.7945 26.672C31.0105 26.5013 32.0879 26.3413 33.0265 26.192C33.9652 26.0427 34.8612 25.8507 35.7145 25.616C36.5679 25.3813 37.4745 25.072 38.4345 24.688C38.4772 24.6667 38.5092 24.656 38.5305 24.656C38.5732 24.6347 38.6052 24.624 38.6265 24.624C38.7119 24.624 38.7545 24.688 38.7545 24.816V24.88L37.4425 34.192L37.6985 33.68L37.1865 38.064C37.1865 38.0853 37.1759 38.1067 37.1545 38.128C37.1545 38.1493 37.1439 38.1813 37.1225 38.224C36.6959 39.1413 36.3652 39.6 36.1305 39.6ZM50.7353 15.048L44.5913 16.2L46.5113 12.392L52.6553 11.24L50.7353 15.048ZM43.3018 27.432C42.4911 28.328 41.7018 29.256 40.9338 30.216C40.1871 31.1973 39.6324 32.1253 39.2698 33C39.0351 33.576 38.7364 34.28 38.3738 35.112C38.0111 35.9653 37.5951 36.8613 37.1258 37.8C36.5071 39.08 36.1018 39.4427 35.9098 38.888C35.7178 38.376 35.6751 37.4373 35.7818 36.072L35.8778 34.856V34.824L37.5738 32.744V32.776L37.4458 33.736L37.7338 33.16C38.3524 31.9013 39.0031 30.6533 39.6858 29.416C40.3898 28.1787 41.1578 27.0267 41.9898 25.96C42.4804 25.3413 43.1204 24.5733 43.9098 23.656C44.3151 23.1867 44.7204 22.7493 45.1258 22.344C45.5524 21.9387 46.0004 21.5653 46.4698 21.224C47.3871 20.5627 48.3364 20.168 49.3178 20.04C50.2564 19.912 51.1311 20.3493 51.9418 21.352L52.1018 21.416L53.1578 21.256L51.1738 25.544C50.9391 25.6293 50.7364 25.6827 50.5658 25.704C50.0111 25.7253 49.6698 25.48 49.5418 24.968C49.1578 24.2 48.5924 23.912 47.8458 24.104C46.9924 24.3387 46.1604 24.7973 45.3498 25.48C44.5604 26.1627 43.8778 26.8133 43.3018 27.432ZM58.6813 20.04C58.6813 18.6107 58.6493 17.32 58.5853 16.168C58.5213 14.9947 58.4466 13.8107 58.3613 12.616C58.2759 11.4 58.1906 10.0133 58.1053 8.45601L60.4733 4.68001L61.0493 15.336C61.0919 15.9547 61.0706 16.5733 60.9853 17.192C60.9213 17.7893 60.8253 18.3227 60.6973 18.792C60.0786 21.224 58.6919 23.016 56.5373 24.168C56.3026 24.296 55.8759 24.4773 55.2573 24.712C54.6386 24.9467 53.9453 25.1813 53.1773 25.416C52.4093 25.6293 51.6519 25.7787 50.9053 25.864L50.9373 25.736L51.6413 21.736C52.5799 21.5867 53.3906 21.4587 54.0733 21.352C54.7773 21.224 55.3639 21.1067 55.8333 21C56.7933 20.7653 57.7426 20.4453 58.6813 20.04ZM63.8975 12.656L66.2655 8.88001L67.1615 22.48L64.7935 26.256L63.8975 12.656ZM71.707 29.2C71.707 28.6027 71.9097 28.1013 72.315 27.696C72.7417 27.2693 73.2537 27.056 73.851 27.056C74.4484 27.056 74.9497 27.2693 75.355 27.696C75.7817 28.1013 75.995 28.6027 75.995 29.2C75.995 29.7973 75.7817 30.3093 75.355 30.736C74.9497 31.1413 74.4484 31.344 73.851 31.344C73.2537 31.344 72.7417 31.1413 72.315 30.736C71.9097 30.3093 71.707 29.7973 71.707 29.2ZM93.4178 15.888C93.1618 17.1467 92.8098 18.192 92.3618 19.024C91.9351 19.8347 91.3698 20.528 90.6658 21.104C89.9831 21.6587 89.1298 22.2027 88.1058 22.736C87.4231 23.0773 86.6551 23.3653 85.8018 23.6C84.9698 23.8347 84.1378 24.0693 83.3058 24.304C82.4951 24.5173 81.7378 24.816 81.0338 25.2C80.6284 25.4133 80.2338 25.7013 79.8498 26.064C79.4658 26.4053 79.3271 26.9173 79.4338 27.6L80.7778 35.952C80.9058 36.9973 80.9271 38.096 80.8418 39.248C80.7564 40.4 80.5858 41.424 80.3298 42.32C80.1378 40.8267 79.8818 39.3653 79.5618 37.936C79.2418 36.528 78.9538 35.1093 78.6978 33.68C78.4631 32.2507 78.3351 30.7573 78.3138 29.2C78.3138 28.0267 78.4311 26.896 78.6658 25.808C78.9004 24.6987 79.2204 23.696 79.6258 22.8C80.1804 21.968 80.9164 21.36 81.8338 20.976C82.7511 20.5707 83.7964 20.208 84.9698 19.888L87.2098 19.312C87.6364 18.3947 87.9671 17.68 88.2018 17.168C88.4364 16.656 88.6284 16.272 88.7778 16.016C88.9271 15.76 89.0551 15.568 89.1618 15.44C89.2684 15.312 89.3964 15.184 89.5458 15.056C89.9084 14.736 90.4098 14.608 91.0498 14.672C91.6898 14.7147 92.2978 14.768 92.8738 14.832C93.1724 14.8533 93.3431 14.9813 93.3858 15.216C93.4498 15.4507 93.4604 15.6747 93.4178 15.888ZM101.398 12.624L103.414 8.88001L104.63 27.088L102.646 30.864L101.398 12.624ZM111.933 16.448C111.507 17.0027 111.069 17.5467 110.621 18.08C110.195 18.6347 109.757 19.1893 109.309 19.744L107.037 17.632L109.661 14.336L111.933 16.448ZM112.287 23.024C112.287 23.4933 112.213 24.0267 112.063 24.624C111.914 25.2 111.701 25.8293 111.423 26.512C110.869 27.9413 110.09 28.9333 109.087 29.488C107.829 30.2133 105.685 30.672 102.655 30.864L103.231 26.576C104.874 26.4907 106.229 26.384 107.295 26.256C108.383 26.1067 109.194 25.936 109.727 25.744C110.837 25.36 111.658 24.432 112.191 22.96L112.287 23.024ZM118.418 1.33514e-05L117.746 1.44001C117.618 1.71735 117.383 1.93068 117.042 2.08001C116.7 2.20801 116.412 2.44268 116.178 2.78401C116.37 2.99735 116.626 3.14668 116.946 3.23201C117.287 3.29601 117.575 3.41335 117.81 3.58401C118.258 3.86135 118.364 4.28801 118.13 4.86401C117.895 5.44001 117.479 5.94135 116.882 6.36801C116.391 6.70935 115.868 6.92268 115.314 7.00801C114.759 7.11468 114.194 7.22135 113.618 7.32801C114.108 7.09335 114.61 6.86935 115.122 6.65601C115.634 6.44268 116.124 6.20801 116.594 5.95201C116.636 5.90935 116.7 5.85601 116.786 5.79201C116.871 5.72801 116.86 5.66401 116.754 5.60001C116.583 5.49335 116.38 5.38668 116.146 5.28001C115.911 5.17335 115.708 5.07735 115.538 4.99201C115.132 4.75735 114.972 4.42668 115.058 4.00001C115.122 3.57335 115.324 3.11468 115.666 2.62401C115.986 2.13335 116.327 1.68535 116.69 1.28001C117.074 0.87468 117.372 0.597347 117.586 0.448013C117.714 0.341347 117.842 0.256013 117.97 0.192013C118.119 0.128013 118.268 0.0640135 118.418 1.33514e-05ZM115.023 12.656L117.391 8.88001L118.287 22.48L115.919 26.256L115.023 12.656Z";

// Pre-create the SkPath objects from SVG path data
const englishPath = Skia.Path.MakeFromSVGString(ENGLISH_NAME_PATH);
const arabicPath = Skia.Path.MakeFromSVGString(ARABIC_NAME_PATH);
export default function MorphingHourGlassTimer() {
  const { width: CANVAS_WIDTH, height: CANVAS_HEIGHT } = useWindowDimensions();
  const isDark = useColorScheme() === "dark";
  const pd = PixelRatio.get();
  const BOTTOM_Y = CANVAS_HEIGHT;
  const CENTER_Y = CANVAS_HEIGHT * 0.4;
  const CENTER_TEXT_Y = CANVAS_HEIGHT * 0.55;
  const BOTTOM_TEXT_Y = CANVAS_HEIGHT;
  const bubbleYPos = useSharedValue(BOTTOM_Y);
  const bubbleXPos = useSharedValue(CANVAS_WIDTH / 2);
  const textMainYPos = useSharedValue(BOTTOM_Y);
  const startY = useSharedValue(BOTTOM_Y);

  // Bubble is in the center
  // const bubbleAtCenter = useDerivedValue(() => {
  //   return bubbleYPos.value === CENTER_Y;
  // });
  const bubbleAtCenter = useSharedValue(false);
  // Font utils
  const font = useFont(
    require("../../assets/fonts/LexendDeca-VariableFont_wght.ttf"),
    FONT_SIZE
  );

  const arabicFont = useFont(
    require("../../assets/fonts/ArefRuqaa-Regular.ttf"),
    FONT_SIZE
  );

  const textX = useDerivedValue(() => {
    const w = font?.measureText(TEXT).width ?? 0;
    return CANVAS_WIDTH / 2 - w / 2;
  });

  // Text opacity: 0 at bottom, fully visible at 30% of bubble travel
  const textOpacity = useDerivedValue(() => {
    const thirtyPercent = BOTTOM_Y - 0.3 * (BOTTOM_Y - CENTER_Y);
    return interpolate(
      bubbleYPos.value,
      [BOTTOM_Y, thirtyPercent],
      [0, 1],
      "clamp"
    );
  });

  // Secondary text: centered X for TEXT_3
  const text3X = useDerivedValue(() => {
    const w = font?.measureText(TEXT_3).width ?? 0;
    return CANVAS_WIDTH / 2 - w / 2;
  });

  // Secondary text Y positions: offset below main text with gap
  const text2YPos = useDerivedValue(
    () => textMainYPos.value + FONT_SIZE + TEXT_GAP
  );

  // Reactive transforms for English and Arabic path Groups
  const englishPathTransform = useDerivedValue(() => [
    { translateX: CANVAS_WIDTH / 2 - ENGLISH_SCALED_WIDTH / 2 },
    { translateY: text2YPos.value },
    { scale: ENGLISH_PATH_SCALE },
  ]);
  const arabicPathTransform = useDerivedValue(() => [
    { translateX: CANVAS_WIDTH / 2 - ARABIC_SCALED_WIDTH / 2 },
    { translateY: text2YPos.value },
    { scale: ARABIC_PATH_SCALE },
  ]);
  const text3YPos = useDerivedValue(
    () => textMainYPos.value + (FONT_SIZE + TEXT_GAP) * 2
  );
  // Secondary text opacity: fades in when bubble is at center, out when it leaves
  const secondaryTextOpacity = useSharedValue(0);
  useAnimatedReaction(
    () => bubbleAtCenter.value,
    (atCenter) => {
      secondaryTextOpacity.value = withTiming(atCenter ? 1 : 0, {
        duration: 700,
      });
    }
  );

  // Dissolve animation: 0 = English visible, 1 = Arabic visible
  const morphProgress = useSharedValue(0);

  // Dissolve shader uniforms — English dissolves OUT, Arabic dissolves IN
  const englishDissolveUniforms = useDerivedValue(() => ({
    uProgress: morphProgress.value,
    uEdgeColor: DISSOLVE_EDGE_COLOR,
  }));
  const arabicDissolveUniforms = useDerivedValue(() => ({
    uProgress: 1 - morphProgress.value,
    uEdgeColor: DISSOLVE_EDGE_COLOR,
  }));

  // Cycling counter — incremented to trigger next morph cycle
  const morphCycleCounter = useSharedValue(0);

  useAnimatedReaction(
    () => morphCycleCounter.value,
    (count, prev) => {
      if (count === prev || count === 0) return;
      // Wait, then morph to Arabic
      morphProgress.value = withDelay(
        MORPH_DELAY_MS,
        withTiming(1, { duration: MORPH_DURATION_MS }, (finished) => {
          if (!finished) return;
          // Wait, then morph back to English
          morphProgress.value = withDelay(
            MORPH_DELAY_MS,
            withTiming(0, { duration: MORPH_DURATION_MS }, (finished2) => {
              if (finished2) morphCycleCounter.value += 1;
            })
          );
        })
      );
    }
  );

  // Start/stop morph cycling based on bubble position
  useAnimatedReaction(
    () => bubbleAtCenter.value,
    (atCenter, prev) => {
      if (atCenter === prev) return;
      if (atCenter) {
        morphProgress.value = 0;
        morphCycleCounter.value = 1;
      } else {
        cancelAnimation(morphProgress);
        morphProgress.value = 0;
        morphCycleCounter.value = 0;
      }
    }
  );

  // Scale radius from 1.0 (at bottom) to 0.75 (at center)
  const bubbleRadius = useDerivedValue(() =>
    interpolate(
      bubbleYPos.value,
      [CENTER_Y, BOTTOM_Y],
      [BUBBLE_RADIUS * 0.25, BUBBLE_RADIUS]
    )
  );

  // Shader uniforms — derived so they update on the UI thread
  // Scaled by pd because the shader Group has transform={[{scale: pd}]}
  // which makes the saveLayer buffer DPR-sized for sharp rendering.
  const shaderUniforms = useDerivedValue(() => ({
    u_resolution: [CANVAS_WIDTH * pd, CANVAS_HEIGHT * pd],
    u_center: [bubbleXPos.value * pd, bubbleYPos.value * pd],
    u_radius: bubbleRadius.value * pd,
    u_refraction: 0.5,
    u_edgeWidth: 0.1,
    u_dispersion: 0.9,
    u_bgColor: isDark ? [0, 0, 0] : [1, 1, 1],
    u_specular: 1,
    u_shadowColor: isDark ? [1, 1, 1] : [0, 0, 0],
    u_shadowOpacity: isDark ? 0.15 : 0.25,
    u_shadowSpread: 0.2,
    ...DEFAULT_PRISM_COLORS,
  }));

  // Dot grid uniforms
  const dotUniforms = {
    uResolution: [CANVAS_WIDTH, CANVAS_HEIGHT],
    uSpacing: 3,
    uRadius: 0.05,
    uColor: isDark ? [1, 1, 1, 0.5] : [0, 0, 0, 0.5],
  };

  const onBeginYPostions = () => {
    "worklet";
    startY.value = bubbleYPos.value;
  };

  const onUpdateYPostions = (
    e: GestureUpdateEvent<PanGestureHandlerEventPayload>
  ) => {
    "worklet";
    const targetY = clamp(startY.value + e.translationY, 0, BOTTOM_Y);
    const targetX = CANVAS_WIDTH / 2 + e.translationX;
    bubbleYPos.value = withSpring(targetY, SPRING_FOLLOW_PROPS);
    bubbleXPos.value = withSpring(targetX, SPRING_FOLLOW_PROPS);
    textMainYPos.value = clamp(
      startY.value + e.translationY,
      CENTER_TEXT_Y,
      BOTTOM_TEXT_Y
    );
  };

  const onEndYPostions = () => {
    "worklet";
    const halfway = (CENTER_Y + BOTTOM_Y) / 2;
    const snapTo = bubbleYPos.value < halfway ? CENTER_Y : BOTTOM_Y;
    const snapTextTo =
      textMainYPos.value < halfway ? CENTER_TEXT_Y : BOTTOM_TEXT_Y;
    bubbleYPos.value = withSpring(snapTo, SPRING_SNAP_PROPS);
    bubbleXPos.value = withSpring(CANVAS_WIDTH / 2, SPRING_SNAP_PROPS);
    bubbleAtCenter.value = snapTo === CENTER_Y;
    textMainYPos.value = withSpring(snapTextTo, {
      stiffness: 900,
      damping: 120,
      mass: 4,
      overshootClamping: false,
      energyThreshold: 6e-9,
      velocity: 0,
      reduceMotion: ReduceMotion.System,
    });
  };

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .onBegin(() => {
          onBeginYPostions();
        })
        .onUpdate((e) => {
          onUpdateYPostions(e);
        })
        .onEnd(() => {
          onEndYPostions();
        }),
    [bubbleYPos, startY]
  );

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      {/* //////////////////////////////////////////////////////////////// */}
      <GestureDetector gesture={panGesture}>
        <Canvas style={styles.skiaCanvas}>
          {/*Main Bubble group */}
          {/* Outer 1/pd scale counteracts the DPR² magnification */}
          <Group transform={[{ scale: 1 / pd }]}>
            {/* Inner pd scale forces saveLayer to allocate a device-resolution buffer */}
            <Group
              transform={[{ scale: pd }]}
              layer={
                // Outer Bubble
                <Paint>
                  <RuntimeShader source={BShader} uniforms={shaderUniforms} />
                </Paint>
              }
            >
              <BubbleGenerator
                lowerBounds={CENTER_Y + 10}
                width={CANVAS_WIDTH}
                startAnimation={bubbleAtCenter}
              />
              {/* Main Text Group */}
              <Group opacity={textOpacity}>
                {/* First line */}
                <SKText
                  antiAlias={true}
                  text={TEXT}
                  font={font}
                  color={isDark ? "rgba(255,255,255,1)" : "rgb(0, 0, 0)"}
                  x={textX}
                  y={textMainYPos}
                />
              </Group>
              {/* Secondary Text Group — fades in when bubble reaches center */}
              <Group opacity={secondaryTextOpacity}>
                {/* Name dissolve: English ↔ Arabic via noise shader */}
                {englishPath && (
                  <Group
                    transform={englishPathTransform}
                    layer={
                      <Paint>
                        <RuntimeShader
                          source={DissolveShader}
                          uniforms={englishDissolveUniforms}
                        />
                      </Paint>
                    }
                  >
                    <Path
                      path={englishPath}
                      color={isDark ? "#fff" : "#000"}
                    />
                  </Group>
                )}
                {arabicPath && (
                  <Group
                    transform={arabicPathTransform}
                    layer={
                      <Paint>
                        <RuntimeShader
                          source={DissolveShader}
                          uniforms={arabicDissolveUniforms}
                        />
                      </Paint>
                    }
                  >
                    <Path
                      path={arabicPath}
                      color={isDark ? "#fff" : "#000"}
                    />
                  </Group>
                )}

                {/* Third Line */}
                <SKText
                  antiAlias={true}
                  text={TEXT_3}
                  font={font}
                  color={isDark ? "rgba(255,255,255,1)" : "rgb(0, 0, 0)"}
                  x={text3X}
                  y={text3YPos}
                />
              </Group>
            </Group>
          </Group>
          {/* Background dots — on top of the magnifier shader */}
          <Fill>
            <Shader source={BGSHADER} uniforms={dotUniforms} />
          </Fill>
        </Canvas>
      </GestureDetector>
      {/* <View style={styles.socialButtonsContainer}>
        <PressableScale
          style={[styles.socialButtons, { backgroundColor: "black" }]}
        >
          <Image
            source={require("../../../assets/icons/x_icon.png")}
            style={{ width: 16, height: 16 }}
            contentFit="cover"
          />
          <Text style={{ color: "white", textAlign: "center" }}>
            Me on X @m090009
          </Text>
        </PressableScale>

        <PressableScale style={styles.socialButtons}>
          <Image source={require("../../../assets/icons/x_icon.png")} />
          <Text style={{ color: isDark ? "white" : "black" }}>
            Me on X @m090009
          </Text>
        </PressableScale>
      </View> */}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: "100%",
  },
  timeText: {
    fontSize: 18,
    fontWeight: "bold",
    fontVariant: ["tabular-nums"],
    textAlign: "center",
  },
  sliderRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 60,
    zIndex: 10,
  },
  sliderLabel: {
    fontSize: 14,
    fontWeight: "600" as const,
  },
  skiaCanvas: {
    position: "absolute",
    width: "100%",
    height: "100%",
    bottom: 0,
    left: 0,
  },
  socialButtonsContainer: {
    gap: 10,
    flexDirection: "column",
    width: "100%",
    position: "absolute",
    bottom: "1%",
    height: 150,
    alignItems: "center",
    justifyContent: "flex-start",
  },
  socialButtons: {
    height: 55,
    flexDirection: "row",
    width: "90%",
    borderRadius: 50,
    justifyContent: "flex-start",
    alignItems: "center",
    paddingHorizontal: "7%",
  },
});
