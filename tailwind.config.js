// Compila assets/site.css (sin archivo de entrada: base, components y utilities por defecto).
// Recompilar al cambiar clases: npx tailwindcss@3.4.17 -o assets/site.css --minify
// Paleta global: los colores salen de las variables CSS de :root (claro y oscuro, en _layouts/default.html).
module.exports = {
    content: ['./*.html', './_layouts/**/*.html', './_includes/**/*.html', './pages/**/*.html', './script.js'],
    theme: {
        extend: {
            fontFamily: {
                sans: ['-apple-system', 'BlinkMacSystemFont', '"SF Pro Text"', '"Segoe UI"', 'system-ui', 'sans-serif']
            },
            colors: {
                canvas: 'rgb(var(--canvas) / <alpha-value>)',
                surface: 'rgb(var(--surface) / <alpha-value>)',
                fill: 'rgb(var(--fill) / <alpha-value>)',
                ink: 'rgb(var(--ink) / <alpha-value>)',
                muted: 'rgb(var(--muted) / <alpha-value>)',
                line: 'rgb(var(--line) / <alpha-value>)',
                brand: {
                    DEFAULT: 'rgb(var(--brand) / <alpha-value>)',
                    hover: 'rgb(var(--brand-hover) / <alpha-value>)',
                    text: 'rgb(var(--brand-text) / <alpha-value>)',
                    on: 'rgb(var(--brand-on) / <alpha-value>)',
                    tint: 'rgb(var(--brand-tint) / <alpha-value>)'
                },
                accent: {
                    DEFAULT: 'rgb(var(--accent) / <alpha-value>)',
                    hover: 'rgb(var(--accent-hover) / <alpha-value>)',
                    on: 'rgb(var(--accent-on) / <alpha-value>)'
                },
                danger: 'rgb(var(--danger) / <alpha-value>)',
                warning: {
                    DEFAULT: 'rgb(var(--warning) / <alpha-value>)',
                    tint: 'rgb(var(--warning-tint) / <alpha-value>)'
                },
                'grad-from': 'rgb(var(--grad-from) / <alpha-value>)',
                'grad-to': 'rgb(var(--grad-to) / <alpha-value>)'
            },
            boxShadow: {
                card: '0 1px 2px rgb(0 0 0 / .04), 0 8px 24px rgb(0 0 0 / .06)'
            }
        }
    }
};
