import { AlpacaQuote, AlpacaPosition, OptionsChain } from "./alpacaService";
import * as logger from "./loggerService";

export interface StrategyDecision {
  action: "buy" | "sell" | "hold";
  confidence: number;
  reason: string;
  quantity?: number;
  price?: number;
  metadata?: any;
}

export interface StrategyConfig {
  name: string;
  enabled: boolean;
  riskPercentage: number;
  maxPositionSize: number;
  minConfidence: number;
  parameters: { [key: string]: any };
}

export interface MarketData {
  symbol: string;
  currentPrice: number;
  volume: number;
  timestamp: string;
  quote: AlpacaQuote;
  position?: AlpacaPosition;
  historicalData?: {
    prices: number[];
    volumes: number[];
    timestamps: string[];
  };
  optionsChain?: OptionsChain[];
}

// Strategy function type
export type StrategyFunction = (
  marketData: MarketData,
  config: StrategyConfig
) => Promise<StrategyDecision>;

// Strategy registry
interface StrategyRegistry {
  [name: string]: {
    function: StrategyFunction;
    config: StrategyConfig;
  };
}

// Simple Moving Average Strategy
function calculateSMA(prices: number[]): number {
  return prices.reduce((sum, price) => sum + price, 0) / prices.length;
}

function calculatePositionSize(price: number, maxValue: number): number {
  return Math.floor(maxValue / price);
}

async function simpleMovingAverageStrategy(
  marketData: MarketData,
  config: StrategyConfig
): Promise<StrategyDecision> {
  const { symbol, currentPrice, position, historicalData } = marketData;

  if (!historicalData || historicalData.prices.length < 20) {
    return {
      action: "hold",
      confidence: 0,
      reason: "Insufficient historical data for SMA analysis",
    };
  }

  const prices = historicalData.prices;
  const shortPeriod = config.parameters.shortPeriod || 10;
  const longPeriod = config.parameters.longPeriod || 20;

  if (prices.length < longPeriod) {
    return {
      action: "hold",
      confidence: 0,
      reason: `Need at least ${longPeriod} data points for SMA analysis`,
    };
  }

  // Calculate moving averages
  const shortSMA = calculateSMA(prices.slice(-shortPeriod));
  const longSMA = calculateSMA(prices.slice(-longPeriod));

  const currentShares = position ? parseFloat(position.qty) : 0;
  const hasPosition = currentShares > 0;

  // Strategy logic
  let action: "buy" | "sell" | "hold" = "hold";
  let confidence = 0;
  let reason = "";

  if (shortSMA > longSMA && currentPrice > shortSMA && !hasPosition) {
    // Golden cross - buy signal
    action = "buy";
    confidence = Math.min(0.8, ((shortSMA - longSMA) / longSMA) * 10);
    reason = `Golden cross: Short SMA (${shortSMA.toFixed(
      2
    )}) > Long SMA (${longSMA.toFixed(2)})`;
  } else if (shortSMA < longSMA && currentPrice < shortSMA && hasPosition) {
    // Death cross - sell signal
    action = "sell";
    confidence = Math.min(0.8, ((longSMA - shortSMA) / longSMA) * 10);
    reason = `Death cross: Short SMA (${shortSMA.toFixed(
      2
    )}) < Long SMA (${longSMA.toFixed(2)})`;
  } else {
    reason = `No clear signal: Short SMA (${shortSMA.toFixed(
      2
    )}), Long SMA (${longSMA.toFixed(2)})`;
  }

  return {
    action,
    confidence,
    reason,
    quantity:
      action === "buy"
        ? calculatePositionSize(currentPrice, config.maxPositionSize)
        : undefined,
    metadata: {
      shortSMA,
      longSMA,
      currentPrice,
      hasPosition,
    },
  };
}

// RSI Strategy
function calculateRSI(prices: number[], period: number): number {
  if (prices.length < period + 1) return 50;

  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const change = prices[i] - prices[i - 1];
    if (change > 0) {
      gains += change;
    } else {
      losses += Math.abs(change);
    }
  }

  const avgGain = gains / period;
  const avgLoss = losses / period;

  if (avgLoss === 0) return 100;

  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

