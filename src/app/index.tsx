import { Href, Link } from "expo-router";
import { FlatList, Pressable, StyleSheet, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type Demo = {
  name: string;
  href: Href;
};

const demos: Demo[] = [
  { name: "Ripple Effect", href: "/ripple-effect" as const },
  { name: "Scale Flip Card", href: "/scale-flip-card" as const },
  { name: "Live Border Card", href: "/live-border-card" as const },
  { name: "Liquid Metal", href: "/liquid-metal" as const },
];

const ItemCellView = ({ index, demo }: { index: number; demo: Demo }) => {
  return (
    <Link key={index} href={demo.href} asChild>
      <Pressable style={styles.card}>
        <Text style={styles.cardTitle}>{demo.name}</Text>
      </Pressable>
    </Link>
  );
};
export default function HomeScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Demos</Text>
      <FlatList
        style={{ flex: 1 }}
        data={demos}
        renderItem={({ index, item }) => {
          return <ItemCellView index={index} demo={item} />;
        }}
        
        contentContainerStyle={styles.grid}
      />

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 14
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: "white",
    marginVertical: 24,
  },
  grid: {
    gap: 12,
  },
  card: {
    backgroundColor: "#1a1a1a",
    borderRadius: 12,
    padding: 20,
  },
  cardTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "600",
  },
});
