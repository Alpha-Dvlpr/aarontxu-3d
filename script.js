const CART_STORAGE_KEY = 'aarontxu-3d-cart-v1';

function initializeBackToTop() {
    const button = document.getElementById('scrollTopBtn');
    if (!button) return;

    const updateVisibility = () => {
        const isVisible = window.scrollY > 200;
        button.classList.toggle('opacity-100', isVisible);
        button.classList.toggle('opacity-0', !isVisible);
        button.classList.toggle('pointer-events-none', !isVisible);
        button.inert = !isVisible;
    };

    window.addEventListener('scroll', updateVisibility, { passive: true });
    button.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
    updateVisibility();
}

function initializeCartBackLink() {
    const originKey = 'aarontxu-3d-cart-origin';
    try {
        if (!document.getElementById('cart-empty')) {
            sessionStorage.setItem(originKey, location.pathname + location.search);
            return;
        }
        const origin = sessionStorage.getItem(originKey);
        const link = document.getElementById('back-link');
        if (origin && link) link.href = origin;
    } catch {}
}

function readCart() {
    try {
        const storedCart = JSON.parse(window.localStorage.getItem(CART_STORAGE_KEY) || '[]');
        if (!Array.isArray(storedCart)) return [];

        return storedCart
            .filter(item => item && typeof item.id === 'string' && typeof item.name === 'string')
            .map(item => ({
                id: item.id,
                name: item.name,
                price: Number(item.price),
                priceLabel: typeof item.priceLabel === 'string' ? item.priceLabel : '',
                quantity: Math.max(1, Math.floor(Number(item.quantity))),
                image: typeof item.image === 'string' ? item.image : ''
            }))
            .filter(item => Number.isFinite(item.price) && Number.isFinite(item.quantity));
    } catch {
        return [];
    }
}

function formatCurrency(value) {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(value);
}

function updateCartBadge(cart = readCart()) {
    const badge = document.getElementById('cart-count');
    const cartLink = document.getElementById('cart-link');
    if (!badge || !cartLink) return;

    const count = cart.reduce((total, item) => total + item.quantity, 0);
    badge.textContent = String(count);
    badge.classList.toggle('hidden', count === 0);
    cartLink.setAttribute('aria-label', count === 1 ? 'Cesta, 1 producto' : `Cesta, ${count} productos`);
}

function saveCart(cart) {
    try {
        window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
    } catch {
        const announcement = document.getElementById('cart-announcement');
        if (announcement) announcement.textContent = 'No se ha podido guardar la cesta en este navegador.';
    }
    updateCartBadge(cart);
}

function normalizeQuantity(value) {
    const quantity = Math.floor(Number(value));
    return Number.isFinite(quantity) ? Math.max(1, quantity) : 1;
}

function initializeProductCart() {
    const cards = document.querySelectorAll('[data-product-card]');
    const announcement = document.getElementById('cart-announcement');

    cards.forEach(card => {
        const quantityInput = card.querySelector('[data-product-quantity]');
        const addButton = card.querySelector('[data-add-to-cart]');
        if (!quantityInput || !addButton) return;

        card.querySelectorAll('[data-quantity-step]').forEach(stepButton => {
            stepButton.addEventListener('click', () => {
                const step = Number(stepButton.dataset.quantityStep);
                quantityInput.value = String(Math.max(1, normalizeQuantity(quantityInput.value) + step));
            });
        });

        quantityInput.addEventListener('change', () => {
            quantityInput.value = String(normalizeQuantity(quantityInput.value));
        });

        addButton.addEventListener('click', () => {
            const product = {
                id: card.dataset.productId,
                name: card.dataset.productName,
                price: Number(card.dataset.productPrice),
                priceLabel: card.dataset.productPriceLabel || '',
                quantity: normalizeQuantity(quantityInput.value),
                image: card.dataset.productImage || ''
            };
            const cart = readCart();
            const existingItem = cart.find(item => item.id === product.id);

            if (existingItem) {
                existingItem.quantity += product.quantity;
            } else {
                cart.push(product);
            }

            saveCart(cart);
            if (announcement) announcement.textContent = `Añadidas ${product.quantity} unidades de ${product.name} a la cesta.`;
            const originalLabel = addButton.textContent;
            addButton.textContent = 'Añadido';
            window.setTimeout(() => { addButton.textContent = originalLabel; }, 1200);
        });
    });
}

