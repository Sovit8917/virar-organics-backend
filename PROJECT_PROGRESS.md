# Virar Organics Backend - Project Progress

Stack: Node.js, Express.js, PostgreSQL, Prisma ORM, JWT, bcrypt, Razorpay (Test Mode), REST.

## Status

| Phase | Scope | Status |
|-------|-------|--------|
| 1 | Setup, database, authentication, dynamic RBAC, admin APIs, seed | COMPLETE (code written, not yet run) |
| 2 | Products, categories, search, filtering, pagination and stock management | COMPLETE (code written, not yet run) |
| 3 | Cart, delivery addresses, checkout and order management | Pending |
| 4 | Razorpay, COD, payment webhooks, concurrency-safe inventory and stock restoration | Pending |
| 5 | Bulk enquiries, automatic lead creation, CRM, notes and follow-ups | Pending |
| 6 | Dashboard, integration, sample data and documentation | Pending |

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

## Pending work

- Database migration & seed: run `npm run prisma:migrate` and `npm run db:seed` on your machine when ready.
- Phase 3: Cart, delivery addresses, checkout and order management.
- Phase 4: Razorpay, COD, payment webhooks, concurrency-safe inventory and stock restoration.
- Phase 5: Bulk enquiries, automatic lead creation, CRM, notes and follow-ups.
- Phase 6: Dashboard analytics, integration, sample data, full API docs and Postman collection.

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
  tests/
    phase2.catalog.test.js
  src/
    server.js
    app.js
    config/        env.js, prisma.js
    controllers/   auth, staff, role, permission, category, product
    middleware/    authenticate, authorize, validate, notFound, errorHandler
    routes/        index, auth.routes, admin.routes, category.routes, product.routes
    services/      auth, staff, role, permission, category, product
    utils/         ApiError, asyncHandler, response, pagination, jwt, password, permissions, slug
    validators/    common, auth, staff, role, permission, category, product
```
