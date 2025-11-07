# UI Development Workflow with Flare

**Handoff Document for Claude Code Instance B**

This document provides a complete workflow for building the Fabstir LLM SDK user interface with professional design and "flare" (animations, polish, visual appeal).

---

## Project Context

You are building the **user interface** for the Fabstir LLM SDK - a decentralized AI marketplace with session groups (like Claude Projects), vector databases, and chat sessions.

**Separation of Concerns:**
- **Claude Code Instance A** (original): Implements the real SDK backend (`@fabstir/sdk-core`)
- **Claude Code Instance B** (you): Builds the UI using mock SDK

**Key Principle:** Build the UI with a mock SDK first, iterate until it's perfect, then swap to the real SDK with a single import change.

---

## Prerequisites

### 1. MCP Servers Required

You must have these MCP servers installed:

**shadcn/ui MCP** - Install shadcn components
```json
{
  "mcpServers": {
    "shadcn": {
      "command": "npx",
      "args": ["@shadcn/mcp@latest"]
    }
  }
}
```

**Playwright MCP** - Take screenshots and see visual output
```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@latest"]
    }
  }
}
```

**Puppeteer MCP** - Alternative browser automation (optional, but helpful)
```json
{
  "mcpServers": {
    "puppeteer": {
      "command": "npx",
      "args": ["@automatalabs/mcp-server-puppeteer"]
    }
  }
}
```

**Verify MCPs are working:**
```bash
# List available MCP tools
claude mcp list
```

You should see tools like:
- `shadcn_install_component`
- `playwright_navigate`
- `playwright_screenshot`
- `puppeteer_navigate`
- `puppeteer_screenshot`

---

### 2. Reference Documents

You will need these documents from the original project:

**docs/UI_MOCKUPS.md** - Complete ASCII mockups of all 10 pages
- Home Dashboard
- Vector Database Management
- Session Groups List
- Session Group Detail
- Active Chat Session
- Sharing & Permissions
- Notification Center
- Mobile Views
- Quick Actions Panel
- Settings Page

**docs/SDK_MOCK.md** - Complete mock SDK specification
- All manager interfaces
- Mock implementation patterns
- localStorage persistence
- Predefined fixtures
- Usage examples

**docs/IMPLEMENTATION_RAG.md** (optional) - Context on Phase 11 (Session Groups)
- Full technical specification
- Architecture diagrams
- Feature requirements

---

### 3. Brand Assets from User

Request these from the user **before starting**:

**Logo Files (Required):**
```
- logo-light.svg  (for light mode)
- logo-dark.svg   (for dark mode)
- logo-icon.svg   (favicon, small spaces)
```

**Color Palette (Required):**
```json
{
  "light": {
    "primary": "#0ea5e9",      // Main brand color
    "primaryDark": "#0369a1",  // Hover/active states
    "background": "#ffffff",
    "foreground": "#0f172a",
    "accent": "#f1f5f9"
  },
  "dark": {
    "primary": "#38bdf8",      // Lighter for dark mode
    "primaryDark": "#0ea5e9",
    "background": "#0f172a",
    "foreground": "#f8fafc",
    "accent": "#1e293b"
  }
}
```

**Design Direction (Required):**
Ask user to choose:
- **A) Corporate Professional** (Stripe, Linear, Notion vibe)
- **B) Modern/Playful** (Raycast, Vercel, Framer vibe)
- **C) Technical/Minimal** (GitHub, VS Code, Supabase vibe)
- **D) Premium/Luxe** (Apple, premium feeling)

Or: "Make it look like [Company X URL]"

**Animation Intensity (Required):**
Ask user to choose 1-5:
- **1** = Minimal (just fade-ins)
- **2** = Subtle (fade-ins + slight hover)
- **3** = Balanced (recommended - smooth transitions, hover effects)
- **4** = Bold (prominent animations, spring physics)
- **5** = Playful (lots of movement, bouncy)

**Typography (Optional):**
- Headings font: "Inter", "Poppins", "Montserrat", etc.
- Body font: "Inter", "System UI", "SF Pro", etc.

---

## Project Structure

Create a new Next.js project for the UI:

