import { AnimatedPortalCard } from "@/components/scale-flip-card";
import Card, {
  CoinInfo,
  SwapScreen,
} from "@/components/scale-flip-card/Card";
import { Stack } from "expo-router";
import React from "react";
import {
  FlatList,
  ImageSourcePropType,
  StyleSheet,
  Text,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type CoinData = {
  image: ImageSourcePropType;
  title: string;
  description: string;
  backgroundColors: string[];
  coinInfo: CoinInfo;
  sellAmount: string;
  buyAmount: string;
  sellUsdValue: string;
  buyUsdValue: string;
};

const COINS: CoinData[] = [
  {
    image: require("@/assets/crypto_icons/bitcoin.png"),
    title: "Bitcoin",
    description:
      'Bitcoin is known as "digital gold" due to its fixed supply of 21 million coins, making it a potential hedge against inflation and a store of value.',
    backgroundColors: ["#FFBF00", "#f7931a"],
    coinInfo: {
      symbol: "BTC",
      icon: require("@/assets/crypto_icons/bitcoin.png"),
      accentColor: "#FFBF00",
      balance: 0.001,
    },
    sellAmount: "1000",
    buyAmount: "0.011",
    sellUsdValue: "$1000",
    buyUsdValue: "$980",
  },
  {
    image: require("@/assets/crypto_icons/ethereum.png"),
    title: "Ethereum",
    description:
      "Ethereum is a platform for a vast ecosystem of decentralized applications (dApps), DeFi, and NFTs, deriving its value from broad utility beyond just a store of value.",
    backgroundColors: ["#007894", "#2E70AA"],
    coinInfo: {
      symbol: "ETH",
      icon: require("@/assets/crypto_icons/ethereum.png"),
      accentColor: "#007894",
      balance: 52.32,
    },
    sellAmount: "1000",
    buyAmount: "0.32",
    sellUsdValue: "$1000",
    buyUsdValue: "$1000",
  },
  {
    image: require("@/assets/crypto_icons/solana.png"),
    title: "Solana",
    description:
      "Solana's core strength is its high performance, offering thousands of transactions per second at very low cost, making it highly scalable for real-time applications and gaming platforms.",
    backgroundColors: ["#00FFA3", "#9945FF"],
    coinInfo: {
      symbol: "SOL",
      icon: require("@/assets/crypto_icons/solana.png"),
      accentColor: "#9945FF",
      balance: 52.32,
    },
    sellAmount: "1000",
    buyAmount: "6.99",
    sellUsdValue: "$1000",
    buyUsdValue: "$1001",
  },
];

const usdCoin: CoinInfo = {
  symbol: "USDC",
  icon: require("@/assets/crypto_icons/usd-coin.png"),
  accentColor: "#2E70AA",
};

export default function ScaleFlipCardDemo() {
  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <Text style={styles.title}>Scale Flip Card</Text>

      <FlatList
        style={styles.list}
        contentContainerStyle={styles.listContainer}
        data={COINS}
        horizontal
        keyExtractor={(item) => item.title}
        renderItem={({ item, index }) => (
          <AnimatedPortalCard
            triggerContent={({ onPress }) => (
              <Card
                image={item.image}
                title={item.title}
                description={item.description}
                backgroundColors={item.backgroundColors}
                onSwapPress={onPress}
              />
            )}
            frontContent={
              <Card
                image={item.image}
                title={item.title}
                description={item.description}
                backgroundColors={item.backgroundColors}
              />
            }
            backContent={
              <SwapScreen
                sellCoin={usdCoin}
                buyCoin={COINS[index].coinInfo}
                sellAmount={COINS[index].sellAmount}
                buyAmount={COINS[index].buyAmount}
                sellUsdValue={COINS[index].sellUsdValue}
                buyUsdValue={COINS[index].buyUsdValue}
                onSwap={() => console.log("Swap!")}
                onFlipCoins={() => console.log("Flip!")}
              />
            }
          />
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 30,
    marginTop: 40,
    fontWeight: "bold",
    color: "white",
  },
  list: {
    flex: 1,
  },
  listContainer: {
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "black",
    padding: 10,
  },
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "black",
    padding: 10,
  },
});