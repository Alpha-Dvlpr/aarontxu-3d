# Graph Report - aarontxu-3d  (2026-10-12)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 47 nodes · 60 edges · 9 communities (8 shown, 1 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 2 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `e9265b0e`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- aarontxu_3d content file definition
- default layout
- initializeCartPage
- _config.yml (Jekyll config)
- Cart page
- saveCart
- Home page (index.html)
- Products and services page

## God Nodes (most connected - your core abstractions)
1. `default layout` - 8 edges
2. `initializeCartPage()` - 6 edges
3. `aarontxu_3d content file definition` - 6 edges
4. `changeCartQuantity()` - 5 edges
5. `readCart()` - 5 edges
6. `removeCartItem()` - 5 edges
7. `saveCart()` - 5 edges
8. `initializeProductCart()` - 4 edges
9. `Cart page` - 4 edges
10. `Products and services page` - 4 edges

## Surprising Connections (you probably didn't know these)
- `default layout` --references--> `Privacy policy page`  [EXTRACTED]
  _layouts/default.html → pages/privacy.html
- `Home page (index.html)` --references--> `default layout`  [EXTRACTED]
  index.html → _layouts/default.html
- `Cart page` --references--> `default layout`  [EXTRACTED]
  pages/cart.html → _layouts/default.html
- `NFC keychain guide page` --references--> `default layout`  [EXTRACTED]
  pages/guides/nfc.html → _layouts/default.html
- `Products and services page` --references--> `default layout`  [EXTRACTED]
  pages/products.html → _layouts/default.html

## Import Cycles
- None detected.

## Communities (9 total, 1 thin omitted)

### Community 0 - "aarontxu_3d content file definition"
Cohesion: 0.25
Nodes (9): Pages CMS config (.pages.yml), aarontxu_3d content file definition, languages schema, nfcGuide schema, privacy schema, productsAndServices schema, profile (Portada) schema, site_images media collection (+1 more)

### Community 2 - "default layout"
Cohesion: 0.33
Nodes (6): default layout, Tailwind palette via CSS variables, Theme switcher (auto/light/dark), NFC keychain guide page, NFC platform step-by-step stepper, Privacy policy page

### Community 3 - "initializeCartPage"
Cohesion: 0.70
Nodes (5): changeCartQuantity(), formatCurrency(), initializeCartPage(), readCart(), removeCartItem()

### Community 4 - "_config.yml (Jekyll config)"
Cohesion: 0.50
Nodes (4): _config.yml (Jekyll config), jekyll-sitemap plugin, README Aarontxu 3D, GitHub Pages hosting (3d.aarontxu.com)

### Community 5 - "Cart page"
Cohesion: 0.50
Nodes (4): Header with cart link, theme and translate buttons, Google Translate widget container, Cart page, WhatsApp order flow (no automatic send)

### Community 6 - "saveCart"
Cohesion: 0.50
Nodes (4): initializeProductCart(), normalizeQuantity(), saveCart(), updateCartBadge()

### Community 7 - "Home page (index.html)"
Cohesion: 0.67
Nodes (3): Home page (index.html), External contact and social links section, Intro section with profile image, description and internal chips nav

### Community 8 - "Products and services page"
Cohesion: 0.67
Nodes (3): Products and services page, Product category filters, Image zoom modal

## Knowledge Gaps
- **16 isolated node(s):** `nfcGuide whatsapp helper schema`, `languages schema`, `privacy schema`, `profile (Portada) schema`, `jekyll-sitemap plugin` (+11 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 24 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `default layout` connect `default layout` to `Products and services page`, `Cart page`, `Home page (index.html)`?**
  _High betweenness centrality (0.080) - this node is a cross-community bridge._
- **What connects `nfcGuide whatsapp helper schema`, `languages schema`, `privacy schema` to the rest of the system?**
  _16 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Why does `Home page (index.html)` connect `Home page (index.html)` to `default layout`?**
  _High betweenness centrality (0.026) - this node is a cross-community bridge._
- **Why does `Products and services page` connect `Products and services page` to `default layout`, `Cart page`?**
  _High betweenness centrality (0.026) - this node is a cross-community bridge._