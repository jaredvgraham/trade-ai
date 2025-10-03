import axios, { AxiosInstance, AxiosResponse } from "axios";
import * as logger from "./loggerService";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

export interface AlpacaAccount {
  id: string;
  account_number: string;
  status: string;
  currency: string;
  buying_power: string;
  regt_buying_power: string;
  daytrading_buying_power: string;
  non_marginable_buying_power: string;
  cash: string;
  accrued_fees: string;
  pending_transfer_out: string;
  pending_transfer_in: string;
  portfolio_value: string;
  pattern_day_trader: boolean;
  trading_blocked: boolean;
  transfers_blocked: boolean;
  account_blocked: boolean;
  created_at: string;
  trade_suspended_by_user: boolean;
  multiplier: string;
  shorting_enabled: boolean;
  equity: string;
  last_equity: string;
  long_market_value: string;
  short_market_value: string;
  initial_margin: string;
  maintenance_margin: string;
  last_maintenance_margin: string;
  sma: string;
  daytrade_count: number;
}

export interface AlpacaPosition {
  asset_id: string;
  symbol: string;
  exchange: string;
  asset_class: string;
  qty: string;
  side: string;
  market_value: string;
  cost_basis: string;
  unrealized_pl: string;
  unrealized_plpc: string;
  unrealized_intraday_pl: string;
  unrealized_intraday_plpc: string;
  current_price: string;
  lastday_price: string;
  change_today: string;
}

export interface AlpacaQuote {
  symbol: string;
  bid: number;
  ask: number;
  bid_size: number;
  ask_size: number;
  timestamp: string;
}

export interface AlpacaOrder {
  id: string;
  client_order_id: string;
  created_at: string;
  updated_at: string;
  submitted_at: string;
  filled_at?: string;
  expired_at?: string;
  canceled_at?: string;
  failed_at?: string;
  replaced_at?: string;
  replaced_by?: string;
  replaces?: string;
  asset_id: string;
  symbol: string;
  asset_class: string;
  notional?: string;
  qty?: string;
  filled_qty: string;
  filled_avg_price?: string;
  order_class: string;
  order_type: string;
  type: string;
  side: string;
  time_in_force: string;
  limit_price?: string;
  stop_price?: string;
  status: string;
  extended_hours: boolean;
  legs?: any[];
  trail_percent?: string;
  trail_price?: string;
  hwm?: string;
}

export interface CreateOrderRequest {
  symbol: string;
  qty?: number;
  notional?: number;
  side: "buy" | "sell";
  type: "market" | "limit" | "stop" | "stop_limit";
  time_in_force: "day" | "gtc" | "ioc" | "fok";
  limit_price?: number;
  stop_price?: number;
  extended_hours?: boolean;
}

export interface OptionsChain {
  id: string;
  symbol: string;
  name: string;
  status: string;
  tradable: boolean;
  expiration_date: string;
  root_symbol: string;
  underlying_symbol: string;
  underlying_asset_id: string;
  type: "call" | "put";
  style: string;
  strike_price: string;
  multiplier: string;
  size: string;
  open_interest?: string;
  open_interest_date?: string;
  close_price?: string;
  close_price_date?: string;
  ppind: boolean;
}

export interface OptionsChainResponse {
  option_contracts: OptionsChain[];
  next_page_token?: string;
}

export interface CreateOptionsOrderRequest {
  symbol: string;
  qty: number;
  side: "buy" | "sell";
  type: "market" | "limit";
  time_in_force: "day" | "gtc" | "ioc" | "fok";
  limit_price?: number;
  extended_hours?: boolean;
}

// Configuration state
let apiKey: string = process.env.ALPACA_API_KEY || "";
let secretKey: string = process.env.ALPACA_SECRET_KEY || "";
let baseUrl: string =
  process.env.ALPACA_BASE_URL || "https://paper-api.alpaca.markets";
