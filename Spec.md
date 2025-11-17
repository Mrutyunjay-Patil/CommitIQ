# CommitIQ: AI Code Review Collab Studio - Hackathon Project Specification

## 📋 Executive Summary

**Project Name:** CommitIQ - AI Code Review Collab Studio  
**Hackathon:** TanStack Start Hackathon (Deadline: Nov 17, 2025, 12 PM PT)  
**Value Proposition:** Real-time collaborative code review platform with AI assistance that compresses days of async PR review into focused 15-minute live sessions.

**Sponsor Technologies Used:**
- ✅ TanStack Start (SSR, routing, server functions)
- ✅ Convex (real-time database, presence, live sync)
- ✅ CodeRabbit (AI code review analysis)
- ✅ Firecrawl (documentation/context scraping)
- ✅ Autumn (usage-based pricing/billing)
- ✅ Netlify (deployment platform)

---

## 🎯 Core Problem & Solution

### Problem
- Traditional PR reviews take 2-3 days of async back-and-forth
- Context switching between GitHub, IDE, Slack, and docs
- Junior developers wait hours for answers
- CodeRabbit gives static comments without real interaction
- No way to quickly resolve "why did you do this?" questions

### Solution
A real-time collaborative workspace where teams review code together with AI as an active participant:
- Live cursors showing who's reviewing what (Convex)
- Streaming AI suggestions as you scroll (TanStack Start + OpenAI)
- Instant Q&A resolution in shared workspace
- Context panel auto-loading relevant docs (Firecrawl)
- Usage tracking and billing (Autumn)

---

## 🏗️ Technical Architecture

### Stack Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (React)                          │
│  TanStack Start + TanStack Router + React 19                │
└─────────────────────────────────────────────────────────────┘
                           ↕
┌─────────────────────────────────────────────────────────────┐
│              Real-time Backend (Convex)                      │
│  - User presence & cursors                                   │
│  - PR data storage                                           │
│  - Comments & chat                                           │
│  - Real-time subscriptions                                   │
└─────────────────────────────────────────────────────────────┘
                           ↕
┌──────────────┬──────────────┬──────────────┬───────────────┐
│   GitHub     │  CodeRabbit  │  Firecrawl   │    Autumn     │
│   API        │   AI Review  │  Doc Scraper │   Billing     │
└──────────────┴──────────────┴──────────────┴───────────────┘
                           ↕
┌─────────────────────────────────────────────────────────────┐
│                  Deployment (Netlify)                        │
│  - Edge functions                                            │
│  - Global CDN                                                │
│  - Instant preview URLs                                      │
└─────────────────────────────────────────────────────────────┘
```

---

## 📦 Technology Integration Details

### 1. TanStack Start Setup

**Installation:**
```bash
npm create @tanstack/start@latest
# Choose options:
# - TypeScript: Yes
# - Routing: File-based
# - Styling: Tailwind CSS
```

**Key Features to Use:**
- **Server Functions** for GitHub API calls
- **SSR** for fast initial load and SEO
- **Streaming** for AI response chunks
- **Type-safe routing** with params validation

**Critical Files:**
```
app/
├── routes/
│   ├── __root.tsx          # Root layout with providers
│   ├── index.tsx           # Dashboard (list PRs)
│   ├── review/
│   │   └── $prId.tsx       # Main review room
│   └── api/
│       └── github/
│           └── webhook.ts  # GitHub webhook handler
├── server/
│   ├── github.ts           # GitHub API server functions
│   └── ai.ts               # OpenAI streaming functions
└── convex/
    ├── schema.ts
    ├── prs.ts
    ├── cursors.ts
    └── comments.ts
```

**vite.config.ts:**
```typescript
import { defineConfig } from 'vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import react from '@vitejs/plugin-react';
import netlify from '@netlify/vite-plugin-tanstack-start';

export default defineConfig({
  plugins: [
    react(),
    tanstackStart(),
    netlify()
  ]
});
```

**Server Function Example (Streaming AI):**
```typescript
// server/ai.ts
import { createServerFn } from '@tanstack/start';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export const analyzeCodeFn = createServerFn({ method: 'POST' })
  .validator((data: { code: string }) => data)
  .handler(async ({ data }) => {
    const stream = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [{
        role: 'user',
        content: `Review this code:\n\n${data.code}`
      }],
      stream: true
    });
    
    async function* generate() {
      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content;
        if (content) yield content;
      }
    }
    
    return generate();
  });
