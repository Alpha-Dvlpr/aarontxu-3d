# Graph Report - aarontxu-3d  (2026-10-19)

## Corpus Check
- 13 files · ~88,346 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 7 file(s) not represented in the graph (top: (none) 5, .toml 1, .jsonc 1)

## Summary
- 1994 nodes · 2118 edges · 168 communities (20 shown, 148 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 9 edges (avg confidence: 0.78)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `7f479c75`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Content entry: Aarontxu 3D
- Default layout
- Product card (data-product-card)
- script.js
- index.js
- package.json
- README.md
- Jekyll site config (_config.yml)
- worker-configuration.d.ts
- ServiceWorkerGlobalScope
- aarontxu-3d/README.md
- Event
- Console
- TransformStream
- URL
- ArtifactsRepo
- URLSearchParams
- Container
- DurableObjectStorage
- Element
- Headers
- SubtleCrypto
- Blob
- Body
- BrowserRun
- FormData
- URLPattern
- DurableObjectState
- Flagship
- WorkerEntrypoint
- Productos y servicios page
- Cart page (Tu cesta)
- StreamError
- R2ObjectBody
- AgentMemoryProfile
- ByteLengthQueuingStrategy
- WritableStream
- DurableObject
- DurableObjectTransaction
- ReadableStream
- Socket
- Span
- WorkflowInstance
- WritableStreamDefaultWriter
- Ai
- AiSearchInstance
- DurableObjectNamespace
- R2Bucket
- SqlStorageCursor
- Vectorize
- AiSearchNamespace
- ReadableStreamBYOBReader
- VectorizeIndex
- AiSearchItem
- AiSearchItems
- Artifacts
- D1Database
- D1PreparedStatement
- ImageHandle
- KVNamespace
- ReadableByteStreamController
- ReadableStreamDefaultReader
- TextDecoder
- AiGateway
- Comment
- DurableObjectFacets
- ForwardableEmailMessage
- HostedImagesBinding
- HTMLRewriter
- HTMLRewriterDocumentContentHandlers
- ReadableStreamBYOBRequest
- ReadableStreamDefaultController
- StreamScopedCaptions
- StreamVideoHandle
- StreamWatermarks
- SyncKvStorage
- Table
- Text
- TextEncoder
- tracing
- TransformStreamDefaultController
- Workflow
- AbortController
- AiSearchJob
- AiSearchJobs
- AutoRAG
- cache
- Crypto
- D1DatabaseSession
- EndTag
- ExecProcess
- ExecutionContext
- HTMLRewriterElementContentHandlers
- ImagesBinding
- ImageTransformationResult
- ImageTransformer
- MediaTransformationResult
- Module
- Performance
- Queue
- R2MultipartUpload
- StreamBinding
- StreamScopedDownloads
- WebSocketRequestResponsePair
- WorkflowEntrypoint
- 404 page
- AgentMemoryNamespace
- BasicImageTransformations
- CacheContext
- ColoLocalActorNamespace
- DOMException
- DurableObjectId
- Global
- HelloWorldBinding
- HyperdriveDynamicApi
- MediaTransformer
- Memory
- Message
- MessageBatch
- NodeStyleServer
- PipelineTransformationEntrypoint
- RequestInitCfPropertiesVaryHeader
- SqlStorage
- ToMarkdownService
- WorkerLoader
- WorkerStub
- WorkflowStep
- WritableStreamDefaultController
- AnalyticsEngineDataset
- AnalyticsSQLBinding
- __BaseEnv_Env
- CacheStorage
- CloudflareAccessContext
- CompileError
- DispatchNamespace
- DocumentEnd
- EventListenerObject
- Hyperdrive
- IncomingRequestCfPropertiesBotManagement
- Instance
- JsonWebKey
- MediaBinding
- MediaTransformationGenerator
- MessageChannel
- Navigator
- NonRetryableError
- Pipeline
- ProcessEnv
- R2Checksums
- RateLimit
- ResponseFunctionToolCall
- RpcTarget
- RuntimeError
- ScheduledController
- Scheduler
- SecretsStoreSecret
- SendEmail
- StreamVideos
- TraceItemFetchEventInfoRequest
- UnsafeTraceMetrics
- WebSearch
- Base_Ai_Cf_Google_Gemma_4_26B_A4B_It
- __DURABLE_OBJECT_BRAND
- onRequest
- __RPC_STUB_BRAND
- __RPC_TARGET_BRAND
- __WORKER_ENTRYPOINT_BRAND
- __WORKFLOW_ENTRYPOINT_BRAND

## God Nodes (most connected - your core abstractions)
1. `Event` - 25 edges
2. `Console` - 21 edges
3. `URLSearchParams` - 16 edges
4. `Productos y servicios page` - 16 edges
5. `DurableObjectStorage` - 15 edges
6. `Container` - 15 edges
7. `SubtleCrypto` - 14 edges
8. `Element` - 14 edges
9. `Headers` - 14 edges
10. `Default layout` - 14 edges

## Surprising Connections (you probably didn't know these)
- `Product card (gallery, quantity, add to cart)` --semantically_similar_to--> `product-catalog JSON`  [INFERRED] [semantically similar]
  pages/products.html → _layouts/default.html
- `Productos y servicios page` --references--> `Home page (index.html)`  [EXTRACTED]
  pages/products.html → index.html
- `Productos y servicios page` --references--> `Default layout`  [EXTRACTED]
  pages/products.html → _layouts/default.html
- `Product JSON-LD list` --shares_data_with--> `Products and services schema (elements, extras, images)`  [EXTRACTED]
  pages/products.html → .pages.yml
- `404 page` --references--> `Default layout`  [EXTRACTED]
  404.html → _layouts/default.html

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Light/dark theming system** — layouts_default_applytheme, layouts_default_tailwind_config, layouts_default_css_palette, layouts_default_header [EXTRACTED 0.85]
- **Legal and privacy pages rendered from shared include and CMS data** — pages_legal, pages_privacy, includes_legal_sections [EXTRACTED 0.90]
- **Product selection to WhatsApp order flow** — pages_products_card, pages_products_extras, layouts_default_product_catalog, pages_cart, pages_cart_whatsapp_order, pages_cart_sent_countdown [INFERRED 0.80]

## Communities (168 total, 148 thin omitted)

### Community 0 - "Content entry: Aarontxu 3D"
Cohesion: 0.22
Nodes (11): product-catalog JSON, translate-languages JSON, Content entry: Aarontxu 3D, .pages.yml (Pages CMS config), Translation languages schema, NFC keychain guide schema, Product card (gallery, quantity, add to cart), Paid extras checkboxes (+3 more)

### Community 1 - "Default layout"
Cohesion: 0.18
Nodes (13): legal-sections include, Home page (index.html), External contact and social links section, Intro section with profile image, description and internal chips nav, Default layout, applyTheme() theme bootstrap, CSS color variables (:root light/dark), Tailwind config (global palette) (+5 more)

### Community 2 - "Product card (data-product-card)"
Cohesion: 0.23
Nodes (12): Add to cart button (data-add-to-cart), Product catalog masonry grid, Image zoom dialog, Modal image (#modal-image), Liquid price formatting (euros,cents), Price output (data-product-price-output), Product card (data-product-card), Extras select (data-product-extra) (+4 more)

### Community 3 - "script.js"
Cohesion: 0.17
Nodes (13): announce(), applyCatalog(), cartLineName(), formatCurrency(), initializeCartPage(), initializeProductCart(), localOrderRequest(), normalizeQuantity() (+5 more)

### Community 4 - "index.js"
Cohesion: 0.17
Nodes (18): accessEmail(), adminPage(), adminRequest(), allocateOrderNumber(), cors(), createOrder(), encoder, fetch() (+10 more)

### Community 5 - "package.json"
Cohesion: 0.29
Nodes (6): wrangler, devDependencies, wrangler, scripts, test, type

### Community 7 - "Jekyll site config (_config.yml)"
Cohesion: 0.67
Nodes (3): Jekyll site config (_config.yml), Exclude graphify-out from build, Plugin: jekyll-sitemap

### Community 8 - "worker-configuration.d.ts"
Cohesion: 0.00
Nodes (942): RFC-2253, RFC-3339, RFC-5246, RFC-9440, AgentMemoryGetSummaryOptions, AgentMemoryGetSummaryResponse, AgentMemoryIncomingMemory, AgentMemoryIngestOptions (+934 more)

### Community 9 - "ServiceWorkerGlobalScope"
Cohesion: 0.04
Nodes (7): AbortSignal, EventSource, EventTarget, MessagePort, ServiceWorkerGlobalScope, WebSocket, WorkerGlobalScope

### Community 11 - "Event"
Cohesion: 0.04
Nodes (12): CloseEvent, CustomEvent, EmailEvent, ErrorEvent, Event, ExtendableEvent, FetchEvent, MessageEvent (+4 more)

### Community 13 - "TransformStream"
Cohesion: 0.10
Nodes (7): CompressionStream, DecompressionStream, FixedLengthStream, IdentityTransformStream, TextDecoderStream, TextEncoderStream, TransformStream

### Community 15 - "ArtifactsRepo"
Cohesion: 0.11
Nodes (5): ArtifactsRepo, Disposable, HyperdriveDynamic, StubBase, WorkflowInstanceSubscription

### Community 23 - "Body"
Cohesion: 0.15
Nodes (3): Body, Request, Response

### Community 30 - "Productos y servicios page"
Cohesion: 0.22
Nodes (11): default layout, mini_img.png favicon, Productos y servicios page, 3d_products_title heading source, Cart announcement live region, Product category filters nav, Layout: default, Product catalog grid (+3 more)

### Community 31 - "Cart page (Tu cesta)"
Cohesion: 0.22
Nodes (11): Footer (privacy and legal links), Sticky header (back link, cart, theme, translate), LocalBusiness JSON-LD, Cart page (Tu cesta), Photo publication opt-out checkbox, Sent confirmation and auto-clear countdown, Order via WhatsApp link, Legal notice schema (email) (+3 more)

### Community 32 - "StreamError"
Cohesion: 0.18
Nodes (11): AlreadyUploadedError, BadRequestError, ForbiddenError, InternalError, InvalidURLError, MaxFileSizeError, NotFoundError, QuotaReachedError (+3 more)

### Community 35 - "ByteLengthQueuingStrategy"
Cohesion: 0.22
Nodes (3): ByteLengthQueuingStrategy, CountQueuingStrategy, QueuingStrategy

### Community 105 - "404 page"
Cohesion: 1.00
Nodes (3): 404 page, site-pages JSON index, Similar-URL suggestion script (Levenshtein)

### Community 107 - "BasicImageTransformations"
Cohesion: 0.67
Nodes (3): BasicImageTransformations, RequestInitCfPropertiesImage, RequestInitCfPropertiesImageDraw

### Community 121 - "RequestInitCfPropertiesVaryHeader"
Cohesion: 0.67
Nodes (3): RequestInitCfPropertiesVaryAcceptHeader, RequestInitCfPropertiesVaryAcceptLanguageHeader, RequestInitCfPropertiesVaryHeader

## Knowledge Gaps
- **28 isolated node(s):** `wrangler`, `RFC-5246`, `RFC-2253`, `RFC-9440`, `RFC-3339` (+23 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1704 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **148 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `URL` connect `URL` to `worker-configuration.d.ts`?**
  _High betweenness centrality (0.028) - this node is a cross-community bridge._
- **What connects `wrangler`, `RFC-5246`, `RFC-2253` to the rest of the system?**
  _28 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `worker-configuration.d.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.0021141649048625794 - nodes in this community are weakly interconnected._
- **Why does `Headers` connect `Headers` to `worker-configuration.d.ts`?**
  _High betweenness centrality (0.025) - this node is a cross-community bridge._
- **Should `ServiceWorkerGlobalScope` be split into smaller, more focused modules?**
  _Cohesion score 0.043478260869565216 - nodes in this community are weakly interconnected._
- **Why does `URLPattern` connect `URLPattern` to `worker-configuration.d.ts`?**
  _High betweenness centrality (0.025) - this node is a cross-community bridge._
- **Should `Event` be split into smaller, more focused modules?**
  _Cohesion score 0.043478260869565216 - nodes in this community are weakly interconnected._