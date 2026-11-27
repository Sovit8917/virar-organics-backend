# Virar Organics Backend - Project Progress

Stack: Node.js, Express.js, PostgreSQL, Prisma ORM, JWT, bcrypt, Razorpay (Test Mode), REST.

## Status

| Phase | Scope | Status |
|-------|-------|--------|
| 1 | Setup, database, authentication, dynamic RBAC, admin APIs, seed | COMPLETE (code written, not yet run) |
| 2 | Products, categories, search, filtering, pagination and stock management | COMPLETE (code written, not yet run) |
| 3 | Cart, delivery addresses, checkout and order management | COMPLETE (code written, not yet run) |
| 4 | Razorpay, COD, payment webhooks, concurrency-safe inventory and stock restoration | COMPLETE (code written, not yet run) |
| 5 | Bulk enquiries, automatic lead creation, CRM, notes and follow-ups | COMPLETE (code written, not yet run) |
| 6 | Dashboard, integration, sample data and documentation | COMPLETE (code written, not yet run) |

## Phase 1 - completed work

- Express app with modular layout: routes, controllers, services, middleware, validators.
- Env validation with zod (`src/config/env.js`); helmet, CORS, rate limiting on auth routes.
- Prisma schema: `User`, `Role`, `Permission`, `RolePermission` with indexes and relations.
- Auth: register (always Customer), login, `/me`, change password; bcrypt hashing; JWT with `tokenVersion`.
- Dynamic RBAC: role and permissions are read from the database on every request, so changes apply immediately.
- Admin APIs: staff (CRUD, assign and revoke role), roles (CRUD, set/grant/revoke permissions), permissions (CRUD).
- Safeguards: Admin role locked, last active Admin protected, system roles cannot be deleted or renamed.
- Seed: full permission catalog (including keys used by later phases), 3 system roles, Admin, Sales Executive and Customer accounts.

## Phase 2 - completed work

- Prisma schema: `Category` and `Product` models with indexes, `Decimal(10, 2)` pricing, `sku`, `slug`, `stock`, `lowStockThreshold`, and `onDelete: Restrict` relation.
- Public catalog APIs (`/api/categories`, `/api/products`): active-only listing and details by UUID or slug, computed `inStock` and `stockStatus` (`IN_STOCK`, `LOW_STOCK`, `OUT_OF_STOCK`).
- Search, filtering, pagination & sorting: case-insensitive search (`name`, `shortDescription`, `description`, `sku`), category filter (UUID or slug), `minPrice`/`maxPrice`, `inStock`, `isFeatured`, `lowStock` (admin), `sortBy`, `sortOrder`, and standard pagination `meta`.
- Admin catalog & stock APIs (`/api/admin/categories`, `/api/admin/products`): full CRUD, dedicated price update (`PATCH /api/admin/products/:id/price`), and atomic stock adjustment (`PATCH /api/admin/products/:id/stock` with `set`, `increment`, `decrement` preventing negative stock).
- RBAC enforcement: admin catalog endpoints require `categories:*`, `products:*`, or `inventory:*` permissions (`Admin` allowed; `Sales Executive` and `Customer` denied).
- Unit/validation tests added in `tests/phase2.catalog.test.js` (not executed per Phase 2 rules).

## Phase 3 - completed work

- Prisma schema: `Address`, `Cart`, `CartItem`, `Order`, `OrderItem`, and enums `OrderStatus`, `PaymentMethod`, `PaymentStatus`.
- Delivery addresses (`/api/addresses`): customer-owned CRUD with automatic default address management.
- Shopping cart (`/api/cart`): persistent per-user cart with add/update/remove/clear, stock availability checks, and computed line totals and subtotal.
- Checkout & customer orders (`/api/orders`): transactional checkout from cart + owned delivery address, snapshotted `OrderItem` prices and shipping address, unique `orderNumber`, cart clearing, and "My Orders" listing/details.
- Admin order management (`/api/admin/orders`): paginated listing with search/filters, order details, and validated status transitions (`PENDING` -> `PAID`/`SHIPPED`/`CANCELLED`, `PAID` -> `SHIPPED`/`CANCELLED`, `SHIPPED` -> `DELIVERED`/`CANCELLED`).
- Unit/validation tests added in `tests/phase3.orders.test.js` (not executed).

## Phase 4 - completed work