```

---

### 2. Convex Integration

**Installation:**
```bash
npm install convex @convex-dev/react-query @tanstack/react-router-with-query
npx convex dev
```

**Setup app/router.tsx:**
```typescript
import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { QueryClient } from "@tanstack/react-query";
import { routerWithQueryClient } from "@tanstack/react-router-with-query";
import { ConvexQueryClient } from "@convex-dev/react-query";
import { ConvexProvider } from "convex/react";
import { routeTree } from "./routeTree.gen";

export function createRouter() {
  const CONVEX_URL = import.meta.env.VITE_CONVEX_URL!;
  
  const convexQueryClient = new ConvexQueryClient(CONVEX_URL);
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        queryKeyHashFn: convexQueryClient.hashFn(),
        queryFn: convexQueryClient.queryFn(),
      },
    },
  });
  
  convexQueryClient.connect(queryClient);
  
  const router = routerWithQueryClient(
    createTanStackRouter({
      routeTree,
      defaultPreload: "intent",
      context: { queryClient },
      Wrap: ({ children }) => (
        <ConvexProvider client={convexQueryClient.convexClient}>
          {children}
        </ConvexProvider>
      ),
    }),
    queryClient,
  );
  
  return router;
}
```

**Convex Schema (convex/schema.ts):**
```typescript
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  prs: defineTable({
    prNumber: v.number(),
    repo: v.string(),
    owner: v.string(),
    title: v.string(),
    author: v.string(),
    baseBranch: v.string(),
    headBranch: v.string(),
    htmlUrl: v.string(),
    files: v.array(v.object({
      path: v.string(),
      content: v.string(),
      previousContent: v.string(),
      patch: v.string(),
      status: v.string(),
      additions: v.number(),
      deletions: v.number(),
      language: v.string()
    })),
    status: v.string(),
    createdAt: v.number()
  }).index("by_repo", ["repo"]),
  
  cursors: defineTable({
    prId: v.id("prs"),
    userId: v.string(),
    userName: v.string(),
    line: v.number(),
    color: v.string(),
    fileIndex: v.number(),
    lastUpdated: v.number()
  }).index("by_pr", ["prId"]),
  
  comments: defineTable({
    prId: v.id("prs"),
    line: v.number(),
    fileIndex: v.number(),
    userId: v.string(),
    userName: v.string(),
    text: v.string(),
    timestamp: v.number(),
    resolved: v.boolean()
  }).index("by_pr_file", ["prId", "fileIndex"]),
  
  chat: defineTable({
    prId: v.id("prs"),
    userId: v.string(),
    userName: v.string(),
    message: v.string(),
    timestamp: v.number()
  }).index("by_pr", ["prId"]),
  
  aiSuggestions: defineTable({
    prId: v.id("prs"),
    fileIndex: v.number(),
    line: v.number(),
    suggestion: v.string(),
    severity: v.string(), // "error", "warning", "info"
    timestamp: v.number()
  }).index("by_pr_file", ["prId", "fileIndex"])
});
```

**Real-time Cursor Mutation:**
```typescript
// convex/cursors.ts
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const update = mutation({
  args: { 
    prId: v.id("prs"), 
    line: v.number(),
    fileIndex: v.number()
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    
    const existing = await ctx.db
      .query("cursors")
      .withIndex("by_pr", (q) => q.eq("prId", args.prId))
      .filter((q) => q.eq(q.field("userId"), identity.subject))
      .first();
    
    if (existing) {
      await ctx.db.patch(existing._id, { 
        line: args.line,
        fileIndex: args.fileIndex,
        lastUpdated: Date.now()
      });
    } else {
      await ctx.db.insert("cursors", {
        prId: args.prId,
        userId: identity.subject,
        userName: identity.name!,
        line: args.line,
        fileIndex: args.fileIndex,
        color: generateUserColor(identity.subject),
        lastUpdated: Date.now()
      });
    }
  }
});

export const list = query({
  args: { prId: v.id("prs") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("cursors")
      .withIndex("by_pr", (q) => q.eq("prId", args.prId))
      .collect();
  }
});

