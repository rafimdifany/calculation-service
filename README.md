# Calculation Service

Shopify calculation service untuk kalkulasi harga produk (ocean freight, local delivery, installation) dan pembuatan draft order di Shopify.

## Tech Stack

- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **Validation**: Joi
- **Logging**: Winston
- **Deployment**: Vercel (Serverless)

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

```bash
cp .env.example .env
```

Edit `.env` dan isi dengan credentials yang benar:

| Variable | Description |
|----------|-------------|
| `PORT` | Port server (default: 3000) |
| `NODE_ENV` | Environment (development/production) |
| `CLIENT_ID` | Client ID untuk autentikasi FE |
| `CLIENT_SECRET` | Client Secret untuk autentikasi FE |
| `SHOPIFY_STORE_URL` | URL toko Shopify (e.g., `https://yeswood.myshopify.com`) |
| `SHOPIFY_CLIENT_ID` | Shopify App Client ID |
| `SHOPIFY_CLIENT_SECRET` | Shopify App Client Secret |

### 3. Run Locally

```bash
npm run dev
```

Server akan berjalan di `http://localhost:3000`.

## API Endpoints

### Health Check

```
GET /health
```

### Calculate & Create Draft Order

```
POST /api/v1/calculate
Content-Type: application/json
```

**Request Body:**

```json
{
  "clientId": "your-client-id",
  "clientSecret": "your-client-secret",
  "currency": "SGD",
  "notes": "optional notes",
  "items": [
    {
      "variant_id": 53097199272258,
      "quantity": 1,
      "title": "Walnut High-Back Leather Sofa",
      "tags": "Best Seller, installation-large, Living Room, Sofa",
      "price_display": "1400.00"
    },
    {
      "variant_id": 53213434151234,
      "quantity": 1,
      "title": "Installation Service",
      "tags": "installation-service, service",
      "price_display": "50.00"
    }
  ]
}
```

**Success Response:**

```json
{
  "success": true,
  "checkout_url": "https://yeswood.sg/a/draft_orders/abc123/payment?signature=xxxx",
  "message": "success"
}
```

**Error Response:**

```json
{
  "success": false,
  "message": "error description"
}
```

## Price Policy

| Rule | Condition | Charge |
|------|-----------|--------|
| Ocean Freight | FPA < $4,000 | 10% of FPA |
| Ocean Freight | FPA ≥ $4,000 | FREE |
| Local Delivery | FPA < $2,000 | $40/order |
| Local Delivery | FPA ≥ $2,000 | FREE |
| Installation | FPA < $12,000 | Original price |
| Installation | FPA ≥ $12,000 | FREE |

> **FPA** = Final Product Amount = sum of (price_display × quantity) for product items only (excluding installation-service items).

## Deploy to Vercel

```bash
npx vercel --prod
```

Pastikan environment variables sudah dikonfigurasi di Vercel Dashboard.

## Project Structure

```
calculation-service/
├── api/
│   └── index.js              # Vercel serverless entry point
├── src/
│   ├── app.js                 # Express app setup
│   ├── server.js              # Local dev server entry point
│   ├── controllers/
│   │   └── calculationController.js
│   ├── middlewares/
│   │   ├── authMiddleware.js
│   │   └── validateRequest.js
│   ├── routes/
│   │   └── calculationRoutes.js
│   ├── services/
│   │   ├── calculationService.js
│   │   └── shopifyService.js
│   └── utils/
│       ├── constants.js
│       ├── errors.js
│       └── logger.js
├── .env.example
├── .gitignore
├── package.json
├── README.md
└── vercel.json
```