async function rsiStrategy(
  marketData: MarketData,
  config: StrategyConfig
): Promise<StrategyDecision> {
  const { symbol, currentPrice, position, historicalData } = marketData;

  if (!historicalData || historicalData.prices.length < 15) {
    return {
      action: "hold",
      confidence: 0,
      reason: "Insufficient historical data for RSI analysis",
    };
  }

  const prices = historicalData.prices;
  const period = config.parameters.period || 14;
  const oversoldThreshold = config.parameters.oversoldThreshold || 30;
  const overboughtThreshold = config.parameters.overboughtThreshold || 70;

  if (prices.length < period + 1) {
    return {
      action: "hold",
      confidence: 0,
      reason: `Need at least ${period + 1} data points for RSI analysis`,
    };
  }

  const rsi = calculateRSI(prices, period);
  const currentShares = position ? parseFloat(position.qty) : 0;
  const hasPosition = currentShares > 0;

  let action: "buy" | "sell" | "hold" = "hold";
  let confidence = 0;
  let reason = "";

  if (rsi < oversoldThreshold && !hasPosition) {
    // Oversold - buy signal
    action = "buy";
    confidence = Math.min(0.9, (oversoldThreshold - rsi) / oversoldThreshold);
    reason = `RSI oversold: ${rsi.toFixed(2)} < ${oversoldThreshold}`;
  } else if (rsi > overboughtThreshold && hasPosition) {
    // Overbought - sell signal
    action = "sell";
    confidence = Math.min(
      0.9,
      (rsi - overboughtThreshold) / (100 - overboughtThreshold)
    );
    reason = `RSI overbought: ${rsi.toFixed(2)} > ${overboughtThreshold}`;
  } else {
    reason = `RSI neutral: ${rsi.toFixed(
      2
    )} (${oversoldThreshold}-${overboughtThreshold})`;
  }

  return {
    action,
    confidence,
    reason,
    quantity:
      action === "buy"
        ? calculatePositionSize(currentPrice, config.maxPositionSize)
        : undefined,
    metadata: {
      rsi,
      currentPrice,
      hasPosition,
    },
  };
}

// Random Strategy (for testing)
async function randomStrategy(
  marketData: MarketData,
  config: StrategyConfig
): Promise<StrategyDecision> {
  const { symbol, position } = marketData;
  const currentShares = position ? parseFloat(position.qty) : 0;
  const hasPosition = currentShares > 0;

  const random = Math.random();
  let action: "buy" | "sell" | "hold" = "hold";
  let confidence = 0;
  let reason = "";

  if (random < 0.1 && !hasPosition) {
    action = "buy";
    confidence = 0.3;
    reason = "Random buy signal";
  } else if (random > 0.9 && hasPosition) {
    action = "sell";
    confidence = 0.3;
    reason = "Random sell signal";
  } else {
    reason = "Random hold signal";
  }

  return {
    action,
    confidence,
    reason,
    quantity: action === "buy" ? 1 : undefined,
    metadata: { random },
  };
}

// Strategy registry state
const strategies: StrategyRegistry = {};

const defaultConfig: StrategyConfig = {
  name: "default",
  enabled: true,
  riskPercentage: 0.02,
  maxPositionSize: 1000,
  minConfidence: 0.6,
  parameters: {},
};

// Initialize default strategies
function initializeDefaultStrategies(): void {
  // SMA Strategy
  const smaConfig: StrategyConfig = {
    ...defaultConfig,
    name: "SMA Strategy",
    parameters: {
      shortPeriod: 10,
      longPeriod: 20,
    },
  };
  addStrategy("SMA Strategy", simpleMovingAverageStrategy, smaConfig);

  // RSI Strategy
  const rsiConfig: StrategyConfig = {
    ...defaultConfig,
    name: "RSI Strategy",
    parameters: {
      period: 14,
      oversoldThreshold: 30,
      overboughtThreshold: 70,
    },
  };
  addStrategy("RSI Strategy", rsiStrategy, rsiConfig);

  // Random Strategy (for testing)
  const randomConfig: StrategyConfig = {
    ...defaultConfig,
    name: "Random Strategy",
    minConfidence: 0.2,
  };
  addStrategy("Random Strategy", randomStrategy, randomConfig);

  // Options Momentum Strategy
  const optionsMomentumConfig: StrategyConfig = {
    ...defaultConfig,
    name: "Options Momentum Strategy",
    minConfidence: 0.4,
    parameters: {
      minVolume: 10,
      maxMoneyness: 0.1, // 10% OTM max
    },
  };
  addStrategy(
    "Options Momentum Strategy",
    optionsMomentumStrategy,
    optionsMomentumConfig
  );

  // Options Volatility Strategy
  const optionsVolatilityConfig: StrategyConfig = {
    ...defaultConfig,
    name: "Options Volatility Strategy",
    minConfidence: 0.5,
    parameters: {
      ivThreshold: 0.3, // 30% IV threshold
      minVolume: 5,
    },
  };
  addStrategy(
    "Options Volatility Strategy",
    optionsVolatilityStrategy,
    optionsVolatilityConfig
  );
}

