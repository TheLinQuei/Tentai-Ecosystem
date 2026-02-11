# Vi Console App

Frontend console for Vi transparency features.

## Local development

- Install dependencies
- Run the dev server

The app expects Vi API at http://localhost:3100 by default.

## Production build

This app is designed to be hosted under /console on tentaitech.com.

- Base path defaults to /console/
- Override by setting VITE_BASE before build

Example:

VITE_BASE=/console/
VITE_API_BASE=https://tentaitech.com

Build output:

npm run build

Deploy the dist/ folder to the /console path on your website.