function initializeCartPage() {
    const cartPage = document.getElementById('cart-page');
    if (!cartPage) return;

    const itemList = document.getElementById('cart-items');
    const emptyMessage = document.getElementById('cart-empty');
    const summary = document.getElementById('cart-summary');
    const totalOutput = document.getElementById('cart-total');
    const orderLink = document.getElementById('cart-order-link');
    const whatsappUrl = cartPage.dataset.whatsappUrl;

    const render = () => {
        const cart = readCart();
        itemList.replaceChildren();
        emptyMessage.hidden = cart.length > 0;
        summary.hidden = cart.length === 0;
        updateCartBadge(cart);

        cart.forEach(item => {
            const row = document.createElement('li');
            row.className = 'flex flex-col gap-4 rounded-3xl bg-surface p-4 shadow-card sm:flex-row sm:items-center';

            if (item.image) {
                const image = document.createElement('img');
                image.src = item.image;
                image.alt = item.name;
                image.width = 96;
                image.height = 96;
                image.loading = 'lazy';
                image.className = 'h-24 w-24 shrink-0 self-center rounded-2xl object-cover sm:self-auto';
                row.appendChild(image);
            }

            const details = document.createElement('div');
            details.className = 'min-w-0 flex-1 text-center sm:text-left';
            const name = document.createElement('h2');
            name.className = 'font-semibold text-ink';
            name.textContent = item.name;
            const unitPrice = document.createElement('p');
            unitPrice.className = 'mt-1 text-sm text-muted';
            unitPrice.textContent = item.priceLabel || `${formatCurrency(item.price)} / unidad`;
            details.append(name, unitPrice);
            row.appendChild(details);

            const quantityControls = document.createElement('div');
            quantityControls.className = 'flex items-center justify-center gap-2';
            const decreaseButton = document.createElement('button');
            decreaseButton.type = 'button';
            decreaseButton.textContent = '−';
            decreaseButton.setAttribute('aria-label', `Reducir cantidad de ${item.name}`);
            decreaseButton.className = 'grid h-11 w-11 place-items-center rounded-full bg-fill text-xl text-ink transition hover:bg-line';
            decreaseButton.addEventListener('click', () => changeCartQuantity(item.id, item.quantity - 1, render));
            const quantity = document.createElement('span');
            quantity.className = 'min-w-8 text-center font-medium text-ink';
            quantity.textContent = String(item.quantity);
            const increaseButton = document.createElement('button');
            increaseButton.type = 'button';
            increaseButton.textContent = '+';
            increaseButton.setAttribute('aria-label', `Aumentar cantidad de ${item.name}`);
            increaseButton.className = 'grid h-11 w-11 place-items-center rounded-full bg-fill text-xl text-ink transition hover:bg-line';
            increaseButton.addEventListener('click', () => changeCartQuantity(item.id, item.quantity + 1, render));
            quantityControls.append(decreaseButton, quantity, increaseButton);
            row.appendChild(quantityControls);

            const subtotal = document.createElement('p');
            subtotal.className = 'min-w-24 text-center font-bold text-brand-text';
            subtotal.textContent = item.priceLabel ? 'A consultar' : formatCurrency(item.price * item.quantity);
            row.appendChild(subtotal);

            const removeButton = document.createElement('button');
            removeButton.type = 'button';
            removeButton.textContent = 'Quitar';
            removeButton.setAttribute('aria-label', `Quitar ${item.name} de la cesta`);
            removeButton.className = 'min-h-11 rounded-full px-4 text-sm font-medium text-danger transition hover:bg-fill';
            removeButton.addEventListener('click', () => removeCartItem(item.id, render));
            row.appendChild(removeButton);
            itemList.appendChild(row);
        });

        const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
        const hasQuoteItems = cart.some(item => item.priceLabel);
        const totalLabel = document.getElementById('cart-total-label');
        const quoteNote = document.getElementById('cart-quote-note');
        totalLabel.textContent = hasQuoteItems ? 'Subtotal estimado:' : 'Total:';
        quoteNote.hidden = !hasQuoteItems;
        totalOutput.textContent = formatCurrency(total);
        if (cart.length > 0) {
            const orderLines = cart.map(item => `- ${item.name} x ${item.quantity}: ${item.priceLabel || formatCurrency(item.price * item.quantity)}`);
            const totalLine = `${hasQuoteItems ? 'Subtotal estimado (sin productos a consultar)' : 'Total'}: ${formatCurrency(total)}`;
            const orderMessage = ['Hola, quiero realizar este pedido:', '', ...orderLines, '', totalLine].join('\n');
            orderLink.href = `${whatsappUrl}?text=${encodeURIComponent(orderMessage)}`;
        } else {
            orderLink.href = '#';
        }
    };

    render();
    window.addEventListener('storage', event => {
        if (event.key === CART_STORAGE_KEY) render();
    });
}

function changeCartQuantity(productId, quantity, render) {
    if (quantity <= 0) {
        removeCartItem(productId, render);
        return;
    }

    const cart = readCart().map(item => item.id === productId ? { ...item, quantity } : item);
    saveCart(cart);
    render();
}

