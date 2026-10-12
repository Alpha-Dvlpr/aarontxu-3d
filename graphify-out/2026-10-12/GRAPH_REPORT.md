# Graph Report - aarontxu-3d  (2026-10-12)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 66 nodes · 84 edges · 11 communities (10 shown, 1 thin omitted)
- Extraction: 94% EXTRACTED · 6% INFERRED · 0% AMBIGUOUS · INFERRED: 5 edges (avg confidence: 0.83)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `e9265b0e`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- cart-page section
- aarontxu_3d content file definition
- Default Jekyll Layout
- NFC keychain guide page
- initializeCartPage
- _config.yml (Jekyll config)
- Sticky header (back link, title, cart, theme, translate)
- Root CSS color variables (light/dark)
- saveCart
- Home page (index.html)

## God Nodes (most connected - your core abstractions)
1. `Default Jekyll Layout` - 10 edges
2. `initializeCartPage()` - 6 edges
3. `cart-page section` - 6 edges
4. `aarontxu_3d content file definition` - 6 edges
5. `changeCartQuantity()` - 5 edges
6. `readCart()` - 5 edges
7. `removeCartItem()` - 5 edges
8. `saveCart()` - 5 edges
9. `Sticky header (back link, title, cart, theme, translate)` - 5 edges
10. `initializeProductCart()` - 4 edges

## Surprising Connections (you probably didn't know these)
- `Home page (index.html)` --references--> `Default Jekyll Layout`  [EXTRACTED]
  index.html → _layouts/default.html
- `NFC keychain guide page` --references--> `nfcGuide schema`  [EXTRACTED]
  guias/llaveros-nfc/index.html → .pages.yml
- `_config.yml (Jekyll config)` --conceptually_related_to--> `GitHub Pages hosting (3d.aarontxu.com)`  [INFERRED]
  _config.yml → README.md
- `Privacy page (privacy.html)` --references--> `privacy schema`  [EXTRACTED]
  privacy.html → .pages.yml
- `Products and services page` --references--> `productsAndServices schema`  [EXTRACTED]
  products_and_services.html → .pages.yml

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Header controls** — _layouts_default_cart_link, _layouts_default_theme_btn, _layouts_default_translate_widget, _layouts_default_heading_source [EXTRACTED 0.90]
- **Cart to WhatsApp order flow** — cart_cart_items, cart_cart_total, cart_cart_order_link, cart_whatsapp_contact, cart_order_notice [INFERRED 0.80]
- **Theme switching flow** — _layouts_default_theme_bootstrap, _layouts_default_css_variables, _layouts_default_tailwind_config, _layouts_default_theme_btn [INFERRED 0.80]

## Communities (11 total, 1 thin omitted)

### Community 0 - "cart-page section"
Cohesion: 0.23
Nodes (12): Cart page (cart.html), cart-empty state, cart-items list, cart-order-link (Pedir por WhatsApp), cart-page section, cart-quote-note, cart-summary section, cart-total (+4 more)

### Community 1 - "aarontxu_3d content file definition"
Cohesion: 0.22
Nodes (10): Pages CMS config (.pages.yml), aarontxu_3d content file definition, languages schema, privacy schema, productsAndServices schema, profile (Portada) schema, site_images media collection, Privacy page (privacy.html) (+2 more)

### Community 3 - "Default Jekyll Layout"
Cohesion: 0.33
Nodes (6): Default Jekyll Layout, Footer with privacy link, Person JSON-LD schema, Scroll-to-top button, Translate languages JSON block, Tailwind CDN

### Community 4 - "NFC keychain guide page"
Cohesion: 0.50
Nodes (5): NFC keychain guide page, NFC step-by-step guide stepper, WhatsApp link generator helper, nfcGuide schema, nfcGuide whatsapp helper schema

### Community 5 - "initializeCartPage"
Cohesion: 0.70
Nodes (5): changeCartQuantity(), formatCurrency(), initializeCartPage(), readCart(), removeCartItem()

### Community 6 - "_config.yml (Jekyll config)"
Cohesion: 0.50
Nodes (4): _config.yml (Jekyll config), jekyll-sitemap plugin, README Aarontxu 3D, GitHub Pages hosting (3d.aarontxu.com)

### Community 7 - "Sticky header (back link, title, cart, theme, translate)"
Cohesion: 0.50
Nodes (4): Cart link with count badge, Sticky header (back link, title, cart, theme, translate), Heading source switch (cv/3d data titles), Translate button and Google Translate container

### Community 8 - "Root CSS color variables (light/dark)"
Cohesion: 0.50
Nodes (4): Root CSS color variables (light/dark), Tailwind config (CSS variable palette), Theme bootstrap script (applyTheme), Theme toggle button

### Community 9 - "saveCart"
Cohesion: 0.50
Nodes (4): initializeProductCart(), normalizeQuantity(), saveCart(), updateCartBadge()

### Community 10 - "Home page (index.html)"
Cohesion: 0.67
Nodes (3): Home page (index.html), External contact and social links section, Intro section with profile image, description and internal chips nav

## Knowledge Gaps
- **20 isolated node(s):** `cart-empty state`, `cart-quote-note`, `default layout`, `Privacy page (privacy.html)`, `languages schema` (+15 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 28 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Default Jekyll Layout` connect `Default Jekyll Layout` to `Root CSS color variables (light/dark)`, `Home page (index.html)`, `Sticky header (back link, title, cart, theme, translate)`?**
  _High betweenness centrality (0.048) - this node is a cross-community bridge._
- **What connects `cart-empty state`, `cart-quote-note`, `default layout` to the rest of the system?**
  _20 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Why does `aarontxu_3d content file definition` connect `aarontxu_3d content file definition` to `NFC keychain guide page`?**
  _High betweenness centrality (0.034) - this node is a cross-community bridge._
- **Why does `Sticky header (back link, title, cart, theme, translate)` connect `Sticky header (back link, title, cart, theme, translate)` to `Root CSS color variables (light/dark)`, `Default Jekyll Layout`?**
  _High betweenness centrality (0.023) - this node is a cross-community bridge._