function generateUserColor(userId: string): string {
  const colors = [
    "#3B82F6", "#EF4444", "#10B981", "#F59E0B", 
    "#8B5CF6", "#EC4899", "#14B8A6", "#F97316"
  ];
  const hash = userId.split('').reduce((acc, char) => 
    acc + char.charCodeAt(0), 0
  );
  return colors[hash % colors.length];
}
```

**Using Convex in Components:**
```typescript
import { useQuery, useMutation } from "convex/react";
import { api } from "../convex/_generated/api";

function ReviewRoom({ prId }: { prId: string }) {
  const pr = useQuery(api.prs.get, { prId: prId as any });
  const cursors = useQuery(api.cursors.list, { prId: prId as any });
  const updateCursor = useMutation(api.cursors.update);
  
  const handleMouseMove = (e: React.MouseEvent) => {
    const line = Math.floor(e.clientY / 24);
    updateCursor({ prId: prId as any, line, fileIndex: 0 });
  };
  
  return (
    <div onMouseMove={handleMouseMove}>
      {/* Your code viewer */}
      {cursors?.map(cursor => (
        <Cursor key={cursor.userId} {...cursor} />
      ))}
    </div>
  );
}
```

---

### 3. CodeRabbit Integration

**Note:** CodeRabbit primarily works via GitHub integration. For the hackathon, we'll use their API indirectly by:
1. Setting up CodeRabbit on your GitHub repo
2. Fetching CodeRabbit's analysis from PR comments via GitHub API
3. Displaying them in the review interface

**Alternative - Direct API (if available):**
```typescript
// server/coderabbit.ts
import { createServerFn } from '@tanstack/start';

