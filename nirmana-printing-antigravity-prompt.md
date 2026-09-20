# Antigravity Build Prompt — Nirmana Printing Management System

Copy everything below into Antigravity as your project prompt.

---

## Project Overview

Build **Nirmana Printing Management System** — a full-stack stock and order
management system for a printing shop. The shop sells physical products
(paper, stickers, banners, etc.) and offers printing *services* (business
cards, flyers, posters, banners, brochures, T-shirt/mug printing, and more),
so orders combine job specifications, materials, production workflow, and
flexible customer payments (including scheduled/future payments).

Build this as an MVP delivered in 5 phases (defined below). Do not attempt
all modules at once — complete and verify each phase before starting the
next.

## Tech Stack (fixed — do not substitute)

- **Backend:** Node.js + Express (RESTful API), organized by feature/module
  (routes / controllers / services / models) — keep it simple, skip
  Clean-Architecture-style layering, this doesn't need that much ceremony
- **ORM:** Sequelize or Prisma (either is fine — pick one and be consistent)
  for models, migrations, and queries
- **Database:** MySQL for the running system; SQLite is acceptable for local
  development/prototyping if it speeds up setup, but the schema must stay
  MySQL-compatible — relational, with foreign keys, transactions, and proper
  indexing
- **Frontend:** HTML5, CSS3, JavaScript, Bootstrap, responsive design
  (desktop, laptop, tablet, mobile) — plain server-rendered views (EJS) or
  static HTML + `fetch()` calls to the API; no frontend build step, no SPA
  framework needed for this project's size
- **Dev tooling:** Git/GitHub, Postman collection for the API, `dotenv` for
  config, Docker for later deployment

## UI/UX Design Workflow — Use Google Stitch

Before writing frontend code for each phase, use **Google Stitch** to
generate the UI design first:

1. For each module in the current phase, write a short Stitch design brief
   (screen purpose, key data shown, primary actions, user role who uses it).
2. Generate the screen layouts in Stitch (Dashboard, list views, detail/edit
   forms, modals for key actions like "Record Payment" or "Add Stock").
3. Export/reference the resulting layout, spacing, and component structure
   from Stitch, and implement it faithfully in Bootstrap-based HTML/CSS/JS.
4. Keep a consistent design system across modules: same navigation shell,
   color palette, typography, button styles, table styles, and status-badge
   styles (e.g. color-coded order statuses, payment statuses).
5. Re-use the Stitch-generated shell (sidebar nav + topbar + dashboard cards)
   as the base layout for every subsequent module screen instead of
   redesigning it each time.

## Core Domain Concepts

- **Order lifecycle:** Quotation → Order Confirmed → Designing → Design
  Approved → Printing → Finishing → Quality Check → Ready → Delivered/
  Collected → Completed (plus Cancelled / On Hold at any point).
- **Quotation lifecycle:** Draft → Sent → Approved → Rejected → Expired.
  An approved quotation converts into an Order.
- **Payments are split into two concepts — model these as separate
  entities, not one:**
  - *Actual payments*: money already received (cash/bank transfer/card/
    cheque/other).
  - *Scheduled payments*: money the customer has committed to pay on a
    future date. Lifecycle: Scheduled → Due → Partially Paid → Paid, or
    Due → Overdue if the date passes unpaid.
  - Every order must be able to show: Total, Actually Paid, Scheduled,
    Outstanding.
- **Credit customers:** support a per-customer credit limit, current
  outstanding balance, available credit, and payment terms (e.g. Net 30).
- **Inventory transactions:** every stock change (purchase, order usage,
  return, damage, lost, manual adjustment, transfer) must be logged with
  date/time, item, quantity, type, user, reference, and reason — stock
  levels are a derived total of transactions, not a value edited directly.
- **Material usage:** production staff record materials consumed per order
  (e.g. "250 sheets A4, 35ml ink"); this should auto-deduct from inventory
  with the option for manual correction, and roll up into a material cost
  per order.
- **Audit log:** log who/what/when for logins, order creation/modification/
  cancellation, payment creation/reversal, stock adjustments, purchase
  creation, and user changes.

## Phase 1 — Foundation (build first)

- Auth & user management: admin-created users, login/logout, password
  reset, role-based access control (Owner/Admin, Manager, Sales Staff,
  Production Staff, Inventory Staff, Accountant), activation/deactivation,
  session management.
- Dashboard: today's/pending/in-production/ready/completed/cancelled
  orders, today's & monthly sales, payments received today, outstanding/
  due-today/upcoming/overdue payments, low-stock & out-of-stock alerts,
  recent orders and payments, quick actions (new order, add customer,
  record payment, add stock, create purchase).