function removeCartItem(productId, render) {
    const cart = readCart().filter(item => item.id !== productId);
    saveCart(cart);
    render();
}

function initializeTranslation() {
    const button = document.getElementById('translate-btn');
    const widget = document.getElementById('google_translate_element');
    const languageData = document.getElementById('translate-languages');
    if (!button || !widget || !languageData) return;

    let scriptLoaded = false;
    button.addEventListener('click', () => {
        const willOpen = widget.classList.contains('hidden');
        widget.classList.toggle('hidden', !willOpen);
        button.setAttribute('aria-expanded', String(willOpen));
        if (!willOpen || scriptLoaded) return;

        let languages = {};
        try {
            languages = JSON.parse(languageData.textContent || '{}');
        } catch {
            return;
        }

        window.googleTranslateElementInit = () => {
            new window.google.translate.TranslateElement({
                pageLanguage: 'es',
                includedLanguages: Object.keys(languages).filter(code => code !== 'es').join(','),
                autoDisplay: false
            }, widget.id);
        };

        const script = document.createElement('script');
        script.src = 'https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit';
        script.onerror = () => {
            scriptLoaded = false;
            widget.classList.add('hidden');
            button.setAttribute('aria-expanded', 'false');
        };
        scriptLoaded = true;
        document.head.appendChild(script);
    });
}

function initializeProductFilters() {
    const controls = document.getElementById('product-filters');
    const cards = Array.from(document.querySelectorAll('[data-product-card]'));
    if (!controls || cards.length === 0) return;

    const categories = new Map(cards.map(card => [card.dataset.category, card.dataset.categoryName]));
    const filters = [['all', 'Ver todo'], ...categories.entries()];

    filters.forEach(([id, label], index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = label;
        button.className = 'min-h-11 shrink-0 rounded-full px-5 text-sm font-medium transition active:scale-95';
        button.setAttribute('aria-pressed', String(index === 0));
        button.classList.add(...(index === 0 ? ['bg-brand', 'text-brand-on'] : ['bg-fill', 'text-ink']));
        button.addEventListener('click', () => {
            cards.forEach(card => {
                const shouldHide = id !== 'all' && card.dataset.category !== id;
                card.hidden = false;
                card.classList.toggle('hidden', shouldHide);
            });
            controls.querySelectorAll('button').forEach(filterButton => {
                const selected = filterButton === button;
                filterButton.setAttribute('aria-pressed', String(selected));
                filterButton.classList.toggle('bg-brand', selected);
                filterButton.classList.toggle('text-brand-on', selected);
                filterButton.classList.toggle('bg-fill', !selected);
                filterButton.classList.toggle('text-ink', !selected);
            });
        });
        controls.appendChild(button);
    });
}

function initializeImageModal() {
    const modal = document.getElementById('image-modal');
    const image = document.getElementById('modal-image');
    if (!(modal instanceof HTMLDialogElement) || !image) return;

    document.querySelectorAll('[data-image-src]').forEach(button => {
        button.addEventListener('click', () => {
            image.src = button.dataset.imageSrc;
            image.alt = button.dataset.imageAlt || '';
            modal.showModal();
        });
    });

    modal.addEventListener('click', event => {
        if (event.target === modal) modal.close();
    });
}

function initializeGalleryDrag() {
    document.querySelectorAll('[data-gallery]').forEach(gallery => {
        let startX = 0;
        let startScroll = 0;
        let dragged = false;

        gallery.addEventListener('pointerdown', event => {
            if (event.pointerType !== 'mouse' || event.button !== 0) return;
            startX = event.clientX;
            startScroll = gallery.scrollLeft;
            dragged = false;
            const onMove = moveEvent => {
                const delta = moveEvent.clientX - startX;
                if (Math.abs(delta) > 5) {
                    dragged = true;
                    gallery.classList.add('dragging');
                }
                gallery.scrollLeft = startScroll - delta;
            };
            const onUp = () => {
                window.removeEventListener('pointermove', onMove);
                window.removeEventListener('pointerup', onUp);
                gallery.classList.remove('dragging');
            };
            window.addEventListener('pointermove', onMove);
            window.addEventListener('pointerup', onUp);
        });

        gallery.addEventListener('click', event => {
            if (dragged) {
                event.stopPropagation();
                event.preventDefault();
                dragged = false;
            }
        }, true);
    });
}

document.addEventListener('DOMContentLoaded', () => {
    initializeGalleryDrag();
    initializeCartBackLink();
    initializeBackToTop();
    initializeTranslation();
    initializeProductFilters();
    initializeImageModal();
    updateCartBadge();
    initializeProductCart();
    initializeCartPage();
});