```
fabstir-ui/                          # New project (separate from SDK)
├── app/
│   ├── layout.tsx
│   ├── page.tsx                     # Home Dashboard
│   ├── vector-databases/
│   │   ├── page.tsx                 # Vector DB list
│   │   └── [id]/page.tsx            # Vector DB detail
│   ├── session-groups/
│   │   ├── page.tsx                 # Session groups list
│   │   └── [id]/page.tsx            # Session group detail
│   └── settings/page.tsx
├── components/
│   ├── ui/                          # shadcn components (auto-generated)
│   ├── session-groups/
│   │   ├── SessionGroupCard.tsx
│   │   ├── SessionGroupList.tsx
│   │   ├── ChatSessionList.tsx
│   │   └── DatabaseLinker.tsx
│   ├── vector-databases/
│   │   ├── DatabaseCard.tsx
│   │   ├── FolderTree.tsx
│   │   └── FileUploader.tsx
│   └── chat/
│       ├── MessageBubble.tsx
│       ├── ChatInput.tsx
│       └── RAGSourcesPanel.tsx
├── lib/
│   ├── sdk.ts                       # Mock SDK initialization
│   └── utils.ts
├── hooks/
│   ├── useMockSessionGroups.ts
│   ├── useMockVectorDatabases.ts
│   └── useMockChat.ts
├── public/
│   ├── logo-light.svg               # User provides
│   ├── logo-dark.svg                # User provides
│   └── logo-icon.svg                # User provides
├── styles/
│   └── globals.css
├── tailwind.config.ts               # Custom theme with brand colors
├── package.json
└── README.md
```

---

## Workflow: Step-by-Step

### Phase 1: Project Setup (Day 1, Morning)

#### Step 1.1: Initialize Next.js Project

```bash
npx create-next-app@latest fabstir-ui \
  --typescript \
  --tailwind \
  --app \
  --no-src-dir

cd fabstir-ui
```

#### Step 1.2: Install Dependencies

```bash
# Core dependencies
pnpm add framer-motion lucide-react class-variance-authority clsx tailwind-merge

# shadcn/ui (will be initialized in next step)
```

#### Step 1.3: Initialize shadcn/ui

**Using shadcn/ui MCP:**
```
"Initialize shadcn/ui with default configuration using the MCP"
```

This will:
- Create `components/ui/` directory
- Configure `components.json`
- Set up utility functions

