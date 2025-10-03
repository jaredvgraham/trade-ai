import * as logger from "../services/loggerService";
import * as alpacaService from "../services/alpacaService";

export interface ScheduleConfig {
  intervalMs: number;
  tradingStartTime: string; // HH:MM format
  tradingEndTime: string; // HH:MM format
  timezone: string;
  tradingDays: number[]; // 0 = Sunday, 1 = Monday, etc.
  preMarketStart?: string; // HH:MM format
  afterHoursEnd?: string; // HH:MM format
}

export interface BotStatus {
  isRunning: boolean;
  lastRun?: Date;
  nextRun?: Date;
  isMarketOpen: boolean;
  totalRuns: number;
  errors: number;
  lastError?: string;
  startTime?: Date;
}

// Scheduler state
let intervalId: NodeJS.Timeout | null = null;
let config: ScheduleConfig = {
  intervalMs: parseInt(process.env.BOT_INTERVAL_MS || "30000"), // 30 seconds default
  tradingStartTime: "09:30",
  tradingEndTime: "16:00",
  timezone: "America/New_York",
  tradingDays: [1, 2, 3, 4, 5], // Monday to Friday
  preMarketStart: "04:00",
  afterHoursEnd: "20:00",
};

let status: BotStatus = {
  isRunning: false,
  isMarketOpen: false,
  totalRuns: 0,
  errors: 0,
};

let callback: (() => Promise<void>) | null = null;

// Initialize scheduler
function initializeScheduler(customConfig?: Partial<ScheduleConfig>): void {
  config = {
    ...config,
    ...customConfig,
  };

  status = {
    isRunning: false,
    isMarketOpen: false,
    totalRuns: 0,
    errors: 0,
  };

  logger.info("Scheduler initialized", config);
}

export function setCallback(cb: () => Promise<void>): void {
  callback = cb;
  logger.info("Scheduler callback set");
}

export async function start(): Promise<void> {
  if (status.isRunning) {
    logger.warn("Scheduler is already running");
    return;
  }

  if (!callback) {
    throw new Error("No callback function set. Call setCallback() first.");
  }

  status.isRunning = true;
  status.startTime = new Date();
  status.lastError = undefined;

  logger.info("Starting scheduler", {
    interval: config.intervalMs,
    tradingHours: `${config.tradingStartTime}-${config.tradingEndTime}`,
  });

  // Start the interval
  intervalId = setInterval(async () => {
    await executeCallback();
  }, config.intervalMs);

  // Execute immediately on start
  await executeCallback();
}

export function stop(): void {
  if (!status.isRunning) {
    logger.warn("Scheduler is not running");
    return;
  }

  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }

  status.isRunning = false;
  status.nextRun = undefined;

  logger.info("Scheduler stopped", {
    totalRuns: status.totalRuns,
    errors: status.errors,
  });
}

async function executeCallback(): Promise<void> {
  try {
    status.lastRun = new Date();
    status.totalRuns++;
    status.nextRun = new Date(Date.now() + config.intervalMs);

    // Check if we should run based on market hours
    const shouldRunResult = await shouldRun();

    if (shouldRunResult) {
      logger.debug("Executing scheduled callback");
      if (callback) {
        await callback();
      }
    } else {
      logger.debug(
        "Skipping execution - outside trading hours or market closed"
      );
    }

    // Update market status
    status.isMarketOpen = await isMarketOpen();
  } catch (error) {
    status.errors++;
    status.lastError = error instanceof Error ? error.message : String(error);
    logger.error("Scheduled callback execution failed", error);
  }
}

async function shouldRun(): Promise<boolean> {
  const now = new Date();
  const currentTime = formatTime(now);
  const currentDay = now.getDay();

  // Check if it's a trading day
  if (!config.tradingDays.includes(currentDay)) {
    return false;
  }

  // Check if market is open (using Alpaca API)
  try {
    const isMarketOpen = await alpacaService.isMarketOpen();
    if (!isMarketOpen) {
      return false;
    }
  } catch (error) {
    logger.warn(
      "Failed to check market status from Alpaca, using local time check",
      error
    );
    // Fallback to local time check
    return isWithinTradingHours(currentTime);
  }

  return true;
}