- Customer management: full CRUD, individual/business/organization type,
  order & payment history, outstanding balance, credit limit tracking.
- Product/service catalog: CRUD for both physical products and printing
  services, with category, unit, default price, required materials,
  estimated production time.
- Orders: full order creation with printing specifications (paper/
  material, size, GSM, color mode, sides, pages, finishing options,
  quantity), order status workflow above, assignment to sales employee.

## Phase 2 — Inventory & Purchasing

- Stock items: CRUD with item code, category, unit, brand, supplier,
  purchase/selling price, current/min/reorder/max stock levels, location.
- Inventory transactions module (see Core Domain Concepts above) with
  full history and low/out-of-stock alerting.
- Material usage recording tied to orders, auto-deducting inventory.
- Supplier management: CRUD, purchase history, outstanding supplier
  payments.
- Purchases: Draft → Ordered → Partially Received → Received → Cancelled,
  linked to supplier invoices, increasing stock on receipt.

## Phase 3 — Payments & Receivables

- Customer payments: record actual payments against orders, multiple
  payment methods, receipt generation.
- Scheduled/future payments module exactly as described in Core Domain
  Concepts — this is a priority feature, not an afterthought.
- Accounts receivable: per-customer and total outstanding balances, due
  today/this week/this month, overdue receivables, payment history.
- Invoices & receipts: generate, print, and export to PDF, with sequential
  numbering for both.

## Phase 4 — Reports, Notifications, Expenses, Delivery

- Reports: sales (daily/weekly/monthly/yearly, by product/customer/
  employee), orders (pending/completed/cancelled/overdue, by status/
  product), inventory (current, low/out of stock, movement, consumption,
  valuation), payments (received/outstanding/scheduled/due/overdue),
  purchases (by supplier/date, costs, most purchased materials).
- Notifications/alerts: low stock, out of stock, payment due today,
  upcoming payment, overdue payment, order deadline approaching, overdue
  production job, pending quotation.
- Expense tracking: category, amount, date, description, payment method.
- Delivery/collection management: required/not, address, date, assigned
  delivery person, status (Not Ready → Ready → Out for Delivery →
  Delivered/Collected), delivery charge.

## Phase 5 — Advanced (later)

- File/artwork management: upload and version customer artwork (PDF, AI,
  PSD, CDR, PNG, JPG, TIFF), attach to orders, design approval status.
- Advanced analytics: revenue, expenses, gross/net profit, job
  profitability.
- Docker containerization, then Azure deployment.
- Automated scheduled backups + manual backup/restore.
- Multi-branch support.

## REST API Conventions

Design the API around these resources, following standard REST verbs
(`GET`/`POST`/`PUT`/`DELETE`) plus nested action endpoints:

```
/api/customers
/api/orders
/api/orders/{id}/payments
/api/orders/{id}/payment-schedules
/api/products
/api/inventory
/api/suppliers
/api/purchases
/api/payments
/api/payment-schedules
/api/invoices
/api/reports
/api/users
/api/customers/{id}/receivables
```

Provide a Postman collection covering every endpoint as each phase is
completed.

## Non-Functional Requirements

- Fast page loads and API responses; optimized, indexed queries; support
  multiple simultaneous users.
- Strong data integrity: transactional consistency, no data loss,
  graceful error handling, automatic backups.
- Clean, simple UI with minimal unnecessary data entry, clear status
  indicators (color-coded badges for order/payment status), and
  consideration for Sinhala/English bilingual support later.
- Secure by default: password hashing, role-based authorization, HTTPS in
  deployment, input validation, SQL-injection protection, session
  timeout, audit logging.
- Architecture must stay open to future growth: multiple branches, more
  users, an online customer portal, a mobile app, cloud deployment,
  WhatsApp/SMS notifications.

## Instructions to Antigravity

1. Scaffold the project as a single Node.js + Express app: `/src` folder
   with `routes`, `controllers`, `services`, and `models` subfolders, plus
   a `/views` (or `/public`) folder for the Bootstrap-based UI.
2. Set up the database connection and ORM (Sequelize or Prisma) with
   migrations before writing any business logic. Default to MySQL; SQLite
   is fine for local dev if the schema stays MySQL-compatible.
3. Work strictly phase by phase as defined above. At the end of each
   phase, summarize what was built, list any deviations from this spec,
   and confirm the phase is functional before moving to the next.
4. For every module's frontend, generate the design in Google Stitch
   first (per the UI/UX workflow above), then implement it — do not
   hand-code layouts without a Stitch design pass.
5. Keep the navigation structure as: Dashboard, Sales (Quotations,
   Orders, Invoices, Customers), Production, Inventory, Purchases,
   Payments, Deliveries, Expenses, Reports, Administration.
