# Nirmana Customer Express Upload Portal

A dedicated, ultra-lightweight, standalone customer-facing web application for walk-in mobile file uploads.

## Key Features
- **Zero Admin Exposure**: Contains 100% customer-facing upload UI only. No staff dashboards, no order history, no database credentials.
- **Root URL `/`**: Directly serves the upload screen without any `/upload` subpath.
- **Fast & Resilient**: Supports multi-file uploads, image preview thumbnails, copy/color/paper specs, Sinhala/English language toggling, and direct Google Drive resumable chunk uploads.
- **Cross-Origin Ready**: Seamlessly sends uploads and token tracking requests to the backend shop management server (`https://nirmana-iota.vercel.app`).

## Deployment on Vercel (1-Click Setup)

1. Open your **Vercel Dashboard** (https://vercel.com).
2. Click **"Add New..."** > **"Project"**.
3. Import your existing **Nirmana** GitHub repository.
4. In the Project Configuration:
   - **Project Name**: `nirmana-upload` (or your preferred name)
   - **Framework Preset**: `Other`
   - **Root Directory**: Click **Edit** and choose `customer-portal`
5. Click **Deploy**.

Your customer upload station will be live at:
`https://nirmana-upload.vercel.app` (or your custom domain like `upload.nirmana.lk`).

## Connecting to Backend QR Stand
In your main backend project settings on Vercel (`nirmana-iota`):
Add the Environment Variable:
```env
CUSTOMER_PORTAL_URL=https://nirmana-upload.vercel.app
```
Your counter QR codes and printable tabletop stand will automatically encode this dedicated address!