function isWithinTradingHours(currentTime: string): boolean {
  const { tradingStartTime, tradingEndTime, preMarketStart, afterHoursEnd } =
    config;

  // Check regular trading hours
  if (isTimeBetween(currentTime, tradingStartTime, tradingEndTime)) {
    return true;
  }

  // Check pre-market hours
  if (
    preMarketStart &&
    isTimeBetween(currentTime, preMarketStart, tradingStartTime)
  ) {
    return true;
  }

  // Check after-hours
  if (
    afterHoursEnd &&
    isTimeBetween(currentTime, tradingEndTime, afterHoursEnd)
  ) {
    return true;
  }

  return false;
}

function isTimeBetween(
  currentTime: string,
  startTime: string,
  endTime: string
): boolean {
  const current = timeToMinutes(currentTime);
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);

  if (start <= end) {
    return current >= start && current <= end;
  } else {
    // Handle overnight periods (e.g., after-hours that go past midnight)
    return current >= start || current <= end;
  }
}

function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    timeZone: config.timezone,
  });
}

export async function isMarketOpen(): Promise<boolean> {
  try {
    return await alpacaService.isMarketOpen();
  } catch (error) {
    logger.warn("Failed to check market status, using local time check", error);
    const now = new Date();
    const currentTime = formatTime(now);
    const currentDay = now.getDay();

    return (
      config.tradingDays.includes(currentDay) &&
      isWithinTradingHours(currentTime)
    );
  }
}

export function getStatus(): BotStatus {
  return { ...status };
}

export function updateConfig(newConfig: Partial<ScheduleConfig>): void {
  config = { ...config, ...newConfig };
  logger.info("Scheduler configuration updated", config);
}

export function getConfig(): ScheduleConfig {
  return { ...config };
}

// Utility method to get next trading day
export function getNextTradingDay(): Date {
  const now = new Date();
  const nextDay = new Date(now);

  do {
    nextDay.setDate(nextDay.getDate() + 1);
  } while (!config.tradingDays.includes(nextDay.getDay()));

  return nextDay;
}

// Utility method to get market open time for a given date
export function getMarketOpenTime(date: Date): Date {
  const [hours, minutes] = config.tradingStartTime.split(":").map(Number);
  const marketOpen = new Date(date);
  marketOpen.setHours(hours, minutes, 0, 0);
  return marketOpen;
}

// Utility method to get market close time for a given date
export function getMarketCloseTime(date: Date): Date {
  const [hours, minutes] = config.tradingEndTime.split(":").map(Number);
  const marketClose = new Date(date);
  marketClose.setHours(hours, minutes, 0, 0);
  return marketClose;
}

// Method to check if a specific time is within trading hours
export function isTimeInTradingHours(time: Date): boolean {
  const timeString = formatTime(time);
  return isWithinTradingHours(timeString);
}

// Method to get time until next trading session
export function getTimeUntilNextSession(): {
  hours: number;
  minutes: number;
  seconds: number;
} | null {
  const now = new Date();
  const currentTime = formatTime(now);
  const currentDay = now.getDay();

  // If it's a trading day and within trading hours, return 0
  if (
    config.tradingDays.includes(currentDay) &&
    isWithinTradingHours(currentTime)
  ) {
    return { hours: 0, minutes: 0, seconds: 0 };
  }

  // Find next trading session
  let nextSession: Date;

  if (config.tradingDays.includes(currentDay)) {
    // Same day, check if it's before trading hours
    const todayOpen = getMarketOpenTime(now);
    if (now < todayOpen) {
      nextSession = todayOpen;
    } else {
      // Next trading day
      nextSession = getMarketOpenTime(getNextTradingDay());
    }
  } else {
    // Not a trading day, get next trading day
    nextSession = getMarketOpenTime(getNextTradingDay());
  }

  const diffMs = nextSession.getTime() - now.getTime();
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diffMs % (1000 * 60)) / 1000);

  return { hours, minutes, seconds };
}

// Initialize on module load
initializeScheduler();