let dataUrl: string =
  process.env.ALPACA_DATA_URL || "https://data.alpaca.markets";

// Axios instances
let client: AxiosInstance;
let dataClient: AxiosInstance;

// Initialize clients
function initializeClients(): void {
  if (!apiKey || !secretKey) {
    throw new Error(
      "Alpaca API credentials not found in environment variables"
    );
  }

  client = axios.create({
    baseURL: baseUrl,
    headers: {
      "APCA-API-KEY-ID": apiKey,
      "APCA-API-SECRET-KEY": secretKey,
      "Content-Type": "application/json",
    },
  });

  dataClient = axios.create({
    baseURL: dataUrl,
    headers: {
      "APCA-API-KEY-ID": apiKey,
      "APCA-API-SECRET-KEY": secretKey,
      "Content-Type": "application/json",
    },
  });

  setupInterceptors();
}

function setupInterceptors(): void {
  // Request interceptor
  client.interceptors.request.use(
    (config: any) => {
      logger.debug(
        `Alpaca API Request: ${config.method?.toUpperCase()} ${config.url}`
      );
      return config;
    },
    (error: any) => {
      logger.error("Alpaca API Request Error", error);
      return Promise.reject(error);
    }
  );

  // Response interceptor
  client.interceptors.response.use(
    (response: any) => {
      logger.debug(
        `Alpaca API Response: ${response.status} ${response.config.url}`
      );
      return response;
    },
    (error: any) => {
      const errorMessage = error.response?.data?.message || error.message;
      logger.error("Alpaca API Response Error", {
        status: error.response?.status,
        message: errorMessage,
        url: error.config?.url,
      });
      return Promise.reject(error);
    }
  );

  // Data client interceptors
  dataClient.interceptors.request.use(
    (config: any) => {
      logger.debug(
        `Alpaca Data API Request: ${config.method?.toUpperCase()} ${config.url}`
      );
      return config;
    },
    (error: any) => {
      logger.error("Alpaca Data API Request Error", error);
      return Promise.reject(error);
    }
  );

  dataClient.interceptors.response.use(
    (response: any) => {
      logger.debug(
        `Alpaca Data API Response: ${response.status} ${response.config.url}`
      );
      return response;
    },
    (error: any) => {
      const errorMessage = error.response?.data?.message || error.message;
      logger.error("Alpaca Data API Response Error", {
        status: error.response?.status,
        message: errorMessage,
        url: error.config?.url,
      });
      return Promise.reject(error);
    }
  );
}

export async function getAccount(): Promise<AlpacaAccount> {
  try {
    const response: AxiosResponse<AlpacaAccount> = await client.get(
      "/v2/account"
    );
    logger.info("Account information retrieved successfully");
    return response.data;
  } catch (error) {
    logger.error("Failed to get account information", error);
    throw error;
  }
}

export async function getPositions(): Promise<AlpacaPosition[]> {
  try {
    const response: AxiosResponse<AlpacaPosition[]> = await client.get(
      "/v2/positions"
    );
    logger.info(`Retrieved ${response.data.length} positions`);
    return response.data;
  } catch (error) {
    logger.error("Failed to get positions", error);
    throw error;
  }
}

export async function getPosition(
  symbol: string
): Promise<AlpacaPosition | null> {
  try {
    const response: AxiosResponse<AlpacaPosition> = await client.get(
      `/v2/positions/${symbol}`
    );
    logger.info(`Retrieved position for ${symbol}`);
    return response.data;
  } catch (error: any) {
    if (error.response?.status === 404) {
      logger.debug(`No position found for ${symbol}`);
      return null;
    }
    logger.error(`Failed to get position for ${symbol}`, error);
    throw error;
  }
}

