# Tentata Vendita – Local dev setup

> **Prerequisites:** Node 18+, npm 9+, Git

```bash
git clone https://github.com/<your-org>/tentatavendita.git
cd tentatavendita
npm install
npm run dev      # ➜ http://localhost:5173
```

The project uses **Vite + React 18** with Tailwind CSS.

## Project structure

```
.
├─ index.html
├─ package.json
├─ vite.config.js
├─ tailwind.config.js
├─ postcss.config.js
└─ src
   ├─ index.css
   ├─ main.jsx         # Vite entry
   └─ TentataVenditaApp.jsx (full app)
```

## Build & preview

```
npm run build
npm run preview   # local static preview @4173
```

---

Next steps: connect the JSON‑RPC sync layer to Konga ERP and generate shadcn/ui components.
