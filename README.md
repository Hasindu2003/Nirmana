# Nirmana Printing Management System 🖨️

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org/)
[![Express.js](https://img.shields.io/badge/Express-4.19-blue.svg)](https://expressjs.com/)
[![Sequelize](https://img.shields.io/badge/Sequelize-6.37-blueviolet.svg)](https://sequelize.org/)
[![Database](https://img.shields.io/badge/Database-SQLite%20%7C%20MySQL-orange.svg)]()
[![Bootstrap](https://img.shields.io/badge/Bootstrap-5.3-purple.svg)](https://getbootstrap.com/)
[![License](https://img.shields.io/badge/License-Proprietary-red.svg)]()

A comprehensive, production-grade management and counter operations system purpose-built for printing presses, copy centers, and commercial print shops. Designed to streamline walk-in customer file intake, order tracking, paper inventory, invoicing, and counter operations.

---

## 🌟 Key Highlights

- **🚀 Walk-in Self-Service QR Print Intake**: Replaces chaotic WhatsApp file sharing. Customers simply scan a counter QR code on their phone, upload photos/documents, choose paper size (A4, A3, Legal, etc.), and send directly to the shop counter.
- **🖥️ Ultra-Compact Desk Queue (`/quick-print`)**: High-density operator view with real-time arrival audio chimes, one-click document preview pop-up, and direct printing.
- **📦 Smart Paper & Material Inventory**: Live stock balance tracking, stock arrivals (Stock In) with auto profit-margin calculation, material usage deductions, and low-stock alerts.
- **📋 Full Order Lifecycle Management**: End-to-end management from quote to delivery with automated job ticketing, custom finishing specs, and formal order conversion.
- **👥 Customer CRM**: Automatic walk-in customer profiling by phone number, transaction history, order records, and direct WhatsApp messaging links.
- **📊 Real-time Dashboard**: Revenue figures, active jobs count, stock valuation, and quick operational metrics.

---

## 📑 Feature Modules

### 1. Walk-in Express Print Counter (`/quick-print` & `/upload`)
- **Customer Mobile Upload Portal**:
  - Accessible via mobile browser on any smartphone.
  - Written in natural conversational Singlish for maximum customer ease.
  - **Customizable Specs**: Paper size (`A4`, `A3`, `Legal`, `A5`, or `Other` custom dimensions), color mode (`Color` or `B&W`), and copy count.
  - **Live Order Tracker**: 2-stage status tracker showing when the file is received and when prints are ready for pickup.
- **Shopkeeper Counter Queue**:
  - Ultra-sleek, compact horizontal order tiles (~50px height) designed for busy desks.
  - **Document Preview Pop-up**: High-resolution image view and embedded PDF reader with one-click **`[Start Print]`** button.
  - Two streamlined operational statuses: **Pending** and **Completed**.
  - 1-click **Convert to Formal Order** for full invoicing and payment scheduling.
- **Dynamic Tabletop Stand & Flyer**:
  - Host-agnostic QR code generation that automatically detects Wi-Fi LAN IP (e.g. `192.168.x.x:3000`) or custom cloud domains.
  - High-res QR download (PNG) and 1-click printable A4 counter display sign.

### 2. Order Management (`/orders`)
- Structured workflow: `Draft` ➔ `Confirmed` ➔ `Printing` ➔ `Finishing` ➔ `Ready` ➔ `Delivered`.
- Itemized pricing, paper stock allocation, and cost calculation.
- Printable production job sheets and customer delivery slips.

### 3. Inventory & Raw Materials (`/stock`)
- Categorized stock items (A4 80gsm reams, A3 art board, glossy photo sheets, flex banners, ink cartridges).
- Automatic cost-per-unit, batch cost, and profit margin estimation on stock arrival.
- Audit trail for all material adjustments and order-related deductions.

### 4. Financials & Billing
- Automated invoice and receipt generation with Sri Lankan Rupee (`Rs.`) formatting.
- Tracking advance payments, partial settlements, and outstanding balances.

---

## 🛠️ Technology Stack

| Layer | Technology |
|---|---|
| **Runtime & Backend** | [Node.js](https://nodejs.org/) & [Express.js](https://expressjs.com/) |
| **Database & ORM** | [Sequelize ORM](https://sequelize.org/) with **SQLite** (dev) / **MySQL** (prod) |
| **Templating Engine** | [EJS](https://ejs.co/) (Embedded JavaScript) |
| **UI Design System** | Serene Workshop Studio (Tailored modern UI with Bootstrap 5.3 & Icons) |
| **File Handling** | [Multer](https://github.com/expressjs/multer) disk storage with MIME validation |
| **QR Engine** | [node-qrcode](https://github.com/soldair/node-qrcode) |
| **Audio Alerting** | Web Audio API Synthesizer (Chimes on new customer uploads) |

---

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v18.0.0 or later recommended)
- [npm](https://www.npmjs.com/) (bundled with Node.js)
- [Git](https://git-scm.com/)

### Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/RisinuSenarath/Nirmana.git
   cd Nirmana
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure Environment Variables**:
   Copy the example environment file:
   ```bash
   cp .env.example .env
   ```
   *Default `.env` configuration uses SQLite (`./data/nirmana.sqlite`), requiring zero database setup.*

4. **Seed Database (Optional)**:
   Populate initial admin account, default product categories, and stock items:
   ```bash
   npm run seed
   ```

5. **Start the Application**:
   ```bash
   # Development mode with auto-reload (nodemon)
   npm run dev

   # Standard production mode
   npm start
   ```

6. **Access the Application**:
   - **Main System**: [http://localhost:3000](http://localhost:3000)
   - **Quick Print Queue**: [http://localhost:3000/quick-print](http://localhost:3000/quick-print)
   - **Customer Upload Page**: [http://localhost:3000/upload](http://localhost:3000/upload)
   - **Local Wi-Fi Network Access**: Available at `http://<YOUR_LAN_IP>:3000/upload` (displayed in the terminal and Counter QR Modal).

---

## 📂 Project Structure

```
Nirmana/
├── data/                    # SQLite database storage (git-ignored)
├── public/                  # Static assets
│   ├── css/                 # Serene theme CSS stylesheets
│   ├── images/              # Logos and graphics
│   ├── js/                  # Client-side JavaScript
│   └── uploads/             # Customer walk-in upload storage (git-ignored)
│       └── quick-print/     # Quick print temporary files
├── src/
│   ├── config/              # App and database configuration
│   ├── controllers/         # Express route controllers
│   ├── middleware/          # Auth, RBAC, Multer upload, and error handlers
│   ├── models/              # Sequelize database models & associations
│   ├── routes/              # Web page views and REST API routes
│   ├── seeders/             # Database fixtures and initial data seeds
│   ├── services/            # Core business logic services
│   ├── utils/               # Network IP detection and pagination utilities
│   └── views/               # EJS user interface templates
│       ├── auth/            # Login & authentication views
│       ├── customers/       # CRM directory and profile pages
│       ├── dashboard/       # Main operations dashboard
│       ├── orders/          # Order intake, creation, and detail views
│       ├── partials/        # Header, sidebar, footer, and navigation components
│       ├── products/        # Product and service catalog
│       ├── quickPrint/      # Walk-in queue and customer mobile upload views
│       ├── stock/           # Inventory and stock transaction views
│       └── users/           # Staff accounts and access management
├── test/                    # Integration and automated test suites
├── .env.example             # Template for environment configuration
├── .gitignore               # Excludes secrets, databases, and uploaded media
├── package.json             # Dependencies and npm scripts
├── server.js                # Server entry point & Express bootstrap
└── README.md                # Project documentation
```

---

## 🧪 Testing

Run the automated integration and endpoint test suite:
```bash
npm test
```
To run the automated quick print and counter intake tests:
```bash
node test/streamlined_test.js
```

---

## 🔐 Security & Privacy

- Sensitive environment variables and secrets are kept in `.env` (excluded from version control).
- Customer files stored in `public/uploads/quick-print/` are ignored by git to protect client document privacy.
- Strict validation is enforced on telephone numbers (10 digits) and file MIME types.

---

## 📄 License

This project is proprietary and maintained for **Nirmana Printing Management**. All rights reserved.
