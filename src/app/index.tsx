import { Link } from 'expo-router';
import { StyleSheet, View, Text, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const demos = [
  { name: 'Shared Element', href: '/shared-element' as const },
  { name: 'Ripple Shader', href: '/ripple-shader' as const },
  { name: 'Final Ripple', href: '/final-ripple' as const },
  { name: 'Shader Wrapper', href: '/shader-wrapper' as const },
];

export default function HomeScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Demos</Text>
      <View style={styles.grid}>
        {demos.map((demo) => (
          <Link key={demo.href} href={demo.href} asChild>
            <Pressable style={styles.card}>
              <Text style={styles.cardTitle}>{demo.name}</Text>
            </Pressable>
          </Link>
        ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 24,
  },
  grid: {
    gap: 12,
  },
  card: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 20,
  },
  cardTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
});