export async function getQuote(symbol: string): Promise<AlpacaQuote> {
  try {
    const response: AxiosResponse<{ quote: AlpacaQuote }> =
      await dataClient.get(`/v2/stocks/${symbol}/quotes/latest`);
    logger.debug(`Retrieved quote for ${symbol}`, response.data.quote);
    return response.data.quote;
  } catch (error) {
    logger.error(`Failed to get quote for ${symbol}`, error);
    throw error;
  }
}

export async function getQuotes(
  symbols: string[]
): Promise<{ [symbol: string]: AlpacaQuote }> {
  try {
    const response: AxiosResponse<{
      quotes: { [symbol: string]: AlpacaQuote };
    }> = await dataClient.get(
      `/v2/stocks/quotes/latest?symbols=${symbols.join(",")}`
    );
    logger.debug(`Retrieved quotes for ${symbols.length} symbols`);
    return response.data.quotes;
  } catch (error) {
    logger.error(
      `Failed to get quotes for symbols: ${symbols.join(",")}`,
      error
    );
    throw error;
  }
}

export async function createOrder(
  orderRequest: CreateOrderRequest
): Promise<AlpacaOrder> {
  try {
    const response: AxiosResponse<AlpacaOrder> = await client.post(
      "/v2/orders",
      orderRequest
    );
    logger.info(`Order created successfully`, {
      orderId: response.data.id,
      symbol: orderRequest.symbol,
      side: orderRequest.side,
      type: orderRequest.type,
    });
    return response.data;
  } catch (error) {
    logger.error(`Failed to create order for ${orderRequest.symbol}`, {
      orderRequest,
      error: (error as any).response?.data || (error as any).message,
    });
    throw error;
  }
}

export async function getOrder(orderId: string): Promise<AlpacaOrder> {
  try {
    const response: AxiosResponse<AlpacaOrder> = await client.get(
      `/v2/orders/${orderId}`
    );
    logger.debug(`Retrieved order ${orderId}`);
    return response.data;
  } catch (error) {
    logger.error(`Failed to get order ${orderId}`, error);
    throw error;
  }
}

export async function getOrders(
  status?: string,
  limit?: number
): Promise<AlpacaOrder[]> {
  try {
    const params = new (globalThis as any).URLSearchParams();
    if (status) params.append("status", status);
    if (limit) params.append("limit", limit.toString());

    const response: AxiosResponse<AlpacaOrder[]> = await client.get(
      `/v2/orders?${params.toString()}`
    );
    logger.debug(`Retrieved ${response.data.length} orders`);
    return response.data;
  } catch (error) {
    logger.error("Failed to get orders", error);
    throw error;
  }
}

export async function cancelOrder(orderId: string): Promise<void> {
  try {
    await client.delete(`/v2/orders/${orderId}`);
    logger.info(`Order ${orderId} cancelled successfully`);
  } catch (error) {
    logger.error(`Failed to cancel order ${orderId}`, error);
    throw error;
  }
}

export async function cancelAllOrders(): Promise<void> {
  try {
    await client.delete("/v2/orders");
    logger.info("All orders cancelled successfully");
  } catch (error) {
    logger.error("Failed to cancel all orders", error);
    throw error;
  }
}

// Helper method to check if market is open
export async function isMarketOpen(): Promise<boolean> {
  try {
    const response = await client.get("/v2/clock");
    return response.data.is_open;
  } catch (error) {
    logger.error("Failed to check market status", error);
    return false;
  }
}

// Helper method to get market calendar
export async function getMarketCalendar(
  start?: string,
  end?: string
): Promise<any[]> {
  try {
    const params = new (globalThis as any).URLSearchParams();
    if (start) params.append("start", start);
    if (end) params.append("end", end);

    const response = await client.get(`/v2/calendar?${params.toString()}`);
    return response.data;
  } catch (error) {
    logger.error("Failed to get market calendar", error);
    throw error;
  }
}

