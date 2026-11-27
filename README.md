# Virar Organics Backend

Online store, admin panel and mini CRM API. Built phase by phase; this ZIP contains **Phase 1 + Phase 2 + Phase 3**.

## Setup

1. Install Node.js 18.18+ and PostgreSQL.
2. `npm install`
3. `cp .env.example .env`, then set `DATABASE_URL` and a `JWT_SECRET` of at least 32 characters.
4. Create the tables: `npm run prisma:migrate` (name the migration `init`).
5. Seed roles, permissions and accounts: `npm run db:seed`
6. Start: `npm run dev` (API at `http://localhost:5000/api`)

Seeded accounts (override via `SEED_*` variables; required in production):

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@virarorganics.test | Admin@12345 |
| Sales Executive | sales@virarorganics.test | Sales@12345 |
| Customer | customer@virarorganics.test | Customer@12345 |

Change these passwords outside local development.

## Response format

Success: `{ "success": true, "data": ..., "meta": { page, limit, total, totalPages } }`
Error: `{ "success": false, "error": { "message": "...", "details": [...] } }`

Send the token as `Authorization: Bearer <token>`.

## How dynamic RBAC works

- A JWT holds only the user id and a token version. Role and permissions are **not** stored in the token.
- `authenticate` loads the user, role and permission keys from PostgreSQL on every request.
- `requirePermissions('leads:read')` checks that live set, so granting, revoking or reassigning a role applies on the next request.
- Deactivating a user or changing a password bumps `tokenVersion`, which invalidates existing tokens.
- New permissions created through the API are granted to Admin automatically. The Admin role is locked, and the last active Admin cannot be demoted or deactivated.
- Revoking a user's role moves them to the Customer role.

## Phase 1 endpoints

| Method | Path | Permission |
|--------|------|-----------|
| POST | `/api/auth/register` | public (creates a Customer) |
| POST | `/api/auth/login` | public |
| GET | `/api/auth/me` | any logged-in user |
| POST | `/api/auth/change-password` | any logged-in user |
| GET, POST | `/api/admin/staff` | `staff:read`, `staff:create` |
| GET, PATCH, DELETE | `/api/admin/staff/:id` | `staff:read`, `staff:update`, `staff:delete` (deactivates) |
| PUT, DELETE | `/api/admin/staff/:id/role` | `staff:assign-role` (DELETE reverts to Customer) |
| GET, POST | `/api/admin/roles` | `roles:read`, `roles:create` |
| GET, PATCH, DELETE | `/api/admin/roles/:id` | `roles:read`, `roles:update`, `roles:delete` |
| PUT, POST | `/api/admin/roles/:id/permissions` | `roles:manage-permissions` (replace / grant) |
| DELETE | `/api/admin/roles/:id/permissions/:key` | `roles:manage-permissions` |
| GET, POST | `/api/admin/permissions` | `permissions:read`, `permissions:create` |
| GET, PATCH, DELETE | `/api/admin/permissions/:id` | `permissions:read`, `permissions:update`, `permissions:delete` |

Role bodies take permission **keys**, for example `{ "permissions": ["leads:read", "leads:update"] }`.

## Phase 2 endpoints

### Public Storefront Catalog
| Method | Path | Access | Notes |
|--------|------|--------|-------|
| GET | `/api/categories` | public | Active categories with active product counts; supports `search`, `page`, `limit` |
| GET | `/api/categories/:idOrSlug` | public | Active category details by UUID or slug |
| GET | `/api/products` | public | Active products; supports `search`, `category`/`categoryId`, `minPrice`, `maxPrice`, `inStock`, `isFeatured`, `sortBy`, `sortOrder`, `page`, `limit` |
| GET | `/api/products/:idOrSlug` | public | Active product details by UUID or slug (includes `price`, `stock`, `inStock`, `stockStatus`) |

### Admin Catalog, Pricing & Stock Management
| Method | Path | Permission |
|--------|------|-----------|
| GET, POST | `/api/admin/categories` | `categories:*` / `products:create\|update`, `categories:create` |
| GET, PATCH, DELETE | `/api/admin/categories/:id` | `categories:*`, `categories:update`, `categories:delete` |
| GET, POST | `/api/admin/products` | `products:*` / `inventory:read`, `products:create` |
| GET, PATCH, DELETE | `/api/admin/products/:id` | `products:*` / `inventory:read`, `products:update`, `products:delete` |
| PATCH | `/api/admin/products/:id/price` | `products:update` |
| PATCH | `/api/admin/products/:id/stock` | `inventory:update` (`action`: `set` \| `increment` \| `decrement`) |

## Phase 3 endpoints

### Customer Addresses, Cart & Orders
| Method | Path | Permission | Notes |
|--------|------|-----------|-------|
| GET, POST | `/api/addresses` | `addresses:own` | List or create own delivery addresses |
| GET, PATCH, DELETE | `/api/addresses/:id` | `addresses:own` | Manage own delivery address (auto-manages `isDefault`) |
| GET, DELETE | `/api/cart` | `cart:own` | View cart with live totals or clear cart |
| POST | `/api/cart/items` | `cart:own` | Add product to cart (`productId`, `quantity`) |
| PATCH, DELETE | `/api/cart/items/:productId` | `cart:own` | Update item quantity (`0` removes) or remove item |
| POST | `/api/orders/checkout` | `orders:own` | Create order from cart + `addressId` + `paymentMethod` (`RAZORPAY` \| `COD`) |
| GET | `/api/orders` | `orders:own` | List own orders ("My Orders") |
| GET | `/api/orders/:id` | `orders:own` | View own order details |

### Admin Order Management
| Method | Path | Permission |
|--------|------|-----------|
| GET | `/api/admin/orders` | `orders:read-all` |
| GET | `/api/admin/orders/:id` | `orders:read-all` |
| PATCH | `/api/admin/orders/:id/status` | `orders:update-status` |

The two real-world problems (last item in stock, payment webhook idempotency) are implemented in Phase 4 and will be explained in this README then.
