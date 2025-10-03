# Trading Bot - TypeScript Backend

A production-ready TypeScript trading bot with Alpaca API integration, featuring automated trading strategies, comprehensive logging, and a REST API for monitoring and control.

## Features

- **Automated Trading**: Continuous trading loop with configurable intervals
- **Multiple Strategies**: SMA, RSI, and Random strategies (easily extensible)
- **Market Hours Awareness**: Respects trading hours and market status
- **Risk Management**: Configurable position sizes and risk percentages
- **Comprehensive Logging**: Console and file logging with different levels
- **REST API**: Full API for monitoring and manual trading
- **Error Handling**: Robust error handling and graceful shutdown
- **Dry Run Mode**: Test strategies without placing real trades

## Project Structure

```
src/
├── bot/
│   ├── tradingBot.ts        # Main trading loop
│   └── scheduler.ts         # Market hours and intervals
├── services/
│   ├── alpacaService.ts     # Alpaca API wrapper
│   ├── strategyService.ts   # Trading strategies
│   └── loggerService.ts     # Logging system
└── api/
    ├── server.ts            # Express server
    └── routes/
        ├── tradingRoutes.ts # Trading endpoints
        └── monitorRoutes.ts # Monitoring endpoints
```

## Quick Start

### 1. Installation

```bash
npm install
```

### 2. Environment Setup

Copy the example environment file and configure your Alpaca API credentials:

```bash
cp env.example .env
```

Edit `.env` with your Alpaca API credentials:

```env
ALPACA_API_KEY=your_alpaca_api_key_here
ALPACA_SECRET_KEY=your_alpaca_secret_key_here
ALPACA_BASE_URL=https://paper-api.alpaca.markets
ALPACA_DATA_URL=https://data.alpaca.markets
```

### 3. Development

```bash
npm run dev
```

### 4. Production

```bash
npm run build
npm start
```

## API Endpoints

### Trading Routes (`/api/trading`)

- `POST /buy` - Place manual buy order
- `POST /sell` - Place manual sell order
- `POST /bot/start` - Start the trading bot
- `POST /bot/stop` - Stop the trading bot
- `PUT /bot/config` - Update bot configuration
- `POST /bot/cycle` - Manually trigger trading cycle
- `POST /bot/reset` - Reset bot metrics

### Monitor Routes (`/api/monitor`)

- `GET /account` - Get Alpaca account information
- `GET /positions` - Get current positions
- `GET /position/:symbol` - Get specific position
- `GET /quote/:symbol` - Get current quote
- `GET /orders` - Get recent orders
- `GET /status` - Get bot status and metrics
- `GET /strategies` - Get available strategies
- `PUT /strategies/:name` - Update strategy configuration
- `GET /market/status` - Get market status
- `GET /health` - Health check

## Configuration

### Bot Configuration

```typescript
{
  symbols: ['AAPL', 'MSFT', 'GOOGL', 'TSLA', 'AMZN'],
  maxPositions: 10,
  riskPercentage: 0.02,
  maxPositionSize: 1000,
  useConsensus: true,
  dryRun: false,
  enableLogging: true
}
```

### Strategy Configuration

Each strategy can be configured with:

- `enabled`: Enable/disable the strategy
- `riskPercentage`: Risk percentage per trade
- `maxPositionSize`: Maximum position size
- `minConfidence`: Minimum confidence threshold
- `parameters`: Strategy-specific parameters

## Trading Strategies

### 1. Simple Moving Average (SMA)

- Uses short and long period moving averages
- Buy when short SMA crosses above long SMA
- Sell when short SMA crosses below long SMA

### 2. RSI Strategy

- Uses Relative Strength Index
- Buy when RSI < 30 (oversold)
- Sell when RSI > 70 (overbought)

### 3. Random Strategy

- For testing purposes
- Randomly generates buy/sell signals

## Logging

The bot includes comprehensive logging:

- **Console Output**: Colored output for different log levels
- **File Logging**: Optional file logging to `./logs/trading-bot.log`
- **Structured Logging**: JSON format with timestamps and metadata
- **Trade Logging**: Specialized methods for trade execution
- **Error Logging**: Detailed error information with context

## Error Handling

- **API Errors**: Graceful handling of Alpaca API errors
- **Network Errors**: Retry logic and fallback mechanisms
- **Validation**: Input validation for all API endpoints
- **Graceful Shutdown**: Proper cleanup on application exit

## Development

### Adding New Strategies

1. Create a new strategy class implementing `TradingStrategy`
2. Add it to the `StrategyService` constructor
3. Configure strategy parameters

### Adding New API Endpoints

1. Add routes to appropriate route files
2. Implement error handling
3. Add logging
4. Update documentation

## Production Considerations

- **Environment Variables**: Use proper environment variable management
- **Logging**: Configure appropriate log levels for production
- **Monitoring**: Set up monitoring for bot performance
- **Backup**: Regular backup of configuration and logs
- **Security**: Use proper API key management
- **Scaling**: Consider horizontal scaling for multiple bots

## License

MIT License
# trade-ai