export const getCodeRabbitAnalysis = createServerFn({ method: 'POST' })
  .validator((data: { prUrl: string }) => data)
  .handler(async ({ data }) => {
    // CodeRabbit analysis typically appears as PR comments
    // Fetch via GitHub API or CodeRabbit webhook
    
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}/comments`, {
      headers: {
        'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github+json'
      }
    });
    
    const comments = await response.json();
    
    // Filter for CodeRabbit comments
    const coderabbitComments = comments.filter(
      (c: any) => c.user.login === 'coderabbitai'
    );
    
    return coderabbitComments;
  });
```

**Setup Instructions:**
1. Install CodeRabbit GitHub App on your repo
2. Create a `.coderabbit.yaml` config file:

```yaml
# .github/coderabbit.yaml
language: "en-US"
early_access: false
reviews:
  profile: "chill"
  request_changes_workflow: false
  high_level_summary: true
  poem: false
  review_status: true
  collapse_walkthrough: false
  path_instructions:
    - path: "**/*.ts"
      instructions: |
        - Focus on type safety
        - Check for null pointer issues
        - Verify error handling
    - path: "**/*.tsx"
      instructions: |
        - Ensure proper React hooks usage
        - Check for memory leaks
        - Verify accessibility
chat:
  auto_reply: true
```

**Displaying CodeRabbit Analysis:**
```typescript
// components/CodeRabbitPanel.tsx
import { useServerFn } from '@tanstack/start';
import { getCodeRabbitAnalysis } from '../server/coderabbit';

export function CodeRabbitPanel({ prUrl }: { prUrl: string }) {
  const [analysis, setAnalysis] = useState<any[]>([]);
  const fetchAnalysis = useServerFn(getCodeRabbitAnalysis);
  
  useEffect(() => {
    fetchAnalysis({ prUrl }).then(setAnalysis);
  }, [prUrl]);
  
  return (
    <div className="bg-gray-900 p-4 rounded">
      <h3 className="text-lg font-semibold mb-4">🤖 CodeRabbit Analysis</h3>
      {analysis.map((comment, idx) => (
        <div key={idx} className="mb-4 p-3 bg-gray-800 rounded">
          <div className="text-sm text-gray-400">Line {comment.line}</div>
          <div className="mt-2">{comment.body}</div>
        </div>
      ))}
    </div>
  );
}
```

---

### 4. Firecrawl Integration

**Installation:**
```bash
npm install firecrawl-js
```

**Use Cases:**
- Scrape internal documentation when code references specific patterns
- Fetch Stack Overflow solutions for common errors
- Pull README files from referenced libraries

**Implementation:**
```typescript
// server/firecrawl.ts
import { createServerFn } from '@tanstack/start';
import FirecrawlApp from '@mendable/firecrawl-js';

const firecrawl = new FirecrawlApp({ 
  apiKey: process.env.FIRECRAWL_API_KEY 
});

export const fetchDocumentation = createServerFn({ method: 'POST' })
  .validator((data: { query: string, urls?: string[] }) => data)
  .handler(async ({ data }) => {
    // Search for relevant docs
    const searchResults = await firecrawl.search({
      query: data.query,
      limit: 3
    });
    
    // Scrape the most relevant result
    if (searchResults.data && searchResults.data.length > 0) {
      const topResult = searchResults.data[0];
      const scrapedContent = await firecrawl.scrape(topResult.url, {
        formats: ['markdown'],
        onlyMainContent: true
      });
      
      return {
        url: topResult.url,
        title: topResult.title,
        content: scrapedContent.markdown
      };
    }
    
    return null;
  });

export const scrapeStackOverflow = createServerFn({ method: 'POST' })
  .validator((data: { errorMessage: string }) => data)
  .handler(async ({ data }) => {
    // Search Stack Overflow for error
    const query = `site:stackoverflow.com ${data.errorMessage}`;
    const searchResults = await firecrawl.search({
      query,
      limit: 2
    });
    
    const solutions = await Promise.all(
      searchResults.data?.map(async (result) => {
        const content = await firecrawl.scrape(result.url, {
          formats: ['markdown'],
          onlyMainContent: true
        });
        return {
          url: result.url,
          title: result.title,
          solution: content.markdown
        };
      }) || []
    );
    
    return solutions;
  });
```

**Context Panel Component:**
```typescript
// components/ContextPanel.tsx
import { useServerFn } from '@tanstack/start';
import { fetchDocumentation } from '../server/firecrawl';

export function ContextPanel({ 
  selectedCode, 
  errorDetected 
}: { 
  selectedCode: string;
  errorDetected?: string;
}) {
  const [context, setContext] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const getContext = useServerFn(fetchDocumentation);
  
  useEffect(() => {
    if (selectedCode) {
      setLoading(true);
      // Extract function/class names from selected code
      const query = extractKeyTerms(selectedCode);
      getContext({ query }).then((result) => {
        setContext(result);
        setLoading(false);
      });
    }
  }, [selectedCode]);
  
  if (loading) return <div>Loading context...</div>;
  if (!context) return null;
  
  return (
    <div className="p-4 bg-gray-800 rounded">
      <h4 className="font-semibold mb-2">📚 Related Documentation</h4>
      <a href={context.url} target="_blank" className="text-blue-400">
        {context.title}
      </a>
      <div className="mt-2 text-sm text-gray-300 max-h-64 overflow-y-auto">
        {context.content.slice(0, 500)}...
      </div>
    </div>
  );
}

function extractKeyTerms(code: string): string {
  // Simple extraction - can be improved
  const matches = code.match(/(?:function|class|const)\s+(\w+)/g);
  return matches ? matches.join(' ') : code.slice(0, 50);
}
```

**Important:** Use Firecrawl code `TANSTACK10K` for 20k free credits!

---

### 5. Autumn Integration (Pricing & Billing)

**Installation:**
```bash
npm install @useautumn/convex autumn-js
```

**Setup in convex/autumn.ts:**
```typescript
import { components } from "./_generated/api";
import { Autumn } from "@useautumn/convex";

export const autumn = new Autumn(components.autumn, {
  secretKey: process.env.AUTUMN_SECRET_KEY ?? "",
  identify: async (ctx: any) => {
    const user = await ctx.auth.getUserIdentity();
    if (!user) return null;
    
    return {
      customerId: user.subject,
      customerData: {
        name: user.name as string,
        email: user.email as string,
      },
    };
  },
});

export const { 
  track, 
  check, 
  checkout, 
  usage,
  listProducts,
  billingPortal 
} = autumn.api();
```

**Define Pricing Plans (in Autumn Dashboard):**

```javascript
// Product: "Pro Plan"
{
  id: "pro",
  items: [
    {
      feature_id: "live_reviews",
      included_usage: 10,      // 10 free reviews/month
      interval: "month"
    },
    {
      feature_id: "ai_analysis",
      price: 0.05,              // $0.05 per AI analysis
      interval: "month"
    },
    {
      feature_id: "doc_lookups",
      price: 0.01,              // $0.01 per doc lookup
      interval: "month"
    }
  ]
}
```

**Track Usage:**
```typescript
// When user starts a review session
const { allowed } = await autumn.check(ctx, {
  featureId: "live_reviews"
});

if (allowed) {
  // Allow review to start
  await autumn.track(ctx, {
    featureId: "live_reviews",
    value: 1
  });
}

// When AI analysis runs
await autumn.track(ctx, {
  featureId: "ai_analysis",
  value: 1
});

// When Firecrawl fetches docs
await autumn.track(ctx, {
  featureId: "doc_lookups",
  value: 1
});
```

**Frontend Integration:**
```typescript
// app/routes/__root.tsx
import { AutumnProvider } from "autumn-js/react";
import { useConvex } from "convex/react";
import { api } from "../convex/_generated/api";

export function RootComponent() {
  const convex = useConvex();
  
  return (
    <AutumnProvider convex={convex} convexApi={(api as any).autumn}>
      <Outlet />
    </AutumnProvider>
  );
}
```

**Usage Display Component:**
```typescript
// components/UsageDisplay.tsx
import { useCustomer } from "autumn-js/react";

export function UsageDisplay() {
  const { customer } = useCustomer();
  
  if (!customer) return null;
  
  return (
    <div className="p-4 bg-gray-800 rounded">
      <h3 className="font-semibold mb-2">📊 Usage This Month</h3>
      <div className="space-y-2 text-sm">
        <div>
          Live Reviews: {customer.features.live_reviews?.balance || 0} / 10
        </div>
        <div>
          AI Analyses: {customer.features.ai_analysis?.usage || 0} 
          (${(customer.features.ai_analysis?.usage * 0.05).toFixed(2)})
        </div>
        <div>
          Doc Lookups: {customer.features.doc_lookups?.usage || 0}
          (${(customer.features.doc_lookups?.usage * 0.01).toFixed(2)})
        </div>
      </div>
    </div>
  );
}
```

---

### 6. Netlify Deployment

**Installation:**
```bash
npm install -D @netlify/vite-plugin-tanstack-start
```

**vite.config.ts (already shown above):**
```typescript
import netlify from '@netlify/vite-plugin-tanstack-start';

export default defineConfig({
  plugins: [
    react(),
    tanstackStart(),
    netlify() // Automatically configures for Netlify
  ]
});
```

**netlify.toml:**
```toml
[build]
  command = "npm run build"
  publish = ".output/public"

[functions]
  directory = ".output/server"

[[redirects]]
  from = "/*"
  to = "/.netlify/functions/server"
  status = 200
  force = false

[dev]
  command = "npm run dev"
  port = 3000
  targetPort = 3000
  framework = "tanstack-start"
```

**Environment Variables (Netlify Dashboard):**
```
VITE_CONVEX_URL=https://your-deployment.convex.cloud
GITHUB_TOKEN=ghp_xxxxxxxxxxxxx
GITHUB_WEBHOOK_SECRET=xxxxxxxxxxxxx
OPENAI_API_KEY=sk-xxxxxxxxxxxxx
FIRECRAWL_API_KEY=fc-xxxxxxxxxxxxx
AUTUMN_SECRET_KEY=autumn_sk_xxxxxxxxxxxxx
```

**Deployment Commands:**
```bash
# Link to Netlify
netlify link

# Deploy preview
netlify deploy

# Deploy to production
netlify deploy --prod
```

---

## 🎨 UI Components

### Main Review Room Layout
```typescript
// app/routes/review/$prId.tsx
import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';

export const Route = createFileRoute('/review/$prId')({
  component: ReviewRoom
});

function ReviewRoom() {
  const { prId } = Route.useParams();
  const pr = useQuery(api.prs.get, { prId: prId as any });
  const [selectedFile, setSelectedFile] = useState(0);
  
  if (!pr) return <div>Loading PR...</div>;
  
  return (
    <div className="flex h-screen bg-gray-900 text-white">
      {/* Left: File Tree */}
      <FileTree 
        files={pr.files}
        selectedIndex={selectedFile}
        onSelect={setSelectedFile}
      />
      
      {/* Center: Code Viewer */}
      <div className="flex-1 flex flex-col">
        <PRHeader pr={pr} />
        <CodeViewer 
          prId={prId}
          file={pr.files[selectedFile]}
          fileIndex={selectedFile}
        />
      </div>
      
      {/* Right: AI + Chat + Context */}
      <div className="w-96 flex flex-col border-l border-gray-800">
        <AIStreamingPanel 
          prId={prId} 
          code={pr.files[selectedFile].content} 
        />
        <ContextPanel selectedCode="" />
        <CodeRabbitPanel prUrl={pr.htmlUrl} />
        <ChatPanel prId={prId} />
        <UsageDisplay />
      </div>
    </div>
  );
}
```

### Code Viewer with Syntax Highlighting
```typescript
// components/CodeViewer.tsx
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../convex/_generated/api';

export function CodeViewer({ 
  prId, 
  file, 
  fileIndex 
}: CodeViewerProps) {
  const cursors = useQuery(api.cursors.list, { prId: prId as any });
  const comments = useQuery(api.comments.list, { 
    prId: prId as any, 
    fileIndex 
  });
  const updateCursor = useMutation(api.cursors.update);
  
  const lines = file.content.split('\n');
  
  const handleMouseMove = (e: React.MouseEvent) => {
    const lineHeight = 24;
    const line = Math.floor(e.clientY / lineHeight);
    updateCursor({ 
      prId: prId as any, 
      line, 
      fileIndex 
    });
  };
  
  return (
    <div 
      className="relative overflow-auto h-full"
      onMouseMove={handleMouseMove}
    >
      {lines.map((line, idx) => (
        <div 
          key={idx}
          className="flex hover:bg-gray-800 relative"
          style={{ height: '24px' }}
        >
          {/* Line Number */}
          <div className="w-12 text-gray-500 text-right pr-4 select-none">
            {idx + 1}
          </div>
          
          {/* Code Line */}
          <div className="flex-1">
            <SyntaxHighlighter
              language={file.language}
              style={vscDarkPlus}
              customStyle={{ 
                background: 'transparent', 
                padding: 0,
                margin: 0,
                fontSize: '14px',
                lineHeight: '24px'
              }}
              PreTag="span"
            >
              {line}
            </SyntaxHighlighter>
          </div>
          
          {/* Comment Indicator */}
          {comments?.find(c => c.line === idx + 1) && (
            <div className="absolute right-2 top-0">
              <span className="text-yellow-400 text-xs">💬</span>
            </div>
          )}
          
          {/* Other users' cursors on this line */}
          {cursors
            ?.filter(c => c.line === idx + 1 && c.fileIndex === fileIndex)
            .map(cursor => (
              <div
                key={cursor.userId}
                className="absolute left-0 right-0 h-full opacity-20 pointer-events-none"
                style={{ backgroundColor: cursor.color }}
              >
                <span 
                  className="absolute -top-5 left-12 px-2 py-1 rounded text-xs text-white"
                  style={{ backgroundColor: cursor.color }}
                >
                  {cursor.userName}
                </span>
              </div>
            ))
          }
        </div>
      ))}
    </div>
  );
}
```

---

## 📝 GitHub Integration

### Webhook Handler
```typescript
// app/routes/api/github/webhook.ts
import { json } from '@tanstack/start';
import { Webhooks } from '@octokit/webhooks';

export async function POST({ request }: { request: Request }) {
  const payload = await request.json();
  const signature = request.headers.get('x-hub-signature-256');
  
  const webhooks = new Webhooks({
    secret: process.env.GITHUB_WEBHOOK_SECRET!
  });
  
  const isValid = await webhooks.verify(
    JSON.stringify(payload),
    signature!
  );
  
  if (!isValid) {
    return json({ error: 'Invalid signature' }, { status: 401 });
  }
  
  if (payload.action === 'opened' || payload.action === 'synchronize') {
    const pr = payload.pull_request;
    
    // Process PR via server function
    await processPR({
      prNumber: pr.number,
      repo: payload.repository.full_name,
      owner: payload.repository.owner.login,
      repoName: payload.repository.name,
      title: pr.title,
      author: pr.user.login,
      baseBranch: pr.base.ref,
      headBranch: pr.head.ref,
      htmlUrl: pr.html_url
    });
  }
  
  return json({ success: true });
}
```

### Process PR Server Function
```typescript
// server/github.ts
import { createServerFn } from '@tanstack/start';
import { Octokit } from '@octokit/rest';

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN
});

export const processPR = createServerFn({ method: 'POST' })
  .validator((data: PRData) => data)
  .handler(async ({ data }) => {
    // 1. Fetch changed files
    const { data: files } = await octokit.pulls.listFiles({
      owner: data.owner,
      repo: data.repoName,
      pull_number: data.prNumber
    });
    
    // 2. Fetch content of each file
    const filesWithContent = await Promise.all(
      files.map(async (file) => {
        const content = await fetchFileContent(
          data.owner,
          data.repoName,
          file.filename,
          data.headBranch
        );
        
        return {
          path: file.filename,
          content,
          patch: file.patch || '',
          status: file.status,
          additions: file.additions,
          deletions: file.deletions,
          language: detectLanguage(file.filename)
        };
      })
    );
    
    // 3. Store in Convex (via mutation)
    const prId = await storePRInConvex({
      ...data,
      files: filesWithContent
    });
    
    // 4. Add comment to PR with review link
    await octokit.issues.createComment({
      owner: data.owner,
      repo: data.repoName,
      issue_number: data.prNumber,
      body: `🚀 **Live Review Ready!**\n\n` +
            `[Start Live Review](https://your-app.netlify.app/review/${prId})\n\n` +
            `Collaborate in real-time with AI assistance.`
    });
    
    return { prId };
  });
