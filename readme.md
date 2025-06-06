# 🧟‍♂️ CREEPER

**A dynamic 2×2 CCTV grid NFT** that updates every five minutes, hosted on Render and minted as an ERC-20 “coin” on Zora/Base.

---

## 1. Repository Layout

creeper/
├── .env # Local secrets (gitignored)
├── metadata.json # NFT metadata (points at /latest.png)
├── overlay.svg # “CREEPER” text as SVG, centered via text-anchor
├── app.js # Express server + scheduled image generator
├── generateGridSVG.js # One-off image generator (with gray-box fallback)
├── deployCoin.js # Zora Coins SDK script to deploy ERC-20
├── package.json
└── snapshots/
└── latest.png # Current grid image

markdown
Copy
Edit

---

## 2. Image Generation Pipeline

1. **Input**  
   - Four MJPEG/JPEG camera URLs configured by the single-line JSON in your `CAMERAS` env var.  
2. **Canvas Setup**  
   - 2048×2048px canvas, black background + 20px gutters.  
3. **Fetch & Draw**  
   - `app.js` fetches each feed.  
   - **Important**: if a fetch fails, the code currently logs an error **but does _not_** draw a gray box—so the quadrant stays black.  
   - `generateGridSVG.js` (standalone) _does_ draw a gray box fallback.  
4. **Post-processing**  
   - Grayscale conversion  
   - Light green tint overlay  
5. **Text Overlay**  
   - In `app.js` we now load and draw `overlay.svg` (which uses `<text text-anchor="middle" dominant-baseline="middle">`) so “CREEPER” is guaranteed pixel-perfectly centered.  
   - In `generateGridSVG.js` it writes its own SVG then draws it.  
6. **Output**  
   - Saves `snapshots/latest.png`.

---

## 3. Local Development

- **Preview only** (no server, always shows gray-box fallback):
node generateGridSVG.js
open snapshots/latest.png

markdown
Copy
Edit
- **Run full Express** (serves live endpoint):
1. Kill any old Node (`killall node`) so ports are free.  
2. Start on an unused port:
   ```
   PORT=3001 node app.js
   ```
3. Browse to `http://localhost:3001/latest.png`.

> **Black image locally?**  
> Means _all_ camera fetches failed and `app.js` didn’t draw gray boxes. Use the standalone generator or add this fallback in `app.js` inside the `catch` for each camera:
> ```js
> ctx.fillStyle = '#444'
> ctx.fillRect(dx, dy, inner, inner)
> ```

---

## 4. Deploying on Render

1. **Environment variables** (in the dashboard, one-line values):
CAMERAS=[{…},…]
PORT=3000
RPC_URL=https://base-mainnet.g.alchemy.com/v2/…
PRIVATE_KEY=0x…
SALE_RECIPIENT=0x…

yaml
Copy
Edit
2. Push your commits.  
3. Click **Manual Deploy** on your web service.  
4. Verify:
- `https://<your-app>.onrender.com/latest.png`  
- `https://<your-app>.onrender.com/metadata.json`

---

## 5. Minting the Zora Coin

1. Confirm `metadata.json`:
```json
{
  "name": "CREEPER",
  "description": "Live 2×2 CCTV grid that updates every five minutes",
  "image": "https://<your-app>.onrender.com/latest.png",
  "properties": { "updateInterval":"5m", "layout":"2×2" }
}
Run:

nginx
Copy
Edit
node deployCoin.js
Signs with PRIVATE_KEY, broadcasts via RPC_URL.

Prints new ERC-20 token address.

On BaseScan or Zora, view your coin—contractURI() will point at your dynamic metadata.