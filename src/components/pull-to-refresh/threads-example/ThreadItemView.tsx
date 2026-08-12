/**
 * ThreadItemView
 *
 * A single Threads-style post row. Purely presentational — it takes a `post`
 * and lays out the six parts of a Threads item, top to bottom:
 *
 * FLOW (top → bottom):
 * 1. Header      → avatar, author handle, "· 1d" timestamp, overflow dots
 * 2. Body text   → the post copy
 * 3. Media       → 0..n images in a horizontal, edge-bleeding rail (optional)
 * 4. Action bar  → like / comment / reshare / share, each with a count
 * 5. Reply       → the first comment, indented under the post (optional)
 *
 * KEY FEATURES:
 * - The avatar column doubles as the Threads "thread line": a hairline runs
 *   down from under the avatar to visually tie a post to its first reply
 * - Media is an optional horizontal rail; a single image fills the width, two
 *   or more scroll sideways at a fixed height
 * - Counts are formatted compactly (1200 → "1.2K") like the real app
 * - Icons are stand-ins (see the CLAUDE note): the goal is layout parity, so
 *   any close-enough glyph from the icon set is used
 */

import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { PressableScale } from "pressto";
import { ScrollView, StyleSheet, Text, View } from "react-native";

// ============================================================================
// Types
// ============================================================================

/** The first reply shown inline beneath a post. */
export type ThreadReply = {
  author: string;
  avatar: string;
  text: string;
};

/** Everything one post row needs to render. */
export type ThreadPost = {
  author: string;
  /** Remote avatar URL. */
  avatar: string;
  /** Human "time ago" label, e.g. "1d", "16h". */
  timeAgo: string;
  text: string;
  /** Optional media rail; omit or empty for a text-only post. */
  images?: string[];
  /** Optional first reply, indented under the post. */
  reply?: ThreadReply;
  likes: number;
  comments: number;
  reshares: number;
  shares: number;
};

export type ThreadItemViewProps = {
  post: ThreadPost;
};

// ============================================================================
// Helpers
// ============================================================================

/** 1200 → "1.2K", 999 → "999" — the real app's compact count style. */
function formatCount(n: number): string {
  if (n < 1000) return `${n}`;
  const k = n / 1000;
  return `${k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)}K`;
}

// ============================================================================
// Component
// ============================================================================

export default function ThreadItemView({ post }: ThreadItemViewProps) {
  const hasImages = !!post.images?.length;
  const singleImage = post.images?.length === 1;

  return (
    <View style={styles.row}>
      {/* Left rail: avatar + the vertical thread line down to the reply. */}
      <View style={styles.avatarColumn}>
        <Image source={{ uri: post.avatar }} style={styles.avatar} />
        {post.reply ? <View style={styles.threadLine} /> : null}
      </View>

      {/* Right column: everything else. */}
      <View style={styles.content}>
        <View style={styles.headerRow}>
          <Text style={styles.author}>{post.author}</Text>
          <Text style={styles.timeAgo}>{post.timeAgo}</Text>
          <View style={styles.headerSpacer} />
          <Ionicons name="ellipsis-horizontal" size={16} color="#777" />
        </View>

        {post.text ? <Text style={styles.bodyText}>{post.text}</Text> : null}

        {hasImages ? (
          singleImage ? (
            <Image source={{ uri: post.images![0] }} style={styles.singleMedia} />
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.mediaRail}
              contentContainerStyle={styles.mediaRailContent}
            >
              {post.images!.map((uri) => (
                <Image key={uri} source={{ uri }} style={styles.railMedia} />
              ))}
            </ScrollView>
          )
        ) : null}

        <View style={styles.actionBar}>
          <Action icon="heart-outline" count={post.likes} />
          <Action icon="chatbubble-outline" count={post.comments} />
          <Action icon="repeat-outline" count={post.reshares} />
          <Action icon="paper-plane-outline" count={post.shares} />
        </View>

        {post.reply ? (
          <View style={styles.replyRow}>
            <Image source={{ uri: post.reply.avatar }} style={styles.replyAvatar} />
            <View style={styles.replyContent}>
              <Text style={styles.replyAuthor}>{post.reply.author}</Text>
              <Text style={styles.replyText}>{post.reply.text}</Text>
            </View>
          </View>
        ) : null}
      </View>
    </View>
  );
}

/** One action-bar item: an outline glyph with its compact count beside it. */
function Action({
  icon,
  count,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  count: number;
}) {
  return (
    <PressableScale style={styles.action}>
      <Ionicons name={icon} size={20} color="#ccc" />
      {count > 0 ? (
        <Text style={styles.actionCount}>{formatCount(count)}</Text>
      ) : null}
    </PressableScale>
  );
}

// ============================================================================
// Styles
// ============================================================================

const AVATAR_SIZE = 40;
const REPLY_AVATAR_SIZE = 24;

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    backgroundColor: "#1a1a1a",
  },
  avatarColumn: {
    alignItems: "center",
    width: AVATAR_SIZE,
  },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    backgroundColor: "#2a2a2a",
  },
  threadLine: {
    flex: 1,
    width: 2,
    marginTop: 8,
    borderRadius: 1,
    backgroundColor: "#333",
  },
  content: {
    flex: 1,
    gap: 8,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  author: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
  timeAgo: {
    color: "#777",
    fontSize: 14,
  },
  headerSpacer: {
    flex: 1,
  },
  bodyText: {
    color: "#fff",
    fontSize: 15,
    lineHeight: 21,
  },
  singleMedia: {
    width: "100%",
    height: 220,
    borderRadius: 12,
    backgroundColor: "#2a2a2a",
  },
  mediaRail: {
    marginHorizontal: -4,
  },
  mediaRailContent: {
    gap: 8,
    paddingHorizontal: 4,
  },
  railMedia: {
    width: 200,
    height: 220,
    borderRadius: 12,
    backgroundColor: "#2a2a2a",
  },
  actionBar: {
    flexDirection: "row",
    marginLeft: -8,
    gap: 4,
  },
  action: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  actionCount: {
    color: "#ccc",
    fontSize: 13,
  },
  replyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 2,
  },
  replyAvatar: {
    width: REPLY_AVATAR_SIZE,
    height: REPLY_AVATAR_SIZE,
    borderRadius: REPLY_AVATAR_SIZE / 2,
    backgroundColor: "#2a2a2a",
  },
  replyContent: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  replyAuthor: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
  replyText: {
    color: "#999",
    fontSize: 13,
    flexShrink: 1,
  },
});