```

---

## 🎬 Demo Video Script (For Submission)

**Duration:** 2-3 minutes max

**Structure:**
1. **Problem Setup (15s)**
   - "Code reviews take 2-3 days. Junior devs wait for answers."
   
2. **Solution Demo (90s)**
   - Show PR link → Click "Start Live Review"
   - Second user joins (show in split screen)
   - Demonstrate:
     - Live cursors moving
     - AI streaming suggestions
     - Real-time chat
     - Context panel loading docs
     - Usage tracker updating
   
3. **Tech Stack Speed Run (30s)**
   - Quick montage showing:
     - TanStack Start file structure
     - Convex real-time updates
     - CodeRabbit analysis
     - Firecrawl fetching docs
     - Autumn usage dashboard
     - Netlify deployment
   
4. **Call to Action (15s)**
   - "Built with TanStack Start, Convex, CodeRabbit, Firecrawl, Autumn, deployed on Netlify"
   - Show GitHub repo link

---

## ⏱️ 8-Hour Implementation Timeline

### Hour 1-2: Setup & Foundation
- [ ] Create TanStack Start project
- [ ] Setup Convex + schema
- [ ] Configure Netlify deployment
- [ ] Environment variables

### Hour 3-4: Core Features
- [ ] GitHub webhook handler
- [ ] PR data fetching & storage
- [ ] Basic code viewer component
- [ ] File tree navigation

### Hour 5-6: Real-time Features
- [ ] Cursor tracking (Convex mutations)
- [ ] Live cursor rendering
- [ ] Chat functionality
- [ ] Comment system

### Hour 7: AI & Integrations
- [ ] OpenAI streaming setup
- [ ] CodeRabbit integration
- [ ] Firecrawl context panel
- [ ] Autumn usage tracking

### Hour 8: Polish & Deploy
- [ ] UI styling with Tailwind
- [ ] Error handling
- [ ] Record demo video
- [ ] Deploy to Netlify
- [ ] Submit to vibeapps.dev

---

## 📋 Minimum Viable Features (MVP)

**Must Have:**
1. ✅ Load PR from GitHub
2. ✅ Display code with syntax highlighting
3. ✅ Real-time cursor tracking (2+ users)
4. ✅ Basic chat functionality
5. ✅ AI streaming suggestions
6. ✅ Deploy to Netlify
7. ✅ Video demo

**Nice to Have:**
1. Diff view (split screen)
2. CodeRabbit analysis display
3. Firecrawl context lookups
4. Autumn billing dashboard
5. Comment threads on lines
6. File search

---

## 🔐 Environment Variables Reference

```bash
# Convex
VITE_CONVEX_URL=https://xxx.convex.cloud
CONVEX_DEPLOYMENT=prod:xxx

