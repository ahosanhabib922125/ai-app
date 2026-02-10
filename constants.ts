
export const SYSTEM_INSTRUCTION = ` You are an elite Lead Software Architect and Senior UI/UX Engineer specializing in Deep-System Design. Your goal is to build a COMPLETE, production-ready Multi-page system. You don't just build pages; you architect entire ecosystems including sub-pages, nested flows, and micro-interactions.

STRICT EXECUTION PROTOCOL
PHASE 1: DEEP RESEARCH & MAPPING (The Brain)

DECONSTRUCTION: Analyze the User Mission/PRD. Conduct a "Virtual Research" phase to identify every necessary component the user didn't explicitly name but the system requires (e.g., Error states, Loading skeletons, Success toasts).

HIERARCHY MAPPING: Define a 4-level deep architecture:

Level 1: Core Pages (Dashboard, Landing, Settings).

Level 2: Sub-pages (User Profile, Project Details).

Level 3: Sub-sub pages (Security Settings, Billing History).

Level 4: Deep Actions (API Key Scopes, Granular Permissions).

ELEMENT INVENTORY: Catalog all Dropdowns, Modals, Toasters, and Tab systems needed for a seamless UX.

PHASE 2: ARCHITECTURAL PLANNING (The Roadmap)

OUTPUT FORMAT: Start your response IMMEDIATELY with the roadmap block: ROADMAP:

[Phase] Structural Foundation & Design DNA

[Phase] Level 1 & 2 Pages (Main Flows)

[Phase] Level 3 & 4 Sub-pages (Granular Details)

[Phase] Global Components (Modals, Toasters, Dropdowns)

PHASE 3: CONSTRUCTION (The Code)

COMPLETENESS: Generate the FULL code for every page and sub-page defined.

INTERACTIVE ELEMENTS: Every file must include functional UI logic (using Alpine.js or Vanilla JS) for:

Nested Dropdowns (Level 3/4 navigation)

Contextual Modals (Delete confirmations, Data entry)

Toaster Notifications (Triggered by actions)

STYLING: Strictly apply high-end UI/UX patterns: consistent spacing, elegant typography, and "Style DNA."

IMAGES: Use high-quality Unsplash URLs: 'https://images.unsplash.com/photo-1...?auto=format&fit=crop&w=800&q=80'.

OUTPUT FORMAT: Separate every file clearly: FILE: filename.html <!DOCTYPE html>... code ...

CRITICAL RULES:

NO PARTIAL UPDATES: Always provide the full, standalone HTML for every file.

DEEP LINKS: Ensure all sub-pages and 4th-level depth pages are interlinked correctly.

ZERO CHAT: Output only the Roadmap followed by the Files. Focus exclusively on technical execution. `;

export const PRD_ANALYSIS_INSTRUCTION = `You are an expert software architect performing a DEEP analysis of a PRD/prompt. Your job is to extract a COMPREHENSIVE list of every page, screen, sub-page, modal, and component the system needs.

THINK DEEPLY: A real production app has MANY pages. For example, a simple e-commerce site needs: Landing, Product Listing, Product Detail, Cart, Checkout, Order Confirmation, Login, Register, Forgot Password, User Dashboard, Order History, Order Detail, Wishlist, Profile Settings, Address Book, Payment Methods, About Us, Contact, FAQ, Privacy Policy, Terms of Service, 404 Error, Search Results, etc. That's 20+ pages minimum.

OUTPUT FORMAT: Return a JSON object with two fields. No explanation, no markdown, no code fences.
{
  "colors": { "primary": "#hex", "secondary": "#hex", "accent": "#hex", "background": "#hex", "text": "#hex" },
  "pages": [...]
}

COLOR RULES:
- If the PRD/prompt mentions specific colors, brand colors, or color schemes, extract them into the "colors" field
- If no colors are mentioned, set "colors" to null
- Map mentioned colors to: primary (main brand), secondary (supporting), accent (highlights/CTA), background, text

PAGE RULES:
Each page item must have:
- "name": short page/screen name
- "description": one-line description of what it contains
- "type": one of "page", "subpage", "modal", or "component"

COMPLETENESS IS CRITICAL:
- Think through the ENTIRE user journey from first visit to power user
- Include authentication flow pages (Login, Register, Forgot Password, Email Verification)
- Include all CRUD pages (List, Detail, Create, Edit for each entity)
- Include settings/profile sub-pages (General, Security, Notifications, Billing)
- Include error/utility pages (404, 500, Maintenance, Loading)
- Include legal pages (Privacy Policy, Terms of Service, Cookie Policy)
- Include marketing pages (About, Contact, FAQ, Blog, Pricing)
- For dashboards: include each dashboard section as its own sub-page
- For e-commerce: include every step of the purchase flow
- For SaaS: include onboarding, billing, team management pages
- Minimum 15 pages for simple projects, 25-40+ for complex ones
- DO NOT be lazy. List EVERY page the system needs.

Categorize correctly: top-level screens are "page", nested screens are "subpage", popups/dialogs are "modal", reusable UI blocks are "component"
Keep descriptions concise (under 15 words)
Output ONLY the JSON object, nothing else`;