**Manual alternative (if MCP doesn't work):**
```bash
npx shadcn-ui@latest init
```

#### Step 1.4: Configure Custom Theme

Edit `tailwind.config.ts`:

```typescript
import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          50: '#f0f9ff',
          100: '#e0f2fe',
          200: '#bae6fd',
          300: '#7dd3fc',
          400: '#38bdf8',
          500: '#0ea5e9',  // User's brand color
          600: '#0284c7',
          700: '#0369a1',  // User's brand dark
          800: '#075985',
          900: '#0c4a6e',
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        // ... rest of color config
      },
      animation: {
        'slide-in': 'slideIn 0.3s ease-out',
        'fade-in': 'fadeIn 0.2s ease-out',
        'scale-in': 'scaleIn 0.2s ease-out',
      },
      keyframes: {
        slideIn: {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        scaleIn: {
          '0%': { transform: 'scale(0.95)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
```

Update `app/globals.css` with brand colors:

```css
@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --primary: 199 89% 48%;        /* User's primary color */
    --primary-foreground: 210 40% 98%;
    /* ... rest of CSS variables */
  }

  .dark {
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;
    --primary: 199 89% 68%;        /* Lighter for dark mode */
    --primary-foreground: 222.2 47.4% 11.2%;
    /* ... rest of CSS variables */
  }
}
```

#### Step 1.5: Install shadcn Components

**Using shadcn/ui MCP:**
```
"Install the following shadcn components: card, button, badge, dialog, dropdown-menu, separator, avatar, tooltip, tabs, input, label, textarea, command, popover"
```

**Manual alternative:**
```bash
npx shadcn-ui@latest add card button badge dialog dropdown-menu separator avatar tooltip tabs input label textarea command popover
```

#### Step 1.6: Implement Mock SDK

Create the mock SDK package following `docs/SDK_MOCK.md`.

**Quick Start (copy skeleton):**

```typescript
// lib/sdk.ts

import { FabstirSDKCoreMock } from './mock-sdk/FabstirSDKCoreMock';

export const sdk = new FabstirSDKCoreMock({
  mode: 'production' as const,
  chainId: 84532,
});

let initialized = false;

export async function initializeSDK() {
  if (initialized) return sdk;

  await sdk.authenticate('mock', {
    privateKey: '0xMOCK_PRIVATE_KEY'
  });

  initialized = true;
  console.log('[UI] Mock SDK initialized');

  return sdk;
}

// Convenience exports
export async function getSessionGroupManager() {
  await initializeSDK();
  return sdk.getSessionGroupManager();
}

export async function getVectorRAGManager() {
  await initializeSDK();
  return sdk.getVectorRAGManager();
}

export async function getSessionManager() {
  await initializeSDK();
  return sdk.getSessionManager();
}
```

Create mock SDK classes according to `docs/SDK_MOCK.md` interfaces.

**Time estimate:** 2-3 hours

---

### Phase 2: First Component with Visual Feedback (Day 1, Afternoon)

#### Step 2.1: Generate SessionGroupCard Component

Reference `docs/UI_MOCKUPS.md` Section 3 (Session Groups List).

**Create the component:**

```typescript
// components/session-groups/SessionGroupCard.tsx

'use client';

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { motion } from 'framer-motion';
import Image from 'next/image';
import type { SessionGroup } from '@/lib/mock-sdk/types';

interface SessionGroupCardProps {
  group: SessionGroup;
  onClick?: () => void;
}

export function SessionGroupCard({ group, onClick }: SessionGroupCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{
        y: -4,
        transition: { duration: 0.2 }
      }}
      className="h-full"
    >
      <Card
        className="group cursor-pointer overflow-hidden border-primary-200 dark:border-primary-900 hover:shadow-2xl hover:shadow-primary-500/20 transition-all duration-300 h-full"
        onClick={onClick}
      >
        {/* Branded gradient header */}
        <div className="h-24 bg-gradient-to-br from-primary-500 to-primary-700 relative">
          <div className="absolute top-3 right-3">
            <Image
              src="/logo-icon.svg"
              width={32}
              height={32}
              alt="Logo"
              className="opacity-90"
            />
          </div>
        </div>

        <CardHeader className="-mt-8 relative z-10">
          <div className="w-16 h-16 rounded-xl bg-white dark:bg-slate-900 shadow-xl flex items-center justify-center mb-3 ring-4 ring-white dark:ring-slate-800">
            <span className="text-3xl">🗂️</span>
          </div>

          <CardTitle className="text-xl font-semibold group-hover:text-primary-600 transition-colors line-clamp-1">
            {group.name}
          </CardTitle>

          {group.owner !== '0x1234567890ABCDEF1234567890ABCDEF12345678' && (
            <p className="text-xs text-muted-foreground mt-1">
              👤 Shared by {group.owner.substring(0, 10)}...
            </p>
          )}
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Stats badges */}
          <div className="flex gap-2 flex-wrap">
            <Badge variant="secondary" className="font-medium">
              💬 {group.chatSessions.length} chats
            </Badge>
            <Badge variant="outline" className="font-medium">
              📚 {group.databases.length} databases
            </Badge>
          </div>

          {/* Last message preview */}
          {group.chatSessions.length > 0 && (
            <p className="text-sm text-muted-foreground line-clamp-2">
              {group.chatSessions[0].lastMessage || 'No messages yet'}
            </p>
          )}

          {/* Footer with timestamp and action hint */}
          <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t">
            <span>
              {new Date(group.updated).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric'
              })}
            </span>
            <span className="text-primary-600 font-medium group-hover:translate-x-1 transition-transform">
              Open →
            </span>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
```

#### Step 2.2: Create Test Page

```typescript
// app/test-card/page.tsx

'use client';

import { SessionGroupCard } from '@/components/session-groups/SessionGroupCard';
import { useEffect, useState } from 'react';
import { getSessionGroupManager } from '@/lib/sdk';
import type { SessionGroup } from '@/lib/mock-sdk/types';

export default function TestCardPage() {
  const [groups, setGroups] = useState<SessionGroup[]>([]);

  useEffect(() => {
    async function loadGroups() {
      const manager = await getSessionGroupManager();
      const data = await manager.listSessionGroups();
      setGroups(data);
    }

    loadGroups();
  }, []);

  return (
    <div className="min-h-screen bg-background p-8">
      <h1 className="text-3xl font-bold mb-8">Session Group Cards Test</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {groups.map((group) => (
          <SessionGroupCard
            key={group.id}
            group={group}
            onClick={() => console.log('Clicked:', group.name)}
          />
        ))}
      </div>
    </div>
  );
}
```

#### Step 2.3: Visual Feedback with Playwright

**Start dev server:**
```bash
pnpm dev
```

**Take screenshot using Playwright MCP:**
```
"Navigate to http://localhost:3000/test-card and take a screenshot"
```

**Playwright will execute:**
1. Open browser
2. Navigate to page
3. Wait for content
4. Take screenshot
5. Return image to you

**Analyze the screenshot:**
- Does it match the mockup?
- Are colors correct?
- Is spacing good?
- Do animations feel smooth? (test manually)
- Does hover effect work?

**Iterate if needed:**
- Adjust colors: "The primary color looks too bright, reduce saturation by 10%"
- Fix spacing: "Add more padding between badges"
- Improve shadows: "Make the hover shadow more subtle"

**Repeat screenshot → analyze → adjust until perfect.**

**Time estimate:** 1-2 hours

---

### Phase 3: Complete All Pages (Days 2-4)

Repeat the workflow from Phase 2 for each page:

1. **Reference docs/UI_MOCKUPS.md** for that page
2. **Generate components** based on mockup
3. **Create test page** with mock SDK data
4. **Take screenshot** with Playwright
5. **Analyze and iterate** until perfect
6. **Move to next page**

**Page Order (suggested):**

**Day 2:**
1. Home Dashboard (Section 1)
2. Session Groups List (Section 3)
3. Vector Database Management (Section 2)

**Day 3:**
4. Session Group Detail (Section 4)
5. Active Chat Session (Section 5)

**Day 4:**
6. Sharing & Permissions (Section 6)
7. Notification Center (Section 7)
8. Settings Page (Section 10)

**Day 5:**
9. Mobile Views (Section 8)
10. Quick Actions Panel (Section 9)

---

### Phase 4: Animation & Polish (Day 5)

#### Animation Patterns Based on User's Intensity Choice

**Level 1 (Minimal):**
```typescript
// Just fade-ins
<motion.div
  initial={{ opacity: 0 }}
  animate={{ opacity: 1 }}
>
  {content}
</motion.div>
```

**Level 2 (Subtle):**
```typescript
// Fade + slight lift on hover
<motion.div
  initial={{ opacity: 0, y: 10 }}
  animate={{ opacity: 1, y: 0 }}
  whileHover={{ y: -2 }}
>
  {content}
</motion.div>
```

**Level 3 (Balanced) - RECOMMENDED:**
```typescript
// Smooth transitions + hover effects + stagger
<div className="grid grid-cols-3 gap-6">
  {items.map((item, i) => (
    <motion.div
      key={item.id}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: i * 0.1 }}
      whileHover={{
        y: -4,
        transition: { duration: 0.2 }
      }}
    >
      <Card className="group hover:shadow-2xl transition-all duration-300">
        {/* Content */}
      </Card>
    </motion.div>
  ))}
</div>
```

**Level 4 (Bold):**
```typescript
// Spring physics + prominent animations
<motion.div
  initial={{ opacity: 0, scale: 0.8 }}
  animate={{ opacity: 1, scale: 1 }}
  transition={{ type: 'spring', stiffness: 200 }}
  whileHover={{
    scale: 1.05,
    rotate: 2,
    transition: { type: 'spring' }
  }}
>
  {content}
</motion.div>
```

**Level 5 (Playful):**
```typescript
// Bouncy + lots of movement
<motion.div
  initial={{ opacity: 0, y: -50, rotate: -10 }}
  animate={{ opacity: 1, y: 0, rotate: 0 }}
  transition={{
    type: 'spring',
    stiffness: 100,
    damping: 8
  }}
  whileHover={{
    scale: 1.1,
    rotate: 5,
    y: -10
  }}
  whileTap={{ scale: 0.95 }}
>
  {content}
</motion.div>
```

#### Page Transitions

```typescript
// app/layout.tsx

'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { usePathname } from 'next/navigation';

export default function RootLayout({ children }) {
  const pathname = usePathname();

  return (
    <html>
      <body>
        <AnimatePresence mode="wait">
          <motion.div
            key={pathname}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </body>
    </html>
  );
}
```

#### Loading States

```typescript
// components/ui/skeleton-card.tsx

export function SkeletonCard() {
  return (
    <Card>
      <CardHeader>
        <div className="w-16 h-16 bg-gray-200 dark:bg-gray-800 rounded-xl animate-pulse" />
        <div className="h-6 bg-gray-200 dark:bg-gray-800 rounded animate-pulse mt-4" />
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded animate-pulse" />
        <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded animate-pulse w-2/3" />
      </CardContent>
    </Card>
  );
}
```

#### Empty States

```typescript
// components/empty-state.tsx

import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';

interface EmptyStateProps {
  icon: string;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center justify-center py-16 px-4"
    >
      <div className="text-6xl mb-4 opacity-50">{icon}</div>
      <h3 className="text-xl font-semibold mb-2">{title}</h3>
      <p className="text-muted-foreground text-center max-w-md mb-6">
        {description}
      </p>
      {action && (
        <Button onClick={action.onClick} size="lg">
          {action.label}
        </Button>
      )}
    </motion.div>
  );
}

// Usage
<EmptyState
  icon="🗂️"
  title="No session groups yet"
  description="Create your first session group to organize your conversations and vector databases."
  action={{
    label: "Create Session Group",
    onClick: () => setShowCreateDialog(true)
  }}
/>
```

---

### Phase 5: Responsive Design (Day 6)

Test on different screen sizes using Playwright:

**Desktop (1920x1080):**
```
"Resize browser to 1920x1080 and take screenshot"
```

**Tablet (768x1024):**
```
"Resize browser to 768x1024 and take screenshot"
```

**Mobile (375x667):**
```
"Resize browser to 375x667 and take screenshot"
```

**Adjust breakpoints:**

```typescript
// tailwind.config.ts breakpoints (already configured)
{
  screens: {
    'sm': '640px',
    'md': '768px',
    'lg': '1024px',
    'xl': '1280px',
    '2xl': '1536px',
  }
}

// Responsive layout example
<div className="
  grid
  grid-cols-1       // Mobile: 1 column
  md:grid-cols-2    // Tablet: 2 columns
  lg:grid-cols-3    // Desktop: 3 columns
  gap-4 md:gap-6    // Larger gap on desktop
">
  {items.map(item => <Card key={item.id} />)}
</div>
```

---

## Design Principles for "Flare"

### 1. Elevation & Shadows

**Bad (flat, boring):**
```css
.card {
  border: 1px solid #e5e7eb;
}
```

**Good (elevated, depth):**
```css
.card {
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
  transition: box-shadow 0.3s;
}

.card:hover {
  box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1),
              0 10px 10px -5px rgba(0,0,0,0.04);
}
```

### 2. Gradients

**Use gradients for headers, backgrounds, or accents:**

```tsx
<div className="bg-gradient-to-br from-primary-500 to-primary-700">
  {/* Header content */}
</div>

// Subtle background gradient
<div className="bg-gradient-to-b from-background to-accent/20">
  {/* Page content */}
</div>
```

### 3. Spacing & Breathing Room

**Bad (cramped):**
```tsx
<div className="p-2 space-y-1">
```

**Good (generous):**
```tsx
<div className="p-6 space-y-4 md:p-8 md:space-y-6">
```

### 4. Typography Hierarchy

```tsx
<div>
  <h1 className="text-4xl font-bold mb-2">Main Title</h1>
  <p className="text-xl text-muted-foreground mb-8">Subtitle</p>

  <h2 className="text-2xl font-semibold mb-4">Section Title</h2>
  <p className="text-base text-foreground">Body text</p>

  <p className="text-sm text-muted-foreground mt-2">Caption</p>
</div>
```

### 5. Micro-interactions

```tsx
// Button press feedback
<Button className="active:scale-95 transition-transform">
  Click me
</Button>

// Icon rotation on hover
<motion.div
  whileHover={{ rotate: 10 }}
  transition={{ type: 'spring' }}
>
  ⚙️
</motion.div>

// Badge pulse animation
<Badge className="animate-pulse">
  New
</Badge>
```

### 6. Color Usage

**Primary:** Brand actions (buttons, links)
**Secondary:** Supporting elements (badges, tags)
**Accent:** Backgrounds, subtle highlights
**Muted:** Secondary text, disabled states

```tsx
<Button variant="default">Primary Action</Button>
<Button variant="secondary">Secondary Action</Button>
<Button variant="outline">Tertiary Action</Button>
<Button variant="ghost">Subtle Action</Button>
```

---

## Visual Feedback Loop with Playwright

### Automated Screenshot Workflow

Create a script to capture all pages:

```typescript
// scripts/capture-pages.ts

const pages = [
  { path: '/', name: 'home' },
  { path: '/session-groups', name: 'session-groups-list' },
  { path: '/session-groups/group-engineering-001', name: 'session-group-detail' },
  { path: '/vector-databases', name: 'vector-databases-list' },
  { path: '/settings', name: 'settings' },
];

for (const page of pages) {
  // Using Playwright MCP
  console.log(`Capturing ${page.name}...`);
  // Take screenshot via MCP
}
```

**Ask Playwright MCP:**
```
"Navigate to http://localhost:3000 and take screenshots of these pages: /, /session-groups, /session-groups/group-engineering-001, /vector-databases, /settings. Save each screenshot with descriptive names."
```

### Compare Screenshots to Mockups

1. **Take screenshot** of implemented page
2. **Open docs/UI_MOCKUPS.md** ASCII version
3. **Compare visually:**
   - Layout matches?
   - Colors correct?
   - Spacing feels right?
   - Animations smooth? (manual test)

4. **Iterate if needed**
5. **Take new screenshot**
6. **Repeat until perfect**

---

## Timeline & Deliverables

### Day 1: Setup + First Component
- ✅ Project initialized
- ✅ shadcn/ui installed
- ✅ Custom theme configured
- ✅ Mock SDK implemented
- ✅ First component (SessionGroupCard) with visual feedback

### Day 2-4: Core Pages
- ✅ All 10 pages generated
- ✅ Mock SDK integrated
- ✅ Components tested with screenshots
- ✅ Basic responsive design

### Day 5: Animation & Polish
- ✅ Animations implemented (based on user's intensity)
- ✅ Page transitions
- ✅ Loading states
- ✅ Empty states
- ✅ Micro-interactions

### Day 6: Responsive & Final QA
- ✅ Mobile layouts tested
- ✅ Tablet layouts tested
- ✅ Desktop layouts tested
- ✅ All screenshots captured
- ✅ Final visual QA

### Day 7: Documentation & Handoff
- ✅ Component documentation
- ✅ Integration guide for real SDK
- ✅ Screenshot gallery
- ✅ Known issues list

---

## Deliverables

### 1. Working UI Application

```
fabstir-ui/
├── All 10 pages implemented
├── All components with animations
├── Mock SDK fully integrated
├── Responsive on mobile/tablet/desktop
└── Ready for real SDK swap
```

### 2. Screenshot Gallery

```
screenshots/
├── 01-home-desktop.png
├── 02-home-mobile.png
├── 03-session-groups-list.png
├── 04-session-group-detail.png
├── 05-active-chat.png
├── 06-vector-databases.png
├── 07-sharing-permissions.png
├── 08-notifications.png
├── 09-settings.png
└── 10-mobile-views.png
```

### 3. Integration Guide

Document how to swap mock SDK to real SDK:

```markdown
# Integration Guide

## Swap Mock SDK to Real SDK

1. Update package.json dependency:
   - Remove: `@fabstir/sdk-core-mock`
   - Add: `@fabstir/sdk-core`

2. Update lib/sdk.ts import:
   ```typescript
   // Change from:
   import { FabstirSDKCoreMock as FabstirSDKCore } from '@fabstir/sdk-core-mock';

   // To:
   import { FabstirSDKCore } from '@fabstir/sdk-core';
   ```

3. Update authentication:
   ```typescript
   // Real SDK needs actual wallet
   await sdk.authenticate('wallet', {
     privateKey: userPrivateKey
   });
   ```

4. Test each page and add error handling for:
   - Blockchain transaction delays
   - WebSocket connection failures
   - S5 storage errors

That's it! UI stays the same.
```

---

## Common Issues & Solutions

### Issue 1: shadcn/ui MCP not installing components

**Solution:** Install manually:
```bash
npx shadcn-ui@latest add [component-name]
```

### Issue 2: Playwright can't see localhost

**Solution:** Ensure dev server is running:
```bash
pnpm dev
# Then use Playwright MCP
```

### Issue 3: Animations feel laggy

**Solution:** Reduce animation complexity:
```typescript
// Instead of spring physics
transition={{ type: 'spring', stiffness: 200 }}

// Use simpler easing
transition={{ duration: 0.2, ease: 'easeOut' }}
```

### Issue 4: Colors don't match brand

**Solution:** Update CSS variables in `globals.css`:
```css
:root {
  --primary: [YOUR HUE] [YOUR SATURATION]% [YOUR LIGHTNESS]%;
}
```

Use HSL color picker to convert hex to HSL.

---

## Success Criteria

**Before declaring "done", ensure:**

- [ ] All 10 pages from UI_MOCKUPS.md implemented
- [ ] Mock SDK working (localStorage persists data)
- [ ] Screenshots match mockups (layout, colors, spacing)
- [ ] Animations feel smooth (test on real device)
- [ ] Responsive on mobile/tablet/desktop
- [ ] Loading states implemented
- [ ] Empty states implemented
- [ ] Error states implemented
- [ ] Logo displayed correctly (light/dark mode)
- [ ] Brand colors consistent throughout
- [ ] Typography hierarchy clear
- [ ] Hover effects work
- [ ] Page transitions smooth
- [ ] All components documented
- [ ] Integration guide written
- [ ] Ready for real SDK swap

---

## Handoff Back to Original Project

When UI is complete, provide:

1. **Complete codebase** (`fabstir-ui/` directory)
2. **Screenshot gallery** showing all pages
3. **Integration guide** (how to swap to real SDK)
4. **Component documentation**
5. **Known issues list** (if any)

Original Claude Code instance will then:
- Review UI
- Test with real SDK
- Fix integration issues
- Deploy to production

---

## Questions to Ask User Before Starting

1. **Brand Assets:**
   - "Please provide logo-light.svg, logo-dark.svg, logo-icon.svg"
   - "What is your primary brand color? (hex code)"

2. **Design Direction:**
   - "Which design vibe do you prefer? A) Corporate Professional, B) Modern/Playful, C) Technical/Minimal, D) Premium/Luxe"
   - "Or provide a URL: 'Make it look like [company.com]'"

3. **Animation Intensity:**
   - "Animation level 1-5? (3 recommended)"

4. **Additional Preferences:**
   - "Any specific fonts? (default: Inter)"
   - "Any features from UI_MOCKUPS.md to skip?"
   - "Any additional pages not in mockups?"

---

## Summary

**Your Mission:**
Build a beautiful, professional UI with "flare" (animations, polish, visual appeal) using the mock SDK, iterate with visual feedback via Playwright, and deliver a production-ready UI that can swap to the real SDK with one import change.

**Your Tools:**
- shadcn/ui MCP (install components)
- Playwright MCP (visual feedback)
- docs/UI_MOCKUPS.md (design reference)
- docs/SDK_MOCK.md (backend interface)
- Framer Motion (animations)
- Tailwind CSS (styling)

**Your Output:**
- 10 polished pages
- Smooth animations
- Responsive design
- Screenshot gallery
- Integration guide

**Success = Original Claude Code can swap the import and everything just works!**

Good luck! 🚀