# GitHub
GITHUB_TOKEN=ghp_xxxxxxxxxxxxx
GITHUB_WEBHOOK_SECRET=xxxxxxxxxxxxx

# OpenAI
OPENAI_API_KEY=sk-xxxxxxxxxxxxx

# Firecrawl (use code: TANSTACK10K for 20k credits)
FIRECRAWL_API_KEY=fc-xxxxxxxxxxxxx

# Autumn
AUTUMN_SECRET_KEY=autumn_sk_xxxxxxxxxxxxx

# Netlify (auto-set on deploy)
NETLIFY_SITE_ID=xxxxxxxxxxxxx
```

---

## 📦 package.json

```json
{
  "name": "ai-code-review-collab-studio",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "start": "vite preview"
  },
  "dependencies": {
    "@tanstack/react-router": "^1.132.0",
    "@tanstack/start": "^1.132.0",
    "@tanstack/react-query": "^5.0.0",
    "@tanstack/react-router-with-query": "^1.132.0",
    "convex": "^1.25.0",
    "@convex-dev/react-query": "^0.0.0",
    "@useautumn/convex": "^0.1.24",
    "autumn-js": "^0.1.24",
    "@octokit/rest": "^20.0.0",
    "@octokit/webhooks": "^12.0.0",
    "firecrawl-js": "^1.0.0",
    "openai": "^4.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-syntax-highlighter": "^15.5.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.0.0",
    "@netlify/vite-plugin-tanstack-start": "^0.1.0",
    "vite": "^5.0.0",
    "typescript": "^5.0.0",
    "tailwindcss": "^3.4.0",
    "autoprefixer": "^10.4.0",
    "postcss": "^8.4.0"
  }
}
```

---

## 🎯 Judging Criteria Optimization

**1. How well you use TanStack Start + Convex + Sponsors**
- ✅ TanStack Start: SSR, streaming, server functions, type-safe routing
- ✅ Convex: Real-time cursors, chat, comments (showcase best use case)
- ✅ All sponsors meaningfully integrated (not just present)

**2. Creativity and quality of full-stack app**
- ✅ Solves real problem (async code review → sync)
- ✅ Unique multiplayer angle (like Figma for code)
- ✅ Production-ready concept VCs would fund

**3. Video demo showing how you built it**
- ✅ Less talk, more demo
- ✅ Show live collaboration (split screen)
- ✅ Highlight each sponsor's contribution
- ✅ Code snippets showing integrations

**4. Bonus: Social shares**
- Tweet: "Built a real-time code review platform with @tan_stack, @convex_dev, @coderabbitai, @firecrawl_dev, @autumnpricing on @netlify! 🚀"
- LinkedIn post with demo video

---

## 🚀 Quick Start Commands

```bash
# 1. Create project
npm create @tanstack/start@latest ai-code-review-studio
cd ai-code-review-studio

