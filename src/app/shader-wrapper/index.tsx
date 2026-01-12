import { StyleSheet, View, Text } from 'react-native';

export default function ShaderWrapperDemo() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Shader Wrapper</Text>
      <Text style={styles.subtitle}>Demo coming soon</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    opacity: 0.6,
  },
});