// Options chain functions
export async function getOptionsChain(
  symbol: string,
  expirationDate?: string,
  optionType?: "call" | "put"
): Promise<OptionsChain[]> {
  try {
    const params = new (globalThis as any).URLSearchParams();
    params.append("underlying_symbol", symbol);
    if (expirationDate) params.append("expiration_date", expirationDate);
    if (optionType) params.append("option_type", optionType);

    const response: AxiosResponse<OptionsChainResponse> = await client.get(
      `/v2/options/contracts?${params.toString()}`
    );

    logger.info(`Retrieved options chain for ${symbol}`, {
      count: response.data.option_contracts.length,
      expirationDate,
      optionType,
    });

    return response.data.option_contracts;
  } catch (error) {
    logger.error(`Failed to get options chain for ${symbol}`, error);
    throw error;
  }
}

export async function getOptionsQuote(
  optionSymbol: string
): Promise<OptionsChain> {
  try {
    const response: AxiosResponse<OptionsChain> = await client.get(
      `/v2/options/contracts/${optionSymbol}`
    );

    logger.debug(`Retrieved options quote for ${optionSymbol}`);
    return response.data;
  } catch (error) {
    logger.error(`Failed to get options quote for ${optionSymbol}`, error);
    throw error;
  }
}

export async function createOptionsOrder(
  orderRequest: CreateOptionsOrderRequest
): Promise<AlpacaOrder> {
  try {
    const response: AxiosResponse<AlpacaOrder> = await client.post(
      "/v2/orders",
      orderRequest
    );

    logger.info(`Options order created successfully`, {
      orderId: response.data.id,
      symbol: orderRequest.symbol,
      side: orderRequest.side,
      type: orderRequest.type,
      qty: orderRequest.qty,
    });

    return response.data;
  } catch (error) {
    logger.error(`Failed to create options order for ${orderRequest.symbol}`, {
      orderRequest,
      error: (error as any).response?.data || (error as any).message,
    });
    throw error;
  }
}

// Helper function to find best options contract
export function findBestOptionsContract(
  options: OptionsChain[],
  optionType: "call" | "put" = "call",
  maxStrikePrice?: number,
  minOpenInterest: number = 10
): OptionsChain | null {
  try {
    // Filter by option type and open interest
    const filteredOptions = options.filter(
      (option) =>
        option.type === optionType &&
        option.tradable &&
        option.status === "active" &&
        parseInt(option.open_interest || "0") >= minOpenInterest &&
        (!maxStrikePrice || parseFloat(option.strike_price) <= maxStrikePrice)
    );

    if (filteredOptions.length === 0) {
      logger.warn(`No suitable ${optionType} options found`, {
        totalOptions: options.length,
        minOpenInterest,
        maxStrikePrice,
      });
      return null;
    }

    // Sort by open interest (descending) and then by strike price (ascending for calls, descending for puts)
    const sortedOptions = filteredOptions.sort((a, b) => {
      const openInterestDiff =
        parseInt(b.open_interest || "0") - parseInt(a.open_interest || "0");
      if (openInterestDiff !== 0) return openInterestDiff;

      if (optionType === "call") {
        return parseFloat(a.strike_price) - parseFloat(b.strike_price);
      } else {
        return parseFloat(b.strike_price) - parseFloat(a.strike_price);
      }
    });

    const bestOption = sortedOptions[0];
    logger.info(`Selected best ${optionType} option`, {
      symbol: bestOption.symbol,
      strikePrice: bestOption.strike_price,
      expirationDate: bestOption.expiration_date,
      openInterest: bestOption.open_interest,
      closePrice: bestOption.close_price,
    });

    return bestOption;
  } catch (error) {
    logger.error("Failed to find best options contract", error);
    return null;
  }
}

// Configuration functions
export function setApiCredentials(key: string, secret: string): void {
  apiKey = key;
  secretKey = secret;
  initializeClients();
}

export function setBaseUrls(base: string, data: string): void {
  baseUrl = base;
  dataUrl = data;
  initializeClients();
}

// Initialize on module load
initializeClients();