export function addStrategy(
  name: string,
  strategyFunction: StrategyFunction,
  config: StrategyConfig
): void {
  strategies[name] = {
    function: strategyFunction,
    config,
  };
  logger.info(`Strategy added: ${name}`);
}

export function removeStrategy(name: string): void {
  if (strategies[name]) {
    delete strategies[name];
    logger.info(`Strategy removed: ${name}`);
  }
}

export function getStrategy(
  name: string
): { function: StrategyFunction; config: StrategyConfig } | undefined {
  return strategies[name];
}

export function getAllStrategies(): Array<{
  name: string;
  function: StrategyFunction;
  config: StrategyConfig;
}> {
  return Object.entries(strategies).map(([name, strategy]) => ({
    name,
    function: strategy.function,
    config: strategy.config,
  }));
}

export function getEnabledStrategies(): Array<{
  name: string;
  function: StrategyFunction;
  config: StrategyConfig;
}> {
  return getAllStrategies().filter((strategy) => strategy.config.enabled);
}

export async function analyzeSymbol(
  symbol: string,
  marketData: MarketData
): Promise<StrategyDecision[]> {
  const decisions: StrategyDecision[] = [];
  const enabledStrategies = getEnabledStrategies();

  for (const strategy of enabledStrategies) {
    try {
      const decision = await strategy.function(marketData, strategy.config);

      // Only include decisions that meet minimum confidence
      if (decision.confidence >= strategy.config.minConfidence) {
        decisions.push({
          ...decision,
          metadata: {
            ...decision.metadata,
            strategyName: strategy.name,
          },
        });
      }

      logger.strategyDecision(symbol, decision.action, decision.confidence, {
        strategy: strategy.name,
        reason: decision.reason,
      });
    } catch (error) {
      logger.error(
        `Strategy analysis failed for ${strategy.name} on ${symbol}`,
        error
      );
    }
  }

  return decisions;
}

// Get the best decision based on highest confidence
export function getBestDecision(
  decisions: StrategyDecision[]
): StrategyDecision | null {
  if (decisions.length === 0) return null;

  return decisions.reduce((best, current) => {
    return current.confidence > best.confidence ? current : best;
  });
}

// Get consensus decision (majority vote)
export function getConsensusDecision(
  decisions: StrategyDecision[]
): StrategyDecision | null {
  if (decisions.length === 0) return null;

  const buyDecisions = decisions.filter((d) => d.action === "buy");
  const sellDecisions = decisions.filter((d) => d.action === "sell");
  const holdDecisions = decisions.filter((d) => d.action === "hold");

  const maxCount = Math.max(
    buyDecisions.length,
    sellDecisions.length,
    holdDecisions.length
  );

  if (maxCount === buyDecisions.length && buyDecisions.length > 0) {
    return {
      action: "buy",
      confidence:
        buyDecisions.reduce((sum, d) => sum + d.confidence, 0) /
        buyDecisions.length,
      reason: `Consensus buy (${buyDecisions.length}/${decisions.length} strategies)`,
      quantity: buyDecisions[0]?.quantity,
      metadata: { consensus: true, totalStrategies: decisions.length },
    };
  } else if (maxCount === sellDecisions.length && sellDecisions.length > 0) {
    return {
      action: "sell",
      confidence:
        sellDecisions.reduce((sum, d) => sum + d.confidence, 0) /
        sellDecisions.length,
      reason: `Consensus sell (${sellDecisions.length}/${decisions.length} strategies)`,
      metadata: { consensus: true, totalStrategies: decisions.length },
    };
  } else {
    return {
      action: "hold",
      confidence:
        holdDecisions.reduce((sum, d) => sum + d.confidence, 0) /
        Math.max(holdDecisions.length, 1),
      reason: `Consensus hold (${holdDecisions.length}/${decisions.length} strategies)`,
      metadata: { consensus: true, totalStrategies: decisions.length },
    };
  }
}