# 2. Install dependencies
npm install convex @convex-dev/react-query @tanstack/react-router-with-query
npm install @useautumn/convex autumn-js
npm install @octokit/rest @octokit/webhooks
npm install firecrawl-js openai
npm install react-syntax-highlighter
npm install -D @netlify/vite-plugin-tanstack-start

# 3. Setup Convex
npx convex dev

# 4. Run development
npm run dev

# 5. Deploy to Netlify
netlify deploy --prod
```

---

## 📚 Documentation Links

- TanStack Start: https://tanstack.com/start/latest
- Convex: https://docs.convex.dev/quickstart/tanstack-start
- CodeRabbit: https://docs.coderabbit.ai/
- Firecrawl: https://docs.firecrawl.dev/
- Autumn: https://docs.useautumn.com/
- Netlify: https://docs.netlify.com/build/frameworks/framework-setup-guides/tanstack-start/

---

## ⚠️ Critical Reminders

1. **Deadline:** Nov 17, 2025 12 PM PT - Submit to vibeapps.dev with #tanstackstart tag
2. **GitHub Repo:** Make public and invite wayne@convex.dev if private
3. **Video Demo:** Upload to YouTube/Loom, include in submission
4. **Social Share:** Tag @tan_stack, @convex_dev, etc. for bonus points
5. **Environment Variables:** Set in Netlify dashboard before deploy
6. **Firecrawl Credits:** Use code TANSTACK10K for 20k free credits

---

## 🎉 Success Metrics

- Real-time features work smoothly with 2+ users
- AI streaming responds within 2 seconds
- All 6 sponsors integrated and visible in demo
- Clean, production-ready UI
- Video clearly shows value proposition
- Deployed and accessible via public URL

---

**Good luck! You've got this! 🚀**

The key is to start simple, get core features working, then layer in the sponsor integrations. Focus on making the real-time collaboration aspect REALLY shine - that's your differentiator.