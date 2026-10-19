# worker/src/index.js

- json · function · L6-L8 — function json(data, status = 200, headers = {})
- cors · function · L10-L16 — function cors(request, env)
- sha256 · function · L18-L21 — async function sha256(value)
- base64url · function · L23-L25 — function base64url(value)
- accessEmail · function · L27-L49 — async function accessEmail(request, env)
- decode · function · L32-L32 — decode = value
- loadCatalog · function · L51-L55 — async function loadCatalog(env)
- orderPrefix · function · L57-L59 — function orderPrefix(environment)
- formatOrderNumber · function · L61-L64 — function formatOrderNumber(prefix, date, counter)
- allocateOrderNumber · function · L66-L70 — async function allocateOrderNumber(db, prefix, date)
- priceOrder · function · L72-L87 — function priceOrder(lines, catalog)
- createOrder · function · L89-L127 — async function createOrder(request, env, headers)
- getOrder · function · L129-L134 — async function getOrder(id, key, env, headers)
- adminRequest · function · L136-L154 — async function adminRequest(request, env, path, headers)
- adminPage · function · L156-L158 — function adminPage()
- fetch · method · L161-L179 — async fetch(request, env)
- scheduled · method · L180-L182 — async scheduled(controller, env, ctx)
