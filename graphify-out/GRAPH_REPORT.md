# Graph Report - aarontxu-3d  (2026-10-12)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 41 nodes · 70 edges · 10 communities (8 shown, 2 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 2 edges (avg confidence: 0.8)
- Token cost: 66,926 input · 142 output

## Graph Freshness
- Built from commit: `7a0f6eaa`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Pages CMS Config
- Cart Page Logic
- Jekyll Site Config
- NFC Keychain Guide
- Product Cart Storage
- WhatsApp Order Flow
- Site Content Pages
- Default Layout & Header
- Products Page & Gallery

## God Nodes (most connected - your core abstractions)
1. `Default layout (_layouts/default.html)` - 9 edges
2. `Pages CMS config (.pages.yml)` - 7 edges
3. `_data/aarontxu_3d.json (site content data)` - 7 edges
4. `initializeCartPage()` - 6 edges
5. `NFC keychain guide page` - 6 edges
6. `Cart page (cart.html)` - 6 edges
7. `Home page (index.html)` - 6 edges
8. `Products and services page` - 6 edges
9. `changeCartQuantity()` - 5 edges
10. `readCart()` - 5 edges

## Surprising Connections (you probably didn't know these)
- `Default layout (_layouts/default.html)` --references--> `languages section`  [EXTRACTED]
  _layouts/default.html → .pages.yml
- `Header cart link and count badge` --references--> `Cart page (cart.html)`  [EXTRACTED]
  _layouts/default.html → cart.html
- `NFC keychain guide page` --references--> `_data/aarontxu_3d.json (site content data)`  [EXTRACTED]
  guias/llaveros-nfc/index.html → .pages.yml
- `NFC keychain guide page` --references--> `Home page (index.html)`  [EXTRACTED]
  guias/llaveros-nfc/index.html → index.html
- `NFC keychain guide page` --references--> `Default layout (_layouts/default.html)`  [EXTRACTED]
  guias/llaveros-nfc/index.html → _layouts/default.html

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Pages driven by aarontxu_3d.json content edited through Pages CMS** — pages_yml, data_aarontxu_3d_json, index_html, products_and_services_html, privacy_html, guias_llaveros_nfc_index [EXTRACTED 0.90]
- **Pages rendered with the default Jekyll layout** — index_html, cart_html, privacy_html, products_and_services_html, guias_llaveros_nfc_index, layouts_default_html [EXTRACTED 0.95]

## Communities (10 total, 2 thin omitted)

### Community 1 - "Pages CMS Config"
Cohesion: 0.50
Nodes (5): Pages CMS config (.pages.yml), languages section, privacy section, productsAndServices section, site_images media collection

### Community 2 - "Cart Page Logic"
Cohesion: 0.70
Nodes (5): changeCartQuantity(), formatCurrency(), initializeCartPage(), readCart(), removeCartItem()

### Community 3 - "Jekyll Site Config"
Cohesion: 0.50
Nodes (4): _config.yml (Jekyll config), jekyll-sitemap plugin, README Aarontxu 3D, GitHub Pages hosting (3d.aarontxu.com)

### Community 4 - "NFC Keychain Guide"
Cohesion: 0.67
Nodes (4): NFC keychain guide page, NFC step-by-step guide stepper, WhatsApp link generator helper, nfcGuide section

### Community 5 - "Product Cart Storage"
Cohesion: 0.50
Nodes (4): initializeProductCart(), normalizeQuantity(), saveCart(), updateCartBadge()

### Community 6 - "WhatsApp Order Flow"
Cohesion: 0.67
Nodes (3): Cart page (cart.html), WhatsApp order flow (cart, no auto-confirm), profile section (Portada)

### Community 7 - "Site Content Pages"
Cohesion: 1.00
Nodes (3): _data/aarontxu_3d.json (site content data), Home page (index.html), Privacy page (privacy.html)

### Community 8 - "Default Layout & Header"
Cohesion: 0.67
Nodes (3): Default layout (_layouts/default.html), Header cart link and count badge, Google Translate language widget

## Knowledge Gaps
- **5 isolated node(s):** `jekyll-sitemap plugin`, `README Aarontxu 3D`, `WhatsApp order flow (cart, no auto-confirm)`, `Google Translate language widget`, `Product filters, gallery and image modal`
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 12 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Default layout (_layouts/default.html)` connect `Default Layout & Header` to `Pages CMS Config`, `NFC Keychain Guide`, `WhatsApp Order Flow`, `Site Content Pages`, `Products Page & Gallery`?**
  _High betweenness centrality (0.064) - this node is a cross-community bridge._
- **What connects `jekyll-sitemap plugin`, `README Aarontxu 3D`, `WhatsApp order flow (cart, no auto-confirm)` to the rest of the system?**
  _5 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Why does `NFC keychain guide page` connect `NFC Keychain Guide` to `Default Layout & Header`, `Site Content Pages`?**
  _High betweenness centrality (0.053) - this node is a cross-community bridge._
- **Why does `Pages CMS config (.pages.yml)` connect `Pages CMS Config` to `NFC Keychain Guide`, `WhatsApp Order Flow`, `Site Content Pages`?**
  _High betweenness centrality (0.041) - this node is a cross-community bridge._