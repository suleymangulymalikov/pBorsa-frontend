# Frontend API Documentation - pBorsa Trading Platform

**Version:** 1.0  
**Base URL:** `/api/v1`  
**Last Updated:** January 20, 2026

---

## Table of Contents

1. [Authentication & Authorization](#authentication--authorization)
2. [API Response Format](#api-response-format)
3. [Error Handling](#error-handling)
4. [User Management](#user-management)
5. [Credentials Management](#credentials-management)
6. [Account & Portfolio](#account--portfolio)
7. [Market Data](#market-data)
8. [Trading Strategies](#trading-strategies)
9. [Orders](#orders)
10. [Order History](#order-history)
11. [Admin Operations](#admin-operations)
12. [WebSocket Real-Time Data](#websocket-real-time-data)
13. [Data Models](#data-models)
14. [Validation Rules](#validation-rules)
15. [Status Codes](#status-codes)

---

## Authentication & Authorization

### Authentication Method

- **Type:** Firebase Authentication (JWT Bearer Token)
- **Header:** `Authorization: Bearer <firebase-id-token>`

### User Roles

```typescript
enum UserRole {
  USER = "USER",
  ADMIN = "ADMIN",
}
```

### Authorization Rules

1. **All API endpoints require authentication** (except health checks and docs)
2. Regular users can only access their own data
3. Admin users can access any user's data by specifying `userId` in path
4. Admin-only endpoints require `ROLE_ADMIN` authority

### Public Endpoints (No Auth Required)

- `/swagger-ui/**` - API documentation
- `/v3/api-docs/**` - OpenAPI specs
- `/actuator/health` - Health check
- `/actuator/info` - Application info

---

## API Response Format

All endpoints return responses in a standardized format:

### Success Response

```typescript
{
  "success": true,
  "data": T,              // Response payload (type varies by endpoint)
  "message": string,      // Optional success message
  "timestamp": string     // ISO 8601 timestamp
}
```

### Error Response

```typescript
{
  "success": false,
  "data": null,
  "error": string,        // Error code or message
  "message": string,      // Optional detailed error message
  "timestamp": string     // ISO 8601 timestamp
}
```

---

## Error Handling

### HTTP Status Codes

| Status | Meaning               | Usage                                   |
| ------ | --------------------- | --------------------------------------- |
| 200    | OK                    | Successful GET, PUT, PATCH, DELETE      |
| 201    | Created               | Successful POST (resource created)      |
| 400    | Bad Request           | Validation errors, invalid input        |
| 401    | Unauthorized          | Missing or invalid authentication token |
| 403    | Forbidden             | Insufficient permissions                |
| 404    | Not Found             | Resource does not exist                 |
| 405    | Method Not Allowed    | HTTP method not supported               |
| 429    | Too Many Requests     | Rate limit exceeded (Alpaca API)        |
| 500    | Internal Server Error | Unexpected server error                 |
| 502    | Bad Gateway           | Alpaca API communication error          |
| 503    | Service Unavailable   | Market closed or service down           |

### Error Codes

#### Access Errors

- `ACCESS_DENIED` - User lacks permission to access resource
- `AUTHENTICATION_FAILED` - Invalid authentication credentials
- `UNAUTHORIZED` - No authentication token provided

#### Resource Errors

- `NOT_FOUND` - Requested resource not found
- `CREDENTIALS_NOT_FOUND` - User API credentials not configured

#### Alpaca API Errors

- `INVALID_CREDENTIALS` - Alpaca API keys invalid
- `RATE_LIMIT_EXCEEDED` - Too many API requests
- `INSUFFICIENT_FUNDS` - Not enough buying power
- `INVALID_ORDER` - Order parameters invalid
- `INVALID_SYMBOL` - Stock symbol not found
- `MARKET_CLOSED` - Trading not available (market closed)
- `ORDER_NOT_FOUND` - Order ID not found
- `POSITION_NOT_FOUND` - Position does not exist

#### Validation Errors

- `INVALID_PARAMETER_TYPE` - Parameter type mismatch
- `INVALID_ARGUMENT` - Invalid argument value
- `Validation failed` - Bean validation errors (returns field-level errors)

#### Strategy Errors

- `STRATEGY_NOT_FOUND` - Strategy does not exist
- `INVALID_REQUEST` - Strategy request invalid
- `TRADING_ENGINE_UNAVAILABLE` - Trading engine not available
- `CREDENTIALS_MISSING` - User credentials required
- `DATA_STREAM_ERROR` - Error streaming data to engine

### Validation Error Response

```typescript
{
  "success": false,
  "data": {
    "fieldName1": "Error message 1",
    "fieldName2": "Error message 2"
  },
  "error": "Validation failed",
  "timestamp": "2026-01-20T10:30:00Z"
}
```

---

## User Management

### Get Current User Profile

**Endpoint:** `GET /users/me`  
**Auth:** Required  
**Description:** Returns the authenticated user's profile

**Response:**

```typescript
{
  "success": true,
  "data": {
    "id": number,
    "firebaseUid": string,
    "email": string,
    "displayName": string,
    "provider": string,           // "GOOGLE", "EMAIL", etc.
    "status": UserStatus,         // "ACTIVE" | "DISABLED" | "DELETED"
    "createdAt": string,          // ISO 8601 timestamp
    "updatedAt": string
  }
}
```

---

## Credentials Management

### Register/Update Alpaca API Credentials

**Endpoint:** `POST /credentials/{userId}`  
**Auth:** Required  
**Description:** Registers or updates user's Alpaca API credentials

**Request Body:**

```typescript
{
  "apiKey": string,              // 10-100 chars, required
  "secretKey": string,           // 10-100 chars, required
  "paperTrading": boolean        // true for paper trading (default: true)
}
```

**Response:**

```typescript
{
  "success": true,
  "data": true,
  "message": "Credentials registered successfully"
}
```

**Validation:**

- API key and secret key are verified with Alpaca before saving
- Returns 400 Bad Request if credentials are invalid

### Check Credentials Status

**Endpoint:** `GET /credentials/{userId}/status`  
**Auth:** Required

**Response:**

```typescript
{
  "success": true,
  "data": boolean  // true if credentials exist and are active
}
```

### Deactivate Credentials

**Endpoint:** `DELETE /credentials/{userId}`  
**Auth:** Required  
**Description:** Soft-deactivates stored credentials

**Response:**

```typescript
{
  "success": true,
  "message": "Credentials deactivated successfully"
}
```

### Refresh Credentials Cache

**Endpoint:** `POST /credentials/{userId}/refresh`  
**Auth:** Required  
**Description:** Reloads cached credentials from database

**Response:**

```typescript
{
  "success": true,
  "message": "Credentials cache refreshed"
}
```

---

## Account & Portfolio

### Get Account Information

**Endpoint:** `GET /account/{userId}`  
**Auth:** Required  
**Description:** Returns Alpaca account state for the user

**Response:**

```typescript
{
  "success": true,
  "data": {
    "accountId": string,
    "accountNumber": string,
    "status": AccountStatus,        // See AccountStatus enum below
    "currency": string,             // "USD"
    "cash": number,                 // Available cash
    "portfolioValue": number,       // Total portfolio value
    "buyingPower": number,          // Available buying power
    "equity": number,               // Current equity
    "lastEquity": number,           // Previous equity (for P/L calc)
    "longMarketValue": number,      // Value of long positions
    "shortMarketValue": number,     // Value of short positions
    "initialMargin": number,
    "maintenanceMargin": number,
    "lastMaintenanceMargin": number,
    "daytradeCount": number,
    "patternDayTrader": boolean,    // PDT flag
    "tradingBlocked": boolean,
    "transfersBlocked": boolean,
    "accountBlocked": boolean,
    "tradeSuspendedByUser": boolean,
    "createdAt": string,
    "updatedAt": string
  }
}
```

**AccountStatus Enum:**

```typescript
enum AccountStatus {
  ACTIVE = "ACTIVE",
  ONBOARDING = "ONBOARDING",
  SUBMISSION_FAILED = "SUBMISSION_FAILED",
  SUBMITTED = "SUBMITTED",
  ACTION_REQUIRED = "ACTION_REQUIRED",
  ACCOUNT_UPDATED = "ACCOUNT_UPDATED",
  DISABLED = "DISABLED",
  APPROVAL_PENDING = "APPROVAL_PENDING",
}
```

### Get Buying Power

**Endpoint:** `GET /account/{userId}/buying-power`  
**Auth:** Required

**Response:**

```typescript
{
  "success": true,
  "data": number  // Buying power amount
}
```

### Get Cash Balance

**Endpoint:** `GET /account/{userId}/cash`  
**Auth:** Required

**Response:**

```typescript
{
  "success": true,
  "data": number  // Cash balance
}
```

### Get Equity

**Endpoint:** `GET /account/{userId}/equity`  
**Auth:** Required

**Response:**

```typescript
{
  "success": true,
  "data": number  // Account equity
}
```

### Check If Can Trade

**Endpoint:** `GET /account/{userId}/can-trade`  
**Auth:** Required

**Response:**

```typescript
{
  "success": true,
  "data": boolean  // true if account can trade
}
```

### Refresh Account Info

**Endpoint:** `POST /account/{userId}/refresh`  
**Auth:** Required  
**Description:** Forces a fresh fetch from Alpaca and updates cache

**Response:**

```typescript
{
  "success": true,
  "data": AccountInfoDto,  // Same as Get Account Info
  "message": "Account info refreshed"
}
```

### Get All Positions

**Endpoint:** `GET /account/{userId}/positions`  
**Auth:** Required  
**Description:** Returns all open positions

**Response:**

```typescript
{
  "success": true,
  "data": [
    {
      "assetId": string,
      "symbol": string,
      "exchange": string,
      "assetClass": string,          // "us_equity"
      "averageEntryPrice": number,
      "quantity": number,
      "side": string,                // "long" | "short"
      "marketValue": number,
      "costBasis": number,
      "unrealizedPnL": number,
      "unrealizedPnLPercent": number,
      "unrealizedIntradayPnL": number,
      "unrealizedIntradayPnLPercent": number,
      "currentPrice": number,
      "lastDayPrice": number,
      "changeToday": number
    }
  ]
}
```

### Get Single Position

**Endpoint:** `GET /account/{userId}/positions/{symbol}`  
**Auth:** Required  
**Path Parameters:**

- `symbol` - Stock symbol (e.g., "AAPL")

**Response:**

```typescript
{
  "success": true,
  "data": PositionDto  // Same structure as above
}
```

### Get Portfolio Value

**Endpoint:** `GET /account/{userId}/portfolio-value`  
**Auth:** Required

**Response:**

```typescript
{
  "success": true,
  "data": number  // Total portfolio market value
}
```

### Get Unrealized P&L

**Endpoint:** `GET /account/{userId}/unrealized-pnl`  
**Auth:** Required

**Response:**

```typescript
{
  "success": true,
  "data": number  // Total unrealized profit/loss
}
```

---

## Market Data

### Get Latest Quotes

**Endpoint:** `GET /market-data/{userId}/quotes`  
**Auth:** Required  
**Query Parameters:**

- `symbols` - Comma-separated list of symbols (e.g., "AAPL,GOOGL,MSFT")

**Response:**

```typescript
{
  "success": true,
  "data": [
    {
      "symbol": string,
      "bidPrice": number,
      "bidSize": number,
      "askPrice": number,
      "askSize": number,
      "timestamp": string,    // ISO 8601
      "exchange": string,
      "tape": string
    }
  ]
}
```

### Get Single Quote

**Endpoint:** `GET /market-data/{userId}/quotes/{symbol}`  
**Auth:** Required

**Response:**

```typescript
{
  "success": true,
  "data": StockQuoteDto  // Same structure as above
}
```

### Get Latest Quotes (Async)

**Endpoint:** `GET /market-data/{userId}/quotes/async`  
**Auth:** Required  
**Query Parameters:**

- `symbols` - Comma-separated list of symbols

**Response:** Same as Get Latest Quotes (asynchronous processing)

### Get Latest Trades

**Endpoint:** `GET /market-data/{userId}/trades`  
**Auth:** Required  
**Query Parameters:**

- `symbols` - Comma-separated list of symbols

**Response:**

```typescript
{
  "success": true,
  "data": [
    {
      "symbol": string,
      "price": number,
      "size": number,
      "timestamp": string,
      "exchange": string,
      "tradeId": string,
      "tape": string,
      "conditions": string
    }
  ]
}
```

### Get Historical Bars

**Endpoint:** `GET /market-data/{userId}/bars/{symbol}`  
**Auth:** Required  
**Path Parameters:**

- `symbol` - Stock symbol

**Query Parameters:**

- `timeframe` - Number (default: 1)
- `period` - "DAY" | "MINUTE" | "HOUR" (default: "DAY")
- `start` - ISO 8601 datetime (optional, default: 30 days ago)
- `end` - ISO 8601 datetime (optional, default: now)
- `limit` - Number (default: 100)

**Response:**

```typescript
{
  "success": true,
  "data": [
    {
      "symbol": string,
      "open": number,
      "high": number,
      "low": number,
      "close": number,
      "volume": number,
      "tradeCount": number,
      "vwap": number,          // Volume-weighted average price
      "timestamp": string
    }
  ]
}
```

### Get Market Data Snapshot

**Endpoint:** `GET /market-data/{userId}/snapshot`  
**Auth:** Required  
**Query Parameters:**

- `symbols` - Comma-separated list of symbols

**Response:**

```typescript
{
  "success": true,
  "data": {
    "quotes": StockQuoteDto[],
    "latestTrades": StockTradeDto[],
    "latestBars": StockBarDto[],
    "snapshotTimestamp": string,
    "dataSource": string
  }
}
```

### Get Snapshot (Async)

**Endpoint:** `GET /market-data/{userId}/snapshot/async`  
**Auth:** Required  
**Query Parameters:**

- `symbols` - Comma-separated list of symbols

**Response:** Same as Get Market Data Snapshot (asynchronous)

### Start Market Data Polling

**Endpoint:** `POST /market-data/{userId}/polling/start`  
**Auth:** Required  
**Description:** Starts a Temporal workflow to continuously poll market data

**Query Parameters:**

- `symbols` - Comma-separated list of symbols
- `intervalSeconds` - Polling interval (default: 5)

**Response:**

```typescript
{
  "success": true,
  "data": string,  // Workflow ID
  "message": "Polling started"
}
```

### Add Symbols to Polling

**Endpoint:** `POST /market-data/{userId}/polling/symbols`  
**Auth:** Required  
**Query Parameters:**

- `symbols` - Comma-separated list of symbols to add

**Response:**

```typescript
{
  "success": true,
  "message": "Symbols added to polling"
}
```

### Remove Symbols from Polling

**Endpoint:** `DELETE /market-data/{userId}/polling/symbols`  
**Auth:** Required  
**Query Parameters:**

- `symbols` - Comma-separated list of symbols to remove

**Response:**

```typescript
{
  "success": true,
  "message": "Symbols removed from polling"
}
```

### Get Latest Quotes from Polling

**Endpoint:** `GET /market-data/{userId}/polling/quotes`  
**Auth:** Required

**Response:**

```typescript
{
  "success": true,
  "data": StockQuoteDto[]
}
```

### Stop Polling

**Endpoint:** `POST /market-data/{userId}/polling/stop`  
**Auth:** Required

**Response:**

```typescript
{
  "success": true,
  "message": "Polling stopped"
}
```

---

## Trading Strategies

### List Base Strategies (Catalog)

**Endpoint:** `GET /strategies`  
**Auth:** Required  
**Description:** Gets all available strategy templates

**Response:**

```typescript
{
  "success": true,
  "data": [
    {
      "id": number,
      "code": string,           // e.g., "MOMENTUM_V1"
      "name": string,
      "description": string,
      "active": boolean,
      "createdAt": string,
      "updatedAt": string
    }
  ]
}
```

### Get Base Strategy by Code

**Endpoint:** `GET /strategies/{code}`  
**Auth:** Required  
**Path Parameters:**

- `code` - Strategy code (e.g., "MOMENTUM_V1")

**Response:**

```typescript
{
  "success": true,
  "data": BaseStrategyDto  // Same structure as above
}
```

**Error (404):**

```typescript
{
  "success": false,
  "error": "Strategy not found: {code}"
}
```

### List User Strategies

**Endpoint:** `GET /users/{userId}/strategies`  
**Auth:** Required  
**Description:** Gets all strategy subscriptions for a user

**Response:**

```typescript
{
  "success": true,
  "data": [
    {
      "id": number,
      "name": string,
      "baseStrategy": BaseStrategyDto,
      "symbol": string,
      "status": UserStrategyStatus,  // See enum below
      "budget": number,
      "createdAt": string,
      "updatedAt": string
    }
  ]
}
```

**UserStrategyStatus Enum:**

```typescript
enum UserStrategyStatus {
  CREATED = "CREATED", // Created but not activated
  PREPARING = "PREPARING", // Data transfer to trading engine in progress
  ACTIVE = "ACTIVE", // Running and generating orders
  PAUSED = "PAUSED", // Temporarily paused
  STOPPED = "STOPPED", // Stopped permanently
}

// Allowed status transitions:
// CREATED → PREPARING
// PREPARING → ACTIVE | STOPPED
// ACTIVE → PAUSED | STOPPED
// PAUSED → ACTIVE | STOPPED
// STOPPED → (no transitions allowed)
```

### Get User Strategy by ID

**Endpoint:** `GET /users/{userId}/strategies/{strategyId}`  
**Auth:** Required

**Response:**

```typescript
{
  "success": true,
  "data": UserStrategyDto  // Same structure as List User Strategies
}
```

**Error (404):**

```typescript
{
  "success": false,
  "error": "Strategy not found"
}
```

### Create User Strategy

**Endpoint:** `POST /users/{userId}/strategies`  
**Auth:** Required  
**Description:** Creates a new strategy subscription

**Request Body:**

```typescript
{
  "baseStrategyCode": string,  // Required, base strategy code
  "name": string,              // Required, max 128 chars
  "symbol": string,            // Required, max 16 chars
  "budget": number             // Required, min 0.01
}
```

**Validation:**

- `baseStrategyCode`: Required, must exist in catalog
- `name`: Required, max 128 characters
- `symbol`: Required, max 16 characters, valid stock symbol
- `budget`: Required, minimum 0.01

**Response (201 Created):**

```typescript
{
  "success": true,
  "data": UserStrategyDto
}
```

**Error (400 Bad Request):**

```typescript
{
  "success": false,
  "data": {
    "baseStrategyCode": "Base strategy code is required",
    "name": "Name is required",
    "symbol": "Symbol is required",
    "budget": "Budget must be greater than 0"
  },
  "error": "Validation failed"
}
```

### Update User Strategy

**Endpoint:** `PATCH /users/{userId}/strategies/{strategyId}`  
**Auth:** Required  
**Description:** Updates strategy name or status

**Request Body (all fields optional):**

```typescript
{
  "name": string,    // Optional, max 128 chars
  "status": string   // Optional: "ACTIVE" | "PAUSED" | "STOPPED"
}
```

**Response:**

```typescript
{
  "success": true,
  "data": UserStrategyDto
}
```

**Error (404):**

```typescript
{
  "success": false,
  "error": "Strategy not found"
}
```

### Delete User Strategy

**Endpoint:** `DELETE /users/{userId}/strategies/{strategyId}`  
**Auth:** Required

**Response:**

```typescript
{
  "success": true,
  "data": null
}
```

**Error (404):**

```typescript
{
  "success": false,
  "error": "Strategy not found"
}
```

### Activate User Strategy

**Endpoint:** `POST /users/{userId}/strategies/{strategyId}/activate`  
**Auth:** Required  
**Description:** Activates a strategy (must be in CREATED status)

**Response:**

```typescript
{
  "success": true,
  "data": UserStrategyDto,  // status will be "PREPARING"
  "message": "Strategy activation started"
}
```

**Business Rules:**

- Strategy must be in `CREATED` status
- Status transitions to `PREPARING` immediately
- Once data transfer completes, status becomes `ACTIVE`
- Returns 400 if strategy is not in valid state

### Get Strategy P&L

**Endpoint:** `GET /users/{userId}/strategies/{strategyId}/pnl`  
**Auth:** Required  
**Description:** Gets profit/loss data for a strategy

**Response:**

```typescript
{
  "success": true,
  "data": {
    "strategyId": number,
    "symbol": string,
    "realizedPnL": number,          // Profit/loss from closed positions
    "unrealizedPnL": number,        // Current position P&L
    "totalPnL": number,             // realizedPnL + unrealizedPnL
    "totalShares": number,          // Current position size
    "averageCostPerShare": number,
    "currentPrice": number,
    "totalCostBasis": number,
    "updatedAt": string
  }
}
```

---

## Orders

### Get Orders by User Strategy

**Endpoint:** `GET /orders/{userId}/strategy/{userStrategyId}`  
**Auth:** Required  
**Description:** Gets all orders for a specific user strategy

**Response:**

```typescript
{
  "success": true,
  "data": [
    {
      "id": string,                    // UUID (internal)
      "orderId": string,               // Alpaca order ID
      "clientOrderId": string,
      "symbol": string,
      "quantity": number,
      "filledQuantity": number,
      "side": OrderSide,               // "BUY" | "SELL"
      "type": OrderType,               // See enum below
      "timeInForce": TimeInForce,      // See enum below
      "limitPrice": number,
      "stopPrice": number,
      "filledAveragePrice": number,
      "status": OrderStatus,           // See enum below
      "message": string,
      "extendedHours": boolean,
      "createdAt": string,
      "updatedAt": string,
      "submittedAt": string,
      "filledAt": string,
      "expiredAt": string,
      "cancelledAt": string,
      "assetClass": string,
      "userStrategyId": number
    }
  ]
}
```

**OrderSide Enum:**

```typescript
enum OrderSide {
  BUY = "BUY",
  SELL = "SELL",
}
```

**OrderType Enum:**

```typescript
enum OrderType {
  MARKET = "MARKET",
  LIMIT = "LIMIT",
  STOP = "STOP",
  STOP_LIMIT = "STOP_LIMIT",
  TRAILING_STOP = "TRAILING_STOP",
}
```

**TimeInForce Enum:**

```typescript
enum TimeInForce {
  DAY = "DAY", // Good for day
  GTC = "GTC", // Good till canceled
  IOC = "IOC", // Immediate or cancel
  FOK = "FOK", // Fill or kill
  GTD = "GTD", // Good till date
  OPG = "OPG", // Market on open
  CLS = "CLS", // Market on close
}
```

**OrderStatus Enum:**

```typescript
enum OrderStatus {
  ACCEPTED_BY_APP = "ACCEPTED_BY_APP",
  NEW = "NEW",
  PARTIALLY_FILLED = "PARTIALLY_FILLED",
  FILLED = "FILLED",
  DONE_FOR_DAY = "DONE_FOR_DAY",
  CANCELED = "CANCELED",
  CANCEL_REQUESTED = "CANCEL_REQUESTED",
  EXPIRED = "EXPIRED",
  REPLACED = "REPLACED",
  PENDING_CANCEL = "PENDING_CANCEL",
  PENDING_REPLACE = "PENDING_REPLACE",
  PENDING_NEW = "PENDING_NEW",
  ACCEPTED = "ACCEPTED",
  ACCEPTED_FOR_BIDDING = "ACCEPTED_FOR_BIDDING",
  STOPPED = "STOPPED",
  REJECTED = "REJECTED",
  SUSPENDED = "SUSPENDED",
  CALCULATED = "CALCULATED",
  HELD = "HELD",
}
```

### Get Order by ID

**Endpoint:** `GET /orders/{userId}/{orderId}`  
**Auth:** Required  
**Path Parameters:**

- `orderId` - UUID (internal order ID)

**Response:**

```typescript
{
  "success": true,
  "data": OrderDetailDto  // Same structure as above
}
```

**Error (404):**

```typescript
{
  "success": false,
  "error": "Order not found"
}
```

---

## Order History

### Get Order History

**Endpoint:** `GET /orders/{userId}/{orderId}/history`  
**Auth:** Required  
**Description:** Gets status change history for an order

**Response:**

```typescript
{
  "success": true,
  "data": [
    {
      "id": string,              // UUID
      "orderId": string,         // UUID (internal order ID)
      "status": OrderStatus,
      "reason": OrderStatusReason,  // See enum below
      "message": string,
      "createdAt": string
    }
  ]
}
```

**OrderStatusReason Enum:**

```typescript
enum OrderStatusReason {
  CREATED = "CREATED",
  SUBMITTED = "SUBMITTED",
  FILLED = "FILLED",
  PARTIALLY_FILLED = "PARTIALLY_FILLED",
  CANCELED_BY_USER = "CANCELED_BY_USER",
  CANCELED_BY_SYSTEM = "CANCELED_BY_SYSTEM",
  EXPIRED = "EXPIRED",
  REJECTED = "REJECTED",
  REPLACED = "REPLACED",
  INSUFFICIENT_FUNDS = "INSUFFICIENT_FUNDS",
  MARKET_CLOSED = "MARKET_CLOSED",
  UNKNOWN = "UNKNOWN",
}
```

### Get Order History Entry

**Endpoint:** `GET /orders/{userId}/history/{historyId}`  
**Auth:** Required  
**Path Parameters:**

- `historyId` - UUID (history entry ID)

**Response:**

```typescript
{
  "success": true,
  "data": OrderHistoryDto  // Same structure as above
}
```

**Error (404):**

```typescript
{
  "success": false,
  "error": "Order history entry not found"
}
```

---

## Admin Operations

**All admin endpoints require `ROLE_ADMIN` authority**

### Set Admin Status

**Endpoint:** `PUT /admin/users/{targetUserId}/admin`  
**Auth:** Admin required

**Request Body:**

```typescript
{
  "admin": boolean  // true to grant, false to revoke
}
```

**Response:**

```typescript
{
  "success": true,
  "data": {
    "userId": number,
    "admin": boolean
  }
}
```

### Get Admin Status

**Endpoint:** `GET /admin/users/{targetUserId}/admin`  
**Auth:** Admin required

**Response:**

```typescript
{
  "success": true,
  "data": {
    "userId": number,
    "admin": boolean
  }
}
```

### Grant Admin Privileges

**Endpoint:** `POST /admin/users/{targetUserId}/grant`  
**Auth:** Admin required  
**Description:** Convenience endpoint (equivalent to PUT with admin=true)

**Response:**

```typescript
{
  "success": true,
  "data": {
    "userId": number,
    "admin": true
  }
}
```

### Revoke Admin Privileges

**Endpoint:** `POST /admin/users/{targetUserId}/revoke`  
**Auth:** Admin required  
**Description:** Convenience endpoint (equivalent to PUT with admin=false)

**Response:**

```typescript
{
  "success": true,
  "data": {
    "userId": number,
    "admin": false
  }
}
```

### Get Order by ID (Admin)

**Endpoint:** `GET /admin/orders/{orderId}`  
**Auth:** Admin required  
**Description:** Gets order details without user ownership validation

**Response:**

```typescript
{
  "success": true,
  "data": OrderDetailDto
}
```

### Get Order History (Admin)

**Endpoint:** `GET /admin/orders/{orderId}/history`  
**Auth:** Admin required  
**Description:** Gets order history without user ownership validation

**Response:**

```typescript
{
  "success": true,
  "data": OrderHistoryDto[]
}
```

### Get Order History Entry (Admin)

**Endpoint:** `GET /admin/history/{historyId}`  
**Auth:** Admin required

**Response:**

```typescript
{
  "success": true,
  "data": OrderHistoryDto
}
```

---

## WebSocket Real-Time Data

**Connection Endpoint:** `/ws` (STOMP over WebSocket)

### Authentication

WebSocket connections must include Firebase ID token in connection headers:

```typescript
const headers = {
  Authorization: `Bearer ${firebaseIdToken}`,
};
```

### Subscribe to Real-Time Quotes

**Destination:** `/app/subscribe/quotes/{userId}`  
**Payload:**

```typescript
["AAPL", "GOOGL", "MSFT"]; // Array of symbols
```

**Receive Messages On:** `/topic/quotes/{userId}`  
**Message Format:**

```typescript
{
  "symbol": string,
  "bidPrice": number,
  "bidSize": number,
  "askPrice": number,
  "askSize": number,
  "timestamp": string,
  "exchange": string,
  "tape": string
}
```

### Subscribe to Real-Time Trades

**Destination:** `/app/subscribe/trades/{userId}`  
**Payload:**

```typescript
["AAPL", "GOOGL", "MSFT"]; // Array of symbols
```

**Receive Messages On:** `/topic/trades/{userId}`  
**Message Format:**

```typescript
{
  "symbol": string,
  "price": number,
  "size": number,
  "timestamp": string,
  "exchange": string,
  "tradeId": string,
  "tape": string,
  "conditions": string
}
```

### Unsubscribe from Symbols

**Destination:** `/app/unsubscribe/{userId}`  
**Payload:**

```typescript
["AAPL", "GOOGL"]; // Array of symbols to unsubscribe
```

### Disconnect

**Destination:** `/app/disconnect/{userId}`  
**Description:** Cleanly disconnects user's WebSocket session

### WebSocket Implementation Example (JavaScript)

```javascript
import { Stomp } from "@stomp/stompjs";
import SockJS from "sockjs-client";

// Create connection
const socket = new SockJS("/ws");
const stompClient = Stomp.over(socket);

// Connect with authentication
stompClient.connect(
  { Authorization: `Bearer ${firebaseIdToken}` },
  (frame) => {
    console.log("Connected:", frame);

    // Subscribe to quotes
    stompClient.subscribe(`/topic/quotes/${userId}`, (message) => {
      const quote = JSON.parse(message.body);
      console.log("Quote received:", quote);
    });

    // Subscribe to quotes
    stompClient.send(
      `/app/subscribe/quotes/${userId}`,
      {},
      JSON.stringify(["AAPL", "GOOGL", "MSFT"]),
    );
  },
  (error) => {
    console.error("Connection error:", error);
  },
);
```

---

## Data Models

### User Profile

```typescript
interface UserProfileDto {
  id: number;
  firebaseUid: string;
  email: string;
  displayName: string;
  provider: string;
  status: UserStatus;
  createdAt: string;
  updatedAt: string;
}

enum UserStatus {
  ACTIVE = "ACTIVE",
  DISABLED = "DISABLED",
  DELETED = "DELETED",
}
```

### Base Strategy

```typescript
interface BaseStrategyDto {
  id: number;
  code: string;
  name: string;
  description: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}
```

### User Strategy

```typescript
interface UserStrategyDto {
  id: number;
  name: string;
  baseStrategy: BaseStrategyDto;
  symbol: string;
  status: UserStrategyStatus;
  budget: number;
  createdAt: string;
  updatedAt: string;
}

enum UserStrategyStatus {
  CREATED = "CREATED",
  PREPARING = "PREPARING",
  ACTIVE = "ACTIVE",
  PAUSED = "PAUSED",
  STOPPED = "STOPPED",
}
```

### Order Detail

```typescript
interface OrderDetailDto {
  id: string; // UUID
  orderId: string; // Alpaca order ID
  clientOrderId: string;
  symbol: string;
  quantity: number;
  filledQuantity: number;
  side: OrderSide;
  type: OrderType;
  timeInForce: TimeInForce;
  limitPrice: number | null;
  stopPrice: number | null;
  filledAveragePrice: number | null;
  status: OrderStatus;
  message: string | null;
  extendedHours: boolean;
  createdAt: string;
  updatedAt: string;
  submittedAt: string | null;
  filledAt: string | null;
  expiredAt: string | null;
  cancelledAt: string | null;
  assetClass: string;
  userStrategyId: number;
}
```

### Order History

```typescript
interface OrderHistoryDto {
  id: string; // UUID
  orderId: string; // UUID
  status: OrderStatus;
  reason: OrderStatusReason;
  message: string | null;
  createdAt: string;
}
```

### Account Info

```typescript
interface AccountInfoDto {
  accountId: string;
  accountNumber: string;
  status: AccountStatus;
  currency: string;
  cash: number;
  portfolioValue: number;
  buyingPower: number;
  equity: number;
  lastEquity: number;
  longMarketValue: number;
  shortMarketValue: number;
  initialMargin: number;
  maintenanceMargin: number;
  lastMaintenanceMargin: number;
  daytradeCount: number;
  patternDayTrader: boolean;
  tradingBlocked: boolean;
  transfersBlocked: boolean;
  accountBlocked: boolean;
  tradeSuspendedByUser: boolean;
  createdAt: string;
  updatedAt: string;
}
```

### Position

```typescript
interface PositionDto {
  assetId: string;
  symbol: string;
  exchange: string;
  assetClass: string;
  averageEntryPrice: number;
  quantity: number;
  side: string;
  marketValue: number;
  costBasis: number;
  unrealizedPnL: number;
  unrealizedPnLPercent: number;
  unrealizedIntradayPnL: number;
  unrealizedIntradayPnLPercent: number;
  currentPrice: number;
  lastDayPrice: number;
  changeToday: number;
}
```

### Stock Quote

```typescript
interface StockQuoteDto {
  symbol: string;
  bidPrice: number;
  bidSize: number;
  askPrice: number;
  askSize: number;
  timestamp: string;
  exchange: string;
  tape: string;
}
```

### Stock Trade

```typescript
interface StockTradeDto {
  symbol: string;
  price: number;
  size: number;
  timestamp: string;
  exchange: string;
  tradeId: string;
  tape: string;
  conditions: string;
}
```

### Stock Bar (OHLCV)

```typescript
interface StockBarDto {
  symbol: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  tradeCount: number;
  vwap: number;
  timestamp: string;
}
```

### Market Data Snapshot

```typescript
interface MarketDataSnapshot {
  quotes: StockQuoteDto[];
  latestTrades: StockTradeDto[];
  latestBars: StockBarDto[];
  snapshotTimestamp: string;
  dataSource: string;
}
```

### Strategy P&L

```typescript
interface StrategyPnLDto {
  strategyId: number;
  symbol: string;
  realizedPnL: number;
  unrealizedPnL: number;
  totalPnL: number;
  totalShares: number;
  averageCostPerShare: number;
  currentPrice: number;
  totalCostBasis: number;
  updatedAt: string;
}
```

---

## Validation Rules

### Credentials Registration

- `apiKey`: Required, 10-100 characters
- `secretKey`: Required, 10-100 characters
- `paperTrading`: Optional, defaults to true
- Credentials are validated with Alpaca API before saving

### Create User Strategy

- `baseStrategyCode`: Required, must exist in catalog
- `name`: Required, max 128 characters
- `symbol`: Required, max 16 characters, valid stock symbol
- `budget`: Required, minimum 0.01

### Update User Strategy

- `name`: Optional, max 128 characters
- `status`: Optional, must be valid UserStrategyStatus value

### Admin Set Status

- `admin`: Required, boolean value

### Query Parameters

- `symbols`: Required for market data endpoints, comma-separated stock symbols
- `timeframe`: Optional, positive integer
- `period`: Optional, one of: "DAY", "MINUTE", "HOUR"
- `start`/`end`: Optional, valid ISO 8601 datetime strings
- `limit`: Optional, positive integer
- `intervalSeconds`: Optional, positive integer (default: 5)

---

## Status Codes

### Success Codes

- **200 OK** - Successful GET, PUT, PATCH, DELETE operations
- **201 Created** - Successful POST creating a new resource

### Client Error Codes

- **400 Bad Request** - Invalid request parameters or validation errors
- **401 Unauthorized** - Missing or invalid authentication token
- **403 Forbidden** - User lacks required permissions
- **404 Not Found** - Requested resource does not exist
- **405 Method Not Allowed** - HTTP method not supported for endpoint
- **429 Too Many Requests** - Rate limit exceeded (Alpaca API)

### Server Error Codes

- **500 Internal Server Error** - Unexpected server error
- **502 Bad Gateway** - External service (Alpaca API) error
- **503 Service Unavailable** - Service temporarily unavailable (e.g., market closed)

---

## Business Rules

### User Strategy Activation

1. Strategy must be in `CREATED` status to activate
2. Activation immediately transitions status to `PREPARING`
3. Data is streamed to the trading engine
4. Once data transfer completes, status becomes `ACTIVE`
5. User cannot directly set status to `PREPARING` or `ACTIVE`

### User Strategy Status Transitions

- `CREATED` → `PREPARING` (via activation)
- `PREPARING` → `ACTIVE` (automated) or `STOPPED` (manual)
- `ACTIVE` → `PAUSED` or `STOPPED`
- `PAUSED` → `ACTIVE` or `STOPPED`
- `STOPPED` → No further transitions allowed

### Access Control

1. Regular users can only access their own data
2. Admin users can access any user's data
3. User ownership is enforced via `SecurityService.resolveTargetUserId()`
4. Admin-only endpoints require `@PreAuthorize("hasRole('ADMIN')")`

### Credentials Validation

- API credentials are verified with Alpaca before saving
- Invalid credentials result in 400 Bad Request
- Credentials can be soft-deactivated (not deleted)

### Account Trading Restrictions

- Trading is blocked if: `tradingBlocked`, `accountBlocked`, `tradeSuspendedByUser`, or `status != ACTIVE`
- Pattern Day Trader (PDT) flag affects daytrade limits
- Buying power must be sufficient for orders

### Order Lifecycle

1. Order created: `ACCEPTED_BY_APP`
2. Submitted to Alpaca: `NEW`
3. Execution: `PARTIALLY_FILLED` → `FILLED`
4. Terminal states: `FILLED`, `CANCELED`, `EXPIRED`, `REJECTED`

---

## Rate Limiting

### Alpaca API Limits

- Market Data: 200 requests/minute (paper trading)
- Trading: 200 requests/minute
- Account: 200 requests/minute

When rate limits are exceeded, API returns **429 Too Many Requests**

### Best Practices

1. Use WebSocket for real-time data instead of polling
2. Use the polling workflow for periodic updates
3. Implement exponential backoff on retries
4. Cache account/position data when possible
5. Batch symbol requests in market data calls

---

## Pagination & Filtering

**Current Status:** The API does not implement pagination or advanced filtering at this time.

**For Large Datasets:**

- Order history: Returns all entries for an order
- User strategies: Returns all strategies for a user
- Positions: Returns all open positions

**Future Enhancements:**

- Page-based pagination with `page` and `size` parameters
- Filtering by date ranges, status, symbols
- Sorting by creation date, P&L, etc.

---

## Frontend Implementation Guide

### Authentication Flow

1. User authenticates with Firebase (Google, email, etc.)
2. Obtain Firebase ID token
3. Include token in `Authorization` header for all API requests
4. Token expires after 1 hour - refresh as needed

### Initial User Setup Flow

1. User logs in → Call `GET /users/me` to sync profile
2. Check credentials → Call `GET /credentials/{userId}/status`
3. If no credentials → Prompt user to register Alpaca keys
4. User provides keys → Call `POST /credentials/{userId}` to register

### Strategy Management Flow

1. List available strategies → `GET /strategies`
2. Create subscription → `POST /users/{userId}/strategies`
3. Activate strategy → `POST /users/{userId}/strategies/{id}/activate`
4. Monitor status → Poll `GET /users/{userId}/strategies/{id}` until `ACTIVE`
5. View performance → `GET /users/{userId}/strategies/{id}/pnl`

### Real-Time Market Data Flow

1. Connect to WebSocket endpoint
2. Subscribe to quotes/trades for symbols
3. Receive real-time updates on subscribed topics
4. Unsubscribe when no longer needed
5. Disconnect on component unmount

### Portfolio Monitoring

1. Get account info → `GET /account/{userId}`
2. Get positions → `GET /account/{userId}/positions`
3. Calculate metrics using response data (P&L, allocation, etc.)
4. Refresh periodically or use WebSocket for live updates

### Order Tracking

1. List orders by strategy → `GET /orders/{userId}/strategy/{strategyId}`
2. Get order details → `GET /orders/{userId}/{orderId}`
3. View order history → `GET /orders/{userId}/{orderId}/history`
4. Display status updates and transitions

### Error Handling

1. Check `success` field in response
2. Display `error` message to user
3. For validation errors, show field-level errors from `data` object
4. Handle 401 by refreshing authentication token
5. Handle 403 by showing "Access Denied" message
6. Handle 429 by implementing retry with exponential backoff

---

## Environment Configuration

### Base URL

- **Development:** `http://localhost:8080/api/v1`
- **Production:** `https://api.pborsa.com/api/v1`

### WebSocket URL

- **Development:** `ws://localhost:8080/ws`
- **Production:** `wss://api.pborsa.com/ws`

### Alpaca API

- **Paper Trading:** Credentials registered with `paperTrading: true`
- **Live Trading:** Credentials registered with `paperTrading: false`

---

## API Changelog

### Version 1.0 (Current)

- Initial API release
- User authentication and profile management
- Alpaca credentials management
- Account and position tracking
- Market data (REST and WebSocket)
- Trading strategy subscriptions
- Order management and history
- Admin operations
- Real-time data streaming via WebSocket

---

## Support & Contact

For API support, issues, or questions:

- **Documentation:** `/swagger-ui/index.html`
- **Health Check:** `/actuator/health`
- **OpenAPI Spec:** `/v3/api-docs`

---

**End of Documentation**