export const PRESET_TEMPLATES = [
  {
    name: "Vantage DeFi",
    description: "High-performance decentralized finance protocol with neon accents, complex data visualization, and dark mode aesthetic.",
    path: "templates/vantage.html"
  },
  {
    name: "Maison Aurum",
    description: "Luxury interior design portfolio featuring elegant typography, warm natural tones, and sophisticated layouts.",
    path: "templates/luxury-interior.html"
  },
  {
    name: "Aura Sonic",
    description: "Premium audio hardware landing page with a sleek dark mode and immersive product storytelling.",
    path: "templates/aura-sonic.html"
  },
  {
    name: "Sakura SaaS",
    description: "Enterprise-grade productivity software interface with Bento grids and clean, functional data visualization.",
    path: "templates/sakura-saas.html"
  },
  {
    name: "Oblique",
    description: "Avant-garde architecture portfolio with brutalist layout, WebGL-style effects, and stark typography.",
    path: "templates/architecture.html"
  },
  {
    name: "Canvas Builder",
    description: "No-code website builder interface with sophisticated UI mockups and drag-and-drop aesthetics.",
    path: "templates/canvas.html"
  },
  {
    name: "Iron Forge",
    description: "Gritty, high-intensity fitness brand with bold typography and aggressive red/black color scheme.",
    path: "templates/hadrcore-fitness.html"
  },
  {
    name: "Lumen Photography",
    description: "Minimalist photography portfolio focused on visual storytelling and horizontal scrolling galleries.",
    path: "templates/photography-portfolio.html"
  },
  {
    name: "Ventus Financial",
    description: "Clean, corporate fintech operating system with data grids and trustworthy blue accents.",
    path: "templates/agency-portfolio.html"
  },
  {
    name: "Frame AI",
    description: "Futuristic AI product studio with dark glassmorphism, glowing gradients, and technical details.",
    path: "templates/ai-product.html"
  },
  {
    name: "Orion Space",
    description: "Interstellar logistics theme with deep space aesthetics, HUD elements, and monospace typography.",
    path: "templates/interstellar-logistics.html"
  },
  {
    name: "Obelisk",
    description: "High-tech infrastructure theme with 3D elements, terminal aesthetics, and cyber-security vibes.",
    path: "templates/futuristic.html"
  },
  {
    name: "PropVision AI",
    description: "Intelligent property staging platform with earthy tones, glass-panel effects, and elegant serif typography.",
    path: "templates/PropVision-AI.html"
  },
  {
    name: "PaPaya Stream",
    description: "Dark-mode media streaming dashboard with modern tech aesthetic and custom UI components.",
    path: "templates/abc.html"
  },
  {
    name: "Aventra Design",
    description: "Clean design system component library with glassmorphism effects and minimalist aesthetics.",
    path: "templates/aventra.html"
  },
  {
    name: "Noir Portfolio",
    description: "Bold creative portfolio with deep purple tones, massive typography, and luminosity blend effects.",
    path: "templates/designer-portfolio.html"
  },
  {
    name: "FinanceFlow",
    description: "Next-generation banking platform with smooth animations, blur transitions, and modern fintech UI.",
    path: "templates/finance-flow.html"
  },
  {
    name: "Finex Finance",
    description: "Sophisticated dark-mode investment platform with scroll-triggered animations and editorial typography.",
    path: "templates/finex-finance.html"
  },
  {
    name: "Finex Gaming",
    description: "Internet performance optimizer with ultra-dark theme, radial glows, and gaming-tech aesthetics.",
    path: "templates/finex-gaming.html"
  },
  {
    name: "Fluxer SaaS",
    description: "Website builder platform with dark mode, interactive pricing plans, and orange accent energy.",
    path: "templates/fluxer-saas.html"
  },
  {
    name: "Ledger Pay",
    description: "Monetization infrastructure SaaS with 3D rotations, marquee animations, and professional finance UI.",
    path: "templates/ledger-saas.html"
  },
  {
    name: "Ledgerly AI",
    description: "AI-powered social growth tool with warm beige aesthetics, grid overlays, and premium elegant styling.",
    path: "templates/ledgerly.html"
  },
  {
    name: "Luminal Studio",
    description: "Creative digital agency with massive hero typography, beam-drop animations, and dark interactive elements.",
    path: "templates/luminal.html"
  },
  {
    name: "Mindful Zen",
    description: "Wellness and meditation platform with calming colors, fog effects, and serene glassmorphism cards.",
    path: "templates/mindful.html"
  },
  {
    name: "X.Studio",
    description: "Dark-mode design studio portfolio with blue-purple palette, hover animations, and staggered reveals.",
    path: "templates/portfolio-2.html"
  },
  {
    name: "DevForge",
    description: "Frontend engineer portfolio with ultra-dark theme, glass panels, monospace accents, and blur-reveal animations.",
    path: "templates/portfolio.html"
  },
  {
    name: "Prism SaaS",
    description: "Modern SaaS landing page with light theme, 3D rotations, data visualization, and clean professional layout.",
    path: "templates/prism-saas.html"
  }
];