// Options-specific strategies
async function optionsMomentumStrategy(
  marketData: MarketData,
  config: StrategyConfig
): Promise<StrategyDecision> {
  const { symbol, currentPrice, optionsChain } = marketData;

  if (!optionsChain || optionsChain.length === 0) {
    return {
      action: "hold",
      confidence: 0,
      reason: "No options chain available for analysis",
    };
  }

  // Filter for call options with good open interest
  const callOptions = optionsChain.filter(
    (option) =>
      option.type === "call" &&
      option.tradable &&
      option.status === "active" &&
      parseInt(option.open_interest || "0") >= 10 &&
      parseFloat(option.strike_price) > currentPrice * 0.95 && // Slightly OTM
      parseFloat(option.strike_price) < currentPrice * 1.1 // Not too far OTM
  );

  if (callOptions.length === 0) {
    return {
      action: "hold",
      confidence: 0,
      reason: "No suitable call options found",
    };
  }

  // Sort by open interest and select the best option
  const bestOption = callOptions.sort(
    (a, b) =>
      parseInt(b.open_interest || "0") - parseInt(a.open_interest || "0")
  )[0];

  // Calculate confidence based on open interest and moneyness
  const moneyness =
    (currentPrice - parseFloat(bestOption.strike_price)) / currentPrice;
  const openInterestConfidence = Math.min(
    1,
    parseInt(bestOption.open_interest || "0") / 1000
  );
  const confidence = Math.min(
    0.8,
    openInterestConfidence * 0.7 + Math.max(0, moneyness * 0.3)
  );

  return {
    action: "buy",
    confidence,
    reason: `Options momentum: High volume call option with ${(
      moneyness * 100
    ).toFixed(1)}% moneyness`,
    quantity: 1,
    metadata: {
      optionSymbol: bestOption.symbol,
      strikePrice: bestOption.strike_price,
      expirationDate: bestOption.expiration_date,
      openInterest: bestOption.open_interest,
      moneyness: moneyness,
    },
  };
}

async function optionsVolatilityStrategy(
  marketData: MarketData,
  config: StrategyConfig
): Promise<StrategyDecision> {
  const { symbol, currentPrice, optionsChain } = marketData;

  if (!optionsChain || optionsChain.length === 0) {
    return {
      action: "hold",
      confidence: 0,
      reason: "No options chain available for volatility analysis",
    };
  }

  // Filter for options with good open interest
  const optionsWithOI = optionsChain.filter(
    (option) =>
      option.tradable &&
      option.status === "active" &&
      parseInt(option.open_interest || "0") >= 5
  );

  if (optionsWithOI.length === 0) {
    return {
      action: "hold",
      confidence: 0,
      reason: "No options with sufficient open interest found",
    };
  }

  // Calculate average open interest
  const avgOI =
    optionsWithOI.reduce(
      (sum, option) => sum + parseInt(option.open_interest || "0"),
      0
    ) / optionsWithOI.length;

  // High open interest suggests active trading (good for options)
  const oiThreshold = 100; // 100 contracts threshold
  const confidence = Math.min(0.9, (avgOI - oiThreshold) / 1000);

  if (avgOI > oiThreshold) {
    // Find a good call option for volatility play
    const callOptions = optionsWithOI.filter(
      (option) =>
        option.type === "call" &&
        parseFloat(option.strike_price) > currentPrice * 0.98 && // Near the money
        parseFloat(option.strike_price) < currentPrice * 1.05
    );

    if (callOptions.length > 0) {
      const bestOption = callOptions.sort(
        (a, b) =>
          parseInt(b.open_interest || "0") - parseInt(a.open_interest || "0")
      )[0];

      return {
        action: "buy",
        confidence,
        reason: `High OI play: Average OI ${avgOI.toFixed(
          0
        )} suggests active trading`,
        quantity: 1,
        metadata: {
          optionSymbol: bestOption.symbol,
          strikePrice: bestOption.strike_price,
          expirationDate: bestOption.expiration_date,
          openInterest: bestOption.open_interest,
          avgOI: avgOI,
        },
      };
    }
  }

  return {
    action: "hold",
    confidence: 0,
    reason: `Low OI environment: Average OI ${avgOI.toFixed(0)}`,
  };
}

// Configuration functions
export function updateStrategyConfig(
  name: string,
  newConfig: Partial<StrategyConfig>
): void {
  if (strategies[name]) {
    strategies[name].config = { ...strategies[name].config, ...newConfig };
    logger.info(`Strategy configuration updated: ${name}`);
  }
}

// Initialize on module load
initializeDefaultStrategies();
