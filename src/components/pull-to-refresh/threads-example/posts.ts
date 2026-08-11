/**
 * Mock feed data for the Threads example.
 *
 * Avatars and media point at deterministic placeholder services (pravatar /
 * picsum) so every run shows the same faces and images. This is demo data —
 * the feed is fixed; the pull-to-refresh lifecycle is what's being shown off.
 */

import type { ThreadPost } from "./ThreadItemView";

const avatar = (seed: number) => `https://i.pravatar.cc/150?img=${seed}`;
const media = (seed: string, w = 600, h = 660) =>
  `https://picsum.photos/seed/${seed}/${w}/${h}`;

export const THREAD_POSTS: ThreadPost[] = [
  {
    author: "longliveai",
    avatar: avatar(12),
    timeAgo: "1d",
    text: "Most people default to ChatGPT for everything. Using the right AI tool for a specific job can make a huge difference.",
    images: [media("writing"), media("coding")],
    reply: {
      author: "dhikaa.gh",
      avatar: avatar(15),
      text: "now codex can compete with claude code bro",
    },
    likes: 1000,
    comments: 13,
    reshares: 123,
    shares: 410,
  },
  {
    author: "thomasterrance1",
    avatar: avatar(33),
    timeAgo: "1d",
    text: "Win before you celebrate.",
    images: [media("timex")],
    likes: 84,
    comments: 4,
    reshares: 2,
    shares: 9,
  },
  {
    author: "skia.labs",
    avatar: avatar(8),
    timeAgo: "3h",
    text: "Shipped a gooey-border metaball shader running at 60fps on device. Fragment fill was the whole cost — supersampling is a luxury you pay for per pixel.",
    reply: {
      author: "gpu.notes",
      avatar: avatar(21),
      text: "the 128-ball cliff is real",
    },
    likes: 342,
    comments: 27,
    reshares: 40,
    shares: 61,
  },
  {
    author: "reanimated.tips",
    avatar: avatar(45),
    timeAgo: "16h",
    text: "Reminder: prefer withSpring over withTiming. Natural motion sells the whole interaction.",
    likes: 2100,
    comments: 58,
    reshares: 310,
    shares: 120,
  },
  {
    author: "traveldaily",
    avatar: avatar(5),
    timeAgo: "2d",
    text: "Three cities, one week. Which one wins?",
    images: [media("egypt"), media("spain"), media("japan")],
    likes: 5400,
    comments: 210,
    reshares: 88,
    shares: 430,
  },
];

/** Cycle the fixed feed to fill any list length. */
export function postForIndex(i: number): ThreadPost {
  return THREAD_POSTS[i % THREAD_POSTS.length];
}
