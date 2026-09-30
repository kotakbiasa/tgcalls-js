---
name: admin-panel
description: Complete reference documentation and practical guide.
---

# Web Admin Panel — Reference

Beautiful, production-ready admin dashboard for your Telegram bot. Connected via HTTP API (FastAPI backend that shares code with the bot), modern frontend (React + Tailwind + shadcn/ui), role-based access, real-time updates.

Not an inline-bot admin panel (that's `/admin` command inside the bot). This is the **separate web app** that your operators use from a browser or Mini App.

## When to use

- You're the operator of a bot with 100+ active users and no time for inline `/admin` menus
- You need at-a-glance metrics: DAU, MAU, revenue, churn
- You need segmented broadcast composer with preview
- You manage a team — 3+ operators with different roles
- You want fast user search, bulk actions, CSV export
- You need audit logs for compliance

## When inline is enough (skip this reference)

- <100 users, solo operator → `/botforge-admin inline` is simpler
- No payments, no segments → inline handlers are fine
- MVP phase → don't build the panel yet

---

## Architecture

```
┌───────────────┐          ┌──────────────────┐          ┌──────────────┐
│  Browser /    │──HTTPS──▶│  FastAPI         │──────────▶   Postgres   │
│  Mini App     │◀──JSON ──│  (admin routes)  │          │   (shared)   │
└───────────────┘          └──────────────────┘          └──────────────┘
     React + TS                     │
     Tailwind + shadcn              │ shares: models, repositories,
     TanStack Query                 │         services, settings
     Recharts                       │
                                    ▼
                            ┌──────────────────┐
                            │   aiogram bot    │
                            │   (same repo)    │
                            └──────────────────┘
```

**Core insight:** admin panel and bot share the same codebase. `api/routers/admin/*.py` imports services from `app/services/`. No duplication. One source of truth.

## Project structure

```
<bot-repo>/
├── app/                          # existing bot code
│   ├── services/                 # shared business logic
│   ├── repositories/             # shared data access
│   └── models/                   # shared ORM
├── api/                          # admin panel + Mini App backend
│   ├── main.py                   # FastAPI app, routing, CORS
│   ├── security.py               # JWT, require_role
│   ├── deps.py                   # dependency injection
│   ├── pagination.py             # cursor + offset helpers
│   ├── routers/
│   │   ├── auth.py               # POST /auth/login, /auth/telegram
│   │   └── admin/
│   │       ├── __init__.py       # all admin routes
│   │       ├── stats.py          # GET /admin/stats
│   │       ├── users.py          # GET /admin/users, POST /ban
│   │       ├── subscriptions.py
│   │       ├── payments.py
│   │       ├── broadcasts.py
│   │       ├── content.py
│   │       ├── settings.py       # feature flags
│   │       └── audit.py
│   ├── schemas/                  # pydantic response models
│   ├── events.py                 # SSE stream for real-time
│   └── rate_limit.py
├── webapp/                       # the beautiful frontend
│   ├── package.json
│   ├── vite.config.ts
│   ├── tailwind.config.ts
│   ├── tsconfig.json
│   ├── index.html
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── router.tsx
│       ├── lib/
│       │   ├── api.ts            # axios/fetch wrapper, auth
│       │   ├── auth.ts           # JWT store (zustand)
│       │   ├── utils.ts          # cn() for class merging
│       │   └── query.ts          # TanStack Query client
│       ├── components/
│       │   ├── ui/               # shadcn components
│       │   │   ├── button.tsx
│       │   │   ├── card.tsx
│       │   │   ├── dialog.tsx
│       │   │   ├── input.tsx
│       │   │   ├── select.tsx
│       │   │   ├── sheet.tsx
│       │   │   ├── table.tsx
│       │   │   ├── tabs.tsx
│       │   │   ├── toast.tsx
│       │   │   └── badge.tsx
│       │   ├── layout/
│       │   │   ├── AppShell.tsx  # sidebar + topbar
│       │   │   ├── Sidebar.tsx
│       │   │   └── Topbar.tsx
│       │   ├── charts/
│       │   │   ├── LineChart.tsx
│       │   │   └── StatCard.tsx
│       │   └── features/
│       │       ├── UserTable.tsx
│       │       ├── BroadcastComposer.tsx
│       │       └── AuditLogViewer.tsx
│       └── pages/
│           ├── Login.tsx
│           ├── Dashboard.tsx
│           ├── Users.tsx
│           ├── UserDetail.tsx
│           ├── Subscriptions.tsx
│           ├── Payments.tsx
│           ├── Broadcasts.tsx
│           ├── Content.tsx
│           ├── Settings.tsx
│           └── AuditLog.tsx
└── docker-compose.yml            # + api service + webapp service (nginx)
```

---

## Frontend stack — opinionated and beautiful

### Core dependencies
```json
{
  "react": "19.x",
  "react-dom": "19.x",
  "typescript": "5.x",
  "vite": "5.x",
  "tailwindcss": "3.x",
  "@tanstack/react-query": "5.x",
  "@tanstack/react-table": "8.x",
  "react-router-dom": "6.x",
  "zustand": "4.x",
  "react-hook-form": "7.x",
  "zod": "3.x",
  "axios": "1.x",
  "recharts": "2.x",
  "lucide-react": "0.x",
  "sonner": "1.x",
  "date-fns": "3.x"
}
```

### shadcn/ui — not a dependency, a copy-paste toolkit

```bash
cd webapp
pnpm dlx shadcn@latest init
pnpm dlx shadcn@latest add button card dialog input select sheet table tabs toast badge dropdown-menu avatar
```

shadcn components are **copied into your repo** (`src/components/ui/`), not installed from npm. You own the code, customize freely. Best of both worlds: polished out of the box, no lock-in.

### Design system — BotForge aesthetic

Color palette in `tailwind.config.ts`:

```typescript
theme: {
  extend: {
    colors: {
      background: "hsl(222, 47%, 4%)",        // #050a14
      surface:    "hsl(218, 42%, 9%)",        // #0a1424
      card:       "hsl(217, 40%, 12%)",       // #0f1c33
      border:     "hsl(217, 30%, 20%)",
      foreground: "hsl(210, 40%, 95%)",       // #e8eff8
      muted:      "hsl(210, 25%, 65%)",       // #a0b5cf
      accent:     "hsl(201, 84%, 54%)",       // #2aabee — Telegram cyan
      primary:    "hsl(201, 84%, 54%)",
      success:    "hsl(142, 76%, 56%)",       // #4ade80
      destructive:"hsl(0, 84%, 65%)",         // #f87171
      warning:    "hsl(36, 96%, 54%)",        // #fbbf24
      // for gradients in hero/empty states
      gradient: {
        from:  "hsl(200, 98%, 73%)",
        via:   "hsl(330, 88%, 70%)",
        to:    "hsl(260, 87%, 76%)",
      }
    },
    fontFamily: {
      sans: ["Inter", "SF Pro Display", "system-ui", "sans-serif"],
      mono: ["JetBrains Mono", "ui-monospace", "monospace"],
    },
    borderRadius: {
      xl: "14px",
      "2xl": "18px",
    }
  }
}
```

### Typography
- **Headings:** Inter 800/900, `letter-spacing: -0.02em` to `-0.04em`
- **Body:** Inter 400/500, `line-height: 1.6`
- **Numbers (stats):** Inter 900, tabular-nums
- **Code/IDs:** JetBrains Mono

### Layout conventions
- Sidebar 260px, collapsible to 72px icon-only
- Topbar 64px with search + user menu + notifications
- Content area: `max-w-7xl mx-auto px-6 py-8`
- Card padding: `p-6`, rounded `rounded-xl`, border `border-border/60`
- Data tables: zebra rows with `hover:bg-card/50`, sticky header

### Micro-interactions
- Hover: 150ms ease-out, subtle lift (`translateY(-1px)`)
- Focus: ring 2px `ring-accent/50`, no outline
- Transitions: 200ms for state, 300ms for layout
- Loading: skeleton pulse (`animate-pulse bg-card`)
- Empty states: icon (Lucide) + heading + CTA

---

## Key pages — what each must show

### 1. Dashboard (`/`)

**Above the fold — 4 stat cards:**
- Total users · delta vs last month
- DAU · 7d sparkline
- MRR · delta
- Active subscriptions · delta

**Below:**
- Revenue chart (last 30 days) — Recharts `<LineChart>`
- New users chart (last 30 days)
- Recent payments table (last 10)
- Bot health panel (webhook status, last error, queue depth)

Real-time updates via SSE: when payment arrives, toast notification + stat cards refresh.

### 2. Users (`/users`)

- Search by `tg_id`, `username`, `email` (debounced 300ms)
- Filter: role, status (active / banned), has VIP, lang
- Sort: signup date (default desc), last seen, total spent
- Table columns: avatar, username, tg_id, role badge, status, total spent, actions
- Row click → `/users/:id` detail page
- Bulk actions: export CSV, send broadcast to filtered list

Bulk-action safety: requires typing "CONFIRM" for destructive operations (ban 1000 users, etc.).

### 3. User detail (`/users/:id`)

- Header: avatar, name, username, role badge, joined date
- Stats mini-cards: total spent, first payment, last active, VIP status
- Tabs: Profile | Subscriptions | Payments | Activity | Audit
- Actions (role-gated): Grant role, Ban/Unban, Delete data (GDPR), Send DM

### 4. Broadcasts (`/broadcasts`)

- List of past broadcasts with status, segment, delivery stats (sent/blocked/failed)
- New broadcast button → composer drawer:
  - Step 1: text (rich text, HTML/Markdown preview)
  - Step 2: media (optional)
  - Step 3: segment (all / lang / tier / custom query)
  - Step 4: schedule (now / at datetime)
  - Step 5: preview as sample user
  - Step 6: confirm (requires typing segment size)
- Progress page: live counter via SSE

### 5. Content (`/content`) — Media/Gated bots

- List of content items with tier (free / channel / vip)
- Upload new: drag-drop, auto-generate `file_id` via bot
- Bulk tag editor
- Analytics: views, shares

### 6. Payments (`/payments`)

- All transactions with provider icon, amount, status, user link
- Filter: status, provider, date range, amount range
- Actions: refund (with confirmation), resend receipt
- Daily revenue chart at top
- Reconciliation report export (CSV)

### 7. Settings (`/settings`)

- Feature flags (toggle on/off, gradual rollout %)
- Bot texts (welcome message, VIP description) with translation support
- Payment provider config (readonly — actual secrets in .env, UI shows masked)
- Webhook URL and status (with "re-set webhook" button)

### 8. Audit log (`/audit`)

- Paginated list of all admin actions: who, what, when, target, payload
- Filter by actor, action type, date range
- Never deletable — retention policy in backend

---

## Backend — FastAPI admin router

### JWT with role claim

```python
# api/security.py
from datetime import datetime, timedelta, UTC
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
import jwt

from app.config.settings import settings
from app.models.user import Role, User
from app.repositories.user_repo import UserRepo

_bearer = HTTPBearer(auto_error=True)


def issue_jwt(user_id: int, role: Role, ttl_hours: int = 12) -> str:
    now = datetime.now(UTC)
    payload = {
        "sub": str(user_id),
        "role": role.value,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(hours=ttl_hours)).timestamp()),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")


async def current_user(
    cred: HTTPAuthorizationCredentials = Depends(_bearer),
    session=Depends(get_session),
) -> User:
    try:
        payload = jwt.decode(cred.credentials, settings.jwt_secret, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(401, "invalid token")
    user = await UserRepo(session).get_by_id(int(payload["sub"]))
    if user is None or user.is_banned:
        raise HTTPException(401, "user not found or banned")
    return user


def require_role(*roles: Role):
    async def _check(user: User = Depends(current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(403, "insufficient role")
        return user
    return _check


require_admin = require_role(Role.admin)
require_moderator = require_role(Role.admin, Role.moderator)
```

### Stats endpoint

```python
# api/routers/admin/stats.py
from datetime import datetime, timedelta, UTC
from fastapi import APIRouter, Depends
from sqlalchemy import select, func

from api.security import require_admin
from api.deps import get_session

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/stats", dependencies=[Depends(require_admin)])
async def stats(session=Depends(get_session)) -> dict:
    now = datetime.now(UTC)
    month_ago = now - timedelta(days=30)
    day_ago = now - timedelta(days=1)

    total_users = await session.scalar(select(func.count(User.id)))
    new_30d = await session.scalar(
        select(func.count(User.id)).where(User.created_at >= month_ago)
    )
    dau = await session.scalar(
        select(func.count(func.distinct(User.id)))
        .where(User.last_active_at >= day_ago)
    )
    active_subs = await session.scalar(
        select(func.count(Subscription.id))
        .where(Subscription.status == SubStatus.active)
        .where(Subscription.expires_at > now)
    )
    revenue_30d = await session.scalar(
        select(func.coalesce(func.sum(Payment.amount), 0))
        .where(Payment.status == PaymentStatus.succeeded)
        .where(Payment.created_at >= month_ago)
    )

    return {
        "users": {"total": total_users, "new_30d": new_30d},
        "dau": dau,
        "active_subs": active_subs,
        "revenue_30d": {"amount": str(revenue_30d), "currency": "RUB"},
    }
```

### Users listing with cursor pagination

```python
# api/routers/admin/users.py
from typing import Literal
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select

from api.security import require_moderator
from api.pagination import paginate

router = APIRouter(prefix="/admin/users", tags=["admin-users"])


@router.get("", dependencies=[Depends(require_moderator)])
async def list_users(
    q: str | None = None,
    role: str | None = None,
    banned: bool | None = None,
    limit: int = Query(50, le=200),
    cursor: str | None = None,
    session=Depends(get_session),
):
    stmt = select(User).order_by(User.id.desc())
    if q:
        stmt = stmt.where(
            (User.username.ilike(f"%{q}%")) | (User.tg_id == int(q) if q.isdigit() else False)
        )
    if role:
        stmt = stmt.where(User.role == role)
    if banned is not None:
        stmt = stmt.where(User.is_banned == banned)

    return await paginate(session, stmt, cursor=cursor, limit=limit)


@router.post("/{user_id}/ban", dependencies=[Depends(require_moderator)])
async def ban_user(
    user_id: int,
    reason: str = "",
    actor: User = Depends(require_moderator),
    session=Depends(get_session),
):
    service = UserService(UserRepo(session), AuditService(session))
    await service.ban(target_id=user_id, actor_id=actor.id, reason=reason)
    return {"ok": True}
```

### Broadcast composer endpoint

```python
# api/routers/admin/broadcasts.py
class BroadcastCreate(BaseModel):
    text: str = Field(..., max_length=4096)
    media_file_id: str | None = None
    segment: dict  # {"lang": "ru", "tier": "vip", ...}
    scheduled_at: datetime | None = None

@router.post("/broadcasts", dependencies=[Depends(require_admin)])
async def create_broadcast(body: BroadcastCreate, session=Depends(get_session)):
    # estimate recipients count first
    count = await broadcast_service.estimate_recipients(body.segment)
    job = await broadcast_service.create(body, estimated_count=count)
    return {"id": job.id, "estimated": count, "scheduled_at": job.scheduled_at}
```

### Real-time via SSE

```python
# api/events.py
import asyncio
import json
from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse

router = APIRouter(prefix="/admin/events")
_subscribers: set[asyncio.Queue] = set()


async def event_stream(request: Request):
    queue: asyncio.Queue = asyncio.Queue(maxsize=100)
    _subscribers.add(queue)
    try:
        while True:
            if await request.is_disconnected():
                break
            try:
                event = await asyncio.wait_for(queue.get(), timeout=30)
                yield f"data: {json.dumps(event)}\n\n"
            except asyncio.TimeoutError:
                yield ": keep-alive\n\n"  # ping
    finally:
        _subscribers.discard(queue)


@router.get("/stream", dependencies=[Depends(require_moderator)])
async def stream(request: Request):
    return StreamingResponse(event_stream(request), media_type="text/event-stream")


async def broadcast_event(event_type: str, payload: dict) -> None:
    """Call from services when something admin-visible happens."""
    for q in list(_subscribers):
        try:
            q.put_nowait({"type": event_type, "payload": payload})
        except asyncio.QueueFull:
            pass
```

Trigger from services:
```python
# in PaymentService.on_successful_payment:
await broadcast_event("payment.succeeded", {
    "amount": str(payment.amount),
    "currency": payment.currency,
    "user_id": payment.user_id,
})
```

---

## Frontend — key snippets

### App shell

```tsx
// webapp/src/components/layout/AppShell.tsx
import { Outlet, NavLink } from "react-router-dom";
import { LayoutDashboard, Users, CreditCard, Megaphone, FileText, Settings, ScrollText } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/",              icon: LayoutDashboard, label: "Dashboard" },
  { to: "/users",         icon: Users,           label: "Users" },
  { to: "/payments",      icon: CreditCard,      label: "Payments" },
  { to: "/broadcasts",    icon: Megaphone,       label: "Broadcasts" },
  { to: "/content",       icon: FileText,        label: "Content" },
  { to: "/audit",         icon: ScrollText,      label: "Audit log" },
  { to: "/settings",      icon: Settings,        label: "Settings" },
];

export function AppShell() {
  return (
    <div className="min-h-screen bg-background text-foreground flex">
      <aside className="w-64 border-r border-border/60 p-4 sticky top-0 h-screen">
        <div className="flex items-center gap-2 mb-8 px-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent to-accent/70" />
          <span className="font-black text-lg tracking-tight">BotForge Admin</span>
        </div>
        <nav className="space-y-1">
          {NAV.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) => cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium",
                "transition-colors",
                isActive
                  ? "bg-accent/10 text-accent"
                  : "text-muted hover:text-foreground hover:bg-card/50"
              )}
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="flex-1 overflow-x-hidden">
        <Outlet />
      </main>
    </div>
  );
}
```

### Dashboard with stat cards

```tsx
// webapp/src/pages/Dashboard.tsx
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { StatCard } from "@/components/charts/StatCard";

export function Dashboard() {
  const { data } = useQuery({
    queryKey: ["admin", "stats"],
    queryFn: () => api.get("/admin/stats").then(r => r.data),
    refetchInterval: 30_000,
  });

  return (
    <div className="container max-w-7xl py-8 space-y-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tight">Dashboard</h1>
          <p className="text-muted">Overview of your bot's health and growth.</p>
        </div>
      </header>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard label="Total users" value={data?.users.total} delta={data?.users.new_30d} hint="new in 30d" />
        <StatCard label="DAU" value={data?.dau} hint="active today" />
        <StatCard label="Active subs" value={data?.active_subs} hint="currently paying" />
        <StatCard label="Revenue 30d" value={data?.revenue_30d.amount} suffix={data?.revenue_30d.currency} />
      </div>
      {/* charts + recent events */}
    </div>
  );
}
```

### StatCard with animation

```tsx
// webapp/src/components/charts/StatCard.tsx
import { Card, CardContent } from "@/components/ui/card";
import { useEffect, useState } from "react";

export function StatCard({ label, value, delta, hint, suffix }: {
  label: string; value?: number | string; delta?: number; hint?: string; suffix?: string;
}) {
  const n = typeof value === "number" ? value : Number(value ?? 0);
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (!Number.isFinite(n)) return;
    let start: number | null = null;
    const duration = 600;
    const step = (ts: number) => {
      if (start === null) start = ts;
      const t = Math.min(1, (ts - start) / duration);
      setDisplay(Math.round(n * (1 - Math.pow(1 - t, 3))));
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [n]);

  return (
    <Card className="border-border/60 hover:border-accent/40 transition-colors">
      <CardContent className="p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted mb-2">{label}</p>
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-black tabular-nums">
            {display.toLocaleString()}
          </span>
          {suffix && <span className="text-sm text-muted font-semibold">{suffix}</span>}
        </div>
        {(delta !== undefined || hint) && (
          <p className="text-xs text-muted mt-2">
            {delta !== undefined && <span className="text-success font-semibold">+{delta}</span>} {hint}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
```

### Users table with TanStack

```tsx
// webapp/src/components/features/UserTable.tsx
import { useReactTable, getCoreRowModel, flexRender, ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type User = { id: number; tg_id: number; username: string | null; role: string; is_banned: boolean; total_spent: number };

const columns: ColumnDef<User>[] = [
  { accessorKey: "username", header: "User",
    cell: ({ row }) => (
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-accent to-accent/60 flex items-center justify-center text-xs font-bold">
          {row.original.username?.[0]?.toUpperCase() ?? "?"}
        </div>
        <div>
          <div className="font-medium">{row.original.username ?? "(no username)"}</div>
          <div className="text-xs text-muted font-mono">{row.original.tg_id}</div>
        </div>
      </div>
    )
  },
  { accessorKey: "role", header: "Role",
    cell: ({ row }) => <Badge variant={row.original.role === "admin" ? "default" : "secondary"}>{row.original.role}</Badge>
  },
  { accessorKey: "is_banned", header: "Status",
    cell: ({ row }) => row.original.is_banned
      ? <Badge variant="destructive">Banned</Badge>
      : <Badge variant="outline" className="border-success/40 text-success">Active</Badge>
  },
  { accessorKey: "total_spent", header: "Spent",
    cell: ({ row }) => <span className="tabular-nums">{row.original.total_spent.toLocaleString()} ₽</span>
  }
];

export function UserTable({ data }: { data: User[] }) {
  const table = useReactTable({ data, columns, getCoreRowModel: getCoreRowModel() });
  return (
    <div className="rounded-xl border border-border/60 overflow-hidden">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map(hg => (
            <TableRow key={hg.id}>
              {hg.headers.map(h => (
                <TableHead key={h.id}>{flexRender(h.column.columnDef.header, h.getContext())}</TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map(row => (
            <TableRow key={row.id} className="hover:bg-card/50 cursor-pointer">
              {row.getVisibleCells().map(cell => (
                <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
```

### Broadcast composer (drawer flow)

```tsx
// webapp/src/components/features/BroadcastComposer.tsx
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/api";
import { toast } from "sonner";

export function BroadcastComposer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [text, setText] = useState("");
  const [segment, setSegment] = useState<"all" | "vip" | "free">("all");
  const [step, setStep] = useState(1);
  const [estimate, setEstimate] = useState<number | null>(null);

  const estimateMutation = useMutation({
    mutationFn: () => api.post("/admin/broadcasts/estimate", { segment: { kind: segment } }).then(r => r.data),
    onSuccess: (d) => { setEstimate(d.count); setStep(3); }
  });

  const sendMutation = useMutation({
    mutationFn: () => api.post("/admin/broadcasts", { text, segment: { kind: segment } }).then(r => r.data),
    onSuccess: () => { toast.success("Broadcast scheduled"); onClose(); }
  });

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent className="w-[560px] sm:max-w-[560px]">
        <SheetHeader><SheetTitle>New broadcast</SheetTitle></SheetHeader>
        <div className="mt-6 space-y-5">
          {step === 1 && (
            <>
              <label className="block">
                <span className="text-sm font-medium mb-1 block">Message</span>
                <Textarea rows={8} value={text} onChange={e => setText(e.target.value)} placeholder="HTML supported…" />
                <span className="text-xs text-muted mt-1 block">{text.length} / 4096</span>
              </label>
              <Button disabled={!text} onClick={() => setStep(2)} className="w-full">Next: segment</Button>
            </>
          )}
          {step === 2 && (
            <>
              <label className="block">
                <span className="text-sm font-medium mb-1 block">Who receives this?</span>
                <Select value={segment} onValueChange={(v) => setSegment(v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All users</SelectItem>
                    <SelectItem value="vip">VIP only</SelectItem>
                    <SelectItem value="free">Free tier only</SelectItem>
                  </SelectContent>
                </Select>
              </label>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
                <Button onClick={() => estimateMutation.mutate()} className="flex-1">Preview recipients</Button>
              </div>
            </>
          )}
          {step === 3 && estimate !== null && (
            <>
              <div className="p-4 rounded-lg bg-card border border-border/60">
                <div className="text-sm text-muted">Will be sent to</div>
                <div className="text-3xl font-black tabular-nums my-1">{estimate.toLocaleString()}</div>
                <div className="text-xs text-muted">users in segment: {segment}</div>
              </div>
              <div className="p-4 rounded-lg bg-surface border border-border/60 max-h-[200px] overflow-auto text-sm whitespace-pre-wrap">
                {text}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(2)}>Back</Button>
                <Button onClick={() => sendMutation.mutate()} disabled={sendMutation.isPending} className="flex-1">
                  {sendMutation.isPending ? "Scheduling…" : "Send broadcast"}
                </Button>
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
```

### Real-time hook (SSE)

```tsx
// webapp/src/lib/realtime.ts
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { auth } from "./auth";

export function useRealtime() {
  const qc = useQueryClient();
  useEffect(() => {
    const token = auth.getState().token;
    if (!token) return;
    const es = new EventSource(`/api/admin/events/stream?token=${token}`);
    es.onmessage = (ev) => {
      const { type, payload } = JSON.parse(ev.data);
      if (type === "payment.succeeded") {
        toast.success(`New payment: ${payload.amount} ${payload.currency}`);
        qc.invalidateQueries({ queryKey: ["admin", "stats"] });
      }
      if (type === "broadcast.progress") {
        qc.setQueryData(["broadcast", payload.id], (old: any) => ({ ...old, ...payload }));
      }
    };
    return () => es.close();
  }, [qc]);
}
```

Use in `App.tsx` once per session.

---

## Auth — admin login

Two paths:

### Path A — Mini App (recommended)
Admin opens the panel as a Telegram Mini App. `initData` validates → if `user_id ∈ ADMIN_IDS`, issue JWT with `role=admin`. No separate password.

### Path B — email/password (independent web login)
For operators who don't want Mini App:
- `POST /auth/login` with email/password
- bcrypt-hashed passwords in DB
- 2FA via TOTP (pyotp on backend, otpauth URL on frontend)
- Session refresh via refresh token

Both paths issue the same JWT shape. Frontend doesn't care which path was used.

---

## Deploy

Add to `docker-compose.yml`:

```yaml
services:
  # ... existing bot, postgres, redis ...

  api:
    build:
      context: .
      dockerfile: docker/Dockerfile.api
    env_file: .env
    depends_on:
      postgres:
        condition: service_healthy
    ports:
      - "8000:8000"
    restart: unless-stopped

  webapp:
    build:
      context: ./webapp
    ports:
      - "5173:80"
    depends_on:
      - api
```

Frontend Dockerfile:
```
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG VITE_API_URL=/api
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
```

nginx config proxies `/api` to the FastAPI service.

---

## Security checklist

- [ ] Admin JWT TTL ≤ 12h
- [ ] `require_role(Role.admin)` on every admin endpoint
- [ ] CORS whitelist: webapp domain only, never `*`
- [ ] CSP header: `default-src 'self'`, no inline scripts
- [ ] Rate limit on login: 5/min/IP via Redis
- [ ] Password hashing: bcrypt cost 12
- [ ] 2FA for admin accounts (TOTP)
- [ ] All admin actions → `audit_events` table
- [ ] PII scrubbing in logs (emails, card numbers)
- [ ] SSE endpoint requires auth
- [ ] `httpOnly`, `secure`, `sameSite=strict` cookies (if using cookies)
- [ ] CSRF token for cookie-based auth (skip if JWT in header)
- [ ] Session timeout: idle 30 min → logout
- [ ] Bulk actions require typed confirmation ("CONFIRM ban 147 users")

---

## Performance

- **Cursor pagination** for large tables (never offset on >10k rows)
- **Indexed columns:** `users.tg_id`, `users.username`, `subscriptions.expires_at`, `payments.created_at`
- **DB connection pool** `api`: `pool_size=10, max_overflow=20`
- **Query cache** (Redis) for dashboard stats: 30-second TTL
- **Frontend:** `@tanstack/react-query` `staleTime: 30_000`, `refetchInterval` for live-ish pages
- **Lazy routes:** all non-dashboard pages via `React.lazy()` + Suspense
- **Bundle size target:** < 250 KB initial, < 50 KB per route chunk
- **Lighthouse mobile score target:** 90+

---

## Anti-patterns

- ❌ Serving admin panel from same domain as bot webhook — any XSS in webhook handling compromises admin. Separate subdomain.
- ❌ Shared JWT secret between bot Mini App and admin panel — rotate independently.
- ❌ Admin login without 2FA for payment operations — one phish = all money gone.
- ❌ Listing all users on page load — paginate.
- ❌ `DELETE /users/:id` without soft-delete — GDPR compliance requires audit trail of who deleted what.
- ❌ No rate limit on `/admin/users/search` — attackers enumerate user base.
- ❌ SSE without heartbeat — proxies drop idle connections after 60s.
- ❌ Broadcasts without preview — operator sends typo to 50k users.

---

## Quick-start generation

```
BotForge: admin-web
Task: admin panel for my VIP bot
Stack: React + Vite + TypeScript
Features: dashboard with stats, user management, broadcasts, audit log
Auth: Mini App (admin TGs recognized automatically)
Hosting: add to existing docker-compose
```

The skill generates: full `api/routers/admin/*`, `webapp/` project with shadcn/ui installed, JWT auth wiring, nginx config, docker-compose additions, README.
