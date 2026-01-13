import { LinearGradient } from "expo-linear-gradient";
import { PressableScale } from "pressto";
import React from "react";
import {
  ColorValue,
  Image,
  ImageSourcePropType,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from "react-native";

export type CoinInfo = {
  symbol: string;
  icon: ImageSourcePropType;
  accentColor: string;
  balance?: number;
};


type CardProps = {
  image: ImageSourcePropType;
  title: string;
  description: string;
  backgroundColors?: ColorValue[];
  style?: StyleProp<ViewStyle>;
  onSwapPress?: () => void;
  showShadow?: boolean;
};

const Card: React.FC<CardProps> = ({
  image,
  title,
  description,
  style,
  backgroundColors,
  onSwapPress,
  showShadow = true,
}) => {
  return (
    <View
      style={[
        styles.container,
        style,
        showShadow && { shadowColor: backgroundColors?.[0] },
        !showShadow && styles.noShadow,
      ]}
    >
      <LinearGradient
        colors={backgroundColors as [string, string, ...string[]] ?? ["#ff6b9d", "#ffb347"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradientBorder}
      >
        <View style={styles.innerCard}>
          {/* Icon - fixed at top */}
          <Image source={image} style={styles.image} resizeMode="contain" />

          {/* Content - fills middle space */}
          <View style={styles.textContainer}>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.description} numberOfLines={3}>
              {description}
            </Text>
          </View>

          {/* Button - fixed at bottom */}
          <PressableScale
            style={{

            }}
            onPress={onSwapPress}
          >
            <Text
              style={{
                color: backgroundColors?.[1],
                fontSize: 12,
                fontWeight: "bold",
                shadowOpacity: 0.5,
                shadowRadius: 20,
                elevation: 10,
                marginBottom: 20,
                shadowColor: backgroundColors?.[0],
              }}
            >
               Swap Now
            </Text>
          </PressableScale>
        </View>
      </LinearGradient>
    </View>
  );
};

// --- Swap Screen Types ---

type SwapScreenProps = {
  sellCoin: CoinInfo;
  buyCoin: CoinInfo;
  sellAmount: string;
  buyAmount: string;
  sellUsdValue: string;
  buyUsdValue: string;
  onSwap?: () => void;
  onFlipCoins?: () => void;
  style?: StyleProp<ViewStyle>;
};

// Coin Selector Pill
const CoinSelector: React.FC<{
  coin: CoinInfo;
  onPress?: () => void;
}> = ({ coin, onPress }) => (
  <PressableScale onPress={onPress} style={swapStyles.coinSelector}>
    <Image source={coin.icon} style={swapStyles.coinIcon} resizeMode="contain" />
    <Text style={swapStyles.coinSymbol}>{coin.symbol}</Text>
    <Text style={swapStyles.chevron}>▼</Text>
  </PressableScale>
);

// Individual Swap Card (Sell/Buy section)
const SwapCard: React.FC<{
  label: string;
  amount: string;
  usdValue: string;
  coin: CoinInfo;
  showMax?: boolean;
}> = ({ label, amount, usdValue, coin, showMax }) => (
  <View style={swapStyles.swapCard}>
    <View style={swapStyles.cardRow}>
      <Text style={swapStyles.label}>{label}</Text>
    </View>
    <View style={swapStyles.cardRow}>
      <Text style={swapStyles.amount}>{amount}</Text>
      <CoinSelector coin={coin} />
    </View>
    <View style={swapStyles.cardRow}>
      <Text style={swapStyles.usdValue}>{usdValue}</Text>
      {showMax && coin.balance && (
        <View style={swapStyles.balanceRow}>
          <Text style={swapStyles.balanceText}>
            {coin.balance} {coin.symbol}
          </Text>
          <PressableScale style={swapStyles.maxButton}>
            <Text style={swapStyles.maxText}>Max</Text>
          </PressableScale>
        </View>
      )}
    </View>
  </View>
);

// Main Swap Screen
const SwapScreen: React.FC<SwapScreenProps> = ({
  sellCoin,
  buyCoin,
  sellAmount,
  buyAmount,
  sellUsdValue,
  buyUsdValue,
  onSwap,
  onFlipCoins,
  style,
}) => {
  return (
    <View style={[swapStyles.container, style]}>
      {/* Sell Section */}
      <SwapCard
        label="Sell"
        amount={sellAmount}
        usdValue={sellUsdValue}
        coin={sellCoin}
        showMax
      />

      {/* Swap Arrow Button */}
      <View style={swapStyles.swapArrowContainer}>
        <PressableScale onPress={onFlipCoins} style={swapStyles.swapArrowButton}>
          <Text style={swapStyles.swapArrow}>↓</Text>
        </PressableScale>
      </View>

      {/* Buy Section */}
      <SwapCard
        label="Buy"
        amount={buyAmount}
        usdValue={buyUsdValue}
        coin={buyCoin}
      />

      {/* Swap Button */}
      <PressableScale onPress={onSwap} style={swapStyles.swapButton}>
        <Text style={swapStyles.swapButtonText}>Swap</Text>
      </PressableScale>
    </View>
  );
};

export { SwapScreen };

export default Card;

// --- Swap Screen Styles ---
const swapStyles = StyleSheet.create({
  container: {
    backgroundColor: "#1a1a1a",
    borderRadius: 24,
    padding: 16,
    width: "100%",
    height: "100%",
  },
  swapCard: {
    backgroundColor: "#252525",
    borderRadius: 20,
    padding: 16,
    marginBottom: 8,
  },
  cardRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  label: {
    color: "#888",
    fontSize: 14,
  },
  amount: {
    color: "#fff",
    fontSize: 36,
    fontWeight: "300",
  },
  usdValue: {
    color: "#888",
    fontSize: 14,
  },
  coinSelector: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#333",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  coinIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  coinSymbol: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  chevron: {
    color: "#888",
    fontSize: 10,
  },
  balanceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  balanceText: {
    color: "#888",
    fontSize: 14,
  },
  maxButton: {
    backgroundColor: "#333",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  maxText: {
    color: "#888",
    fontSize: 12,
  },
  swapArrowContainer: {
    alignItems: "center",
    marginVertical: -20,
    zIndex: 10,
  },
  swapArrowButton: {
    backgroundColor: "#1a1a1a",
    borderWidth: 3,
    borderColor: "#333",
    borderRadius: 20,
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  swapArrow: {
    color: "#888",
    fontSize: 18,
  },
  swapButton: {
    backgroundColor: "#f5f5f5",
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 16,
  },
  swapButtonText: {
    color: "#000",
    fontSize: 18,
    fontWeight: "600",
  },
});

// --- Card Styles ---
const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 10,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
  noShadow: {
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  gradientBorder: {
    borderRadius: 24,
    padding: 3,
  },
  innerCard: {
    // paddingBottom: 20,
    backgroundColor: "#0a0a0a",
    borderRadius: 21,
    padding: 20,
    height: 250,
    width: 220,
  },
  image: {
    width: 28,
    height: 28,
  },
  textContainer: {
    flex: 1,
    justifyContent: "center",
  },
  title: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 6,
  },
  description: {
    color: "#a0a0a0",
    fontSize: 12,
    lineHeight: 16,
  },
});