- Prisma schema: added `razorpayOrderId`, `razorpayPaymentId`, `paidAt`, `cancelledAt`, `stockRestored` on `Order`, and `PaymentEvent` (`payment_events`) table with unique `eventId`.
- Concurrency-safe inventory: `checkout` locks items in deterministic `productId` order and uses atomic `updateMany({ where: { id, isActive: true, stock: { gte: qty } }, data: { stock: { decrement: qty } } })` inside `prisma.$transaction`, preventing overselling when two customers buy the last unit simultaneously.
- Atomic stock restoration: cancelling an order (`POST /api/orders/:id/cancel` for customer `PENDING` orders, or `PATCH /api/admin/orders/:id/status` with `CANCELLED` for admin) uses an atomic `stockRestored: false` guard so stock is restored at most once.
- Razorpay Test Mode & COD: `checkout` creates a Razorpay order via REST API (`RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET`), compensating by restoring stock if the gateway call fails.
- Payment verification & idempotent webhook: `POST /api/payments/razorpay/verify` and raw-body `POST /api/webhooks/razorpay` (mounted before `express.json()`) verify HMAC-SHA256 signatures, deduplicate deliveries via `PaymentEvent.eventId`, and use an atomic `status: 'PENDING', paymentStatus: { not: 'PAID' }` guard so an order is never marked paid twice.
- Unit/validation tests added in `tests/phase4.payments.test.js` (not executed).

## Phase 5 - completed work

- Prisma schema: `LeadStatus` enum, `BulkEnquiry`, `Lead`, and `LeadNote` models with relations to `Product` and `User`.
- Public Bulk Order Enquiry (`POST /api/enquiries/bulk`): validates enquiry fields, resolves optional `productId`, creates `BulkEnquiry`, and automatically creates a `Lead` in `NEW` status inside a transaction.
- Mini CRM (`/api/admin/leads`): paginated lead listing with filters/search, "Today's follow-ups" (`GET /api/admin/leads/follow-ups/today`), lead details with notes, status transitions (`NEW` -> `CONTACTED` -> `CONVERTED` / `LOST`), follow-up date scheduling, staff assignment, and CRM notes (`POST /api/admin/leads/:id/notes`).
- RBAC enforcement: `Sales Executive` (`leads:read`, `leads:update`, `leads:followups`) can view/update leads, notes, and follow-ups, but is blocked (`403`) from `leads:delete`, products, categories, and orders.
- Unit/validation tests added in `tests/phase5.crm.test.js` (not executed).

## Phase 6 - completed work

- Admin Dashboard (`GET /api/admin/dashboard`, `dashboard:read`): returns `totalOrdersToday`, `revenueThisMonth`, `newLeadsCount`, `todaysFollowUpsCount`, and `lowStockProductsCount`.
- Sample data (`prisma/seed.js`): idempotent seeding for 5 organic categories, 10 products, 1 customer delivery address, 3 sample orders, and 5 bulk enquiries/CRM leads with notes and today's follow-ups.
- Integration & documentation: added `tests/phase6.dashboard.test.js`, `"test"` script in `package.json`, `postman/Virar_Organics_API.postman_collection.json`, and finalized `README.md`.

## Next steps on your machine

- Run `npm run prisma:migrate` to apply the full schema to PostgreSQL.
- Run `npm run db:seed` to populate roles, permissions, accounts, 10 products, 3 orders, and 5 leads.
- Run `npm test` to execute unit/validation tests and `npm run dev` to start the server.

## File structure

```
virar-organics-backend/
  package.json
  .env.example
  .gitignore
  README.md
  PROJECT_PROGRESS.md
  prisma/
    schema.prisma
    seed.js
  postman/
    Virar_Organics_API.postman_collection.json
  tests/
    phase2.catalog.test.js
    phase3.orders.test.js
    phase4.payments.test.js
    phase5.crm.test.js
    phase6.dashboard.test.js
  src/
    server.js
    app.js
    config/        env.js, prisma.js
    controllers/   auth, staff, role, permission, category, product, address, cart, order, payment, enquiry, lead, dashboard
    middleware/    authenticate, authorize, validate, notFound, errorHandler
    routes/        index, auth.routes, admin.routes, category.routes, product.routes, address.routes, cart.routes, order.routes, payment.routes, enquiry.routes
    services/      auth, staff, role, permission, category, product, address, cart, order, payment, enquiry, lead, dashboard
    utils/         ApiError, asyncHandler, response, pagination, jwt, password, permissions, slug, razorpay
    validators/    common, auth, staff, role, permission, category, product, address, cart, order, payment, enquiry, lead
```
