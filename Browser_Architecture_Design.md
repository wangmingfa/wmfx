# Browser Architecture Design

> Tech Stack: Electron + TypeScript + Vite + Vue3 + WebContentsView +
> Mihomo

## 1. Goals

-   Modern desktop browser
-   Chromium-based (Electron)
-   Complete multi-tab browsing experience
-   Built-in Mihomo proxy manager
-   AI-ready architecture
-   Modular, scalable design

## 2. Recommended Monorepo Structure

``` text
browser/
├── apps/
│   ├── main/
│   └── renderer/
├── packages/
│   ├── browser-core/
│   ├── proxy/
│   ├── storage/
│   ├── history/
│   ├── bookmark/
│   ├── download/
│   ├── session/
│   ├── permission/
│   ├── extension/
│   ├── ai/
│   ├── ipc/
│   ├── shared/
│   └── common/
├── resources/
│   └── mihomo/
├── docs/
└── scripts/
```

## 3. Architecture

``` text
Electron Main
 ├── BrowserCore
 ├── WindowManager
 ├── TabManager
 ├── NavigationManager
 ├── SessionManager
 ├── DownloadManager
 ├── ProxyManager
 ├── HistoryManager
 ├── BookmarkManager
 ├── PermissionManager
 ├── ExtensionManager
 ├── AIManager
 └── IPC

Renderer(Vue)
 ├── Layout
 ├── TabBar
 ├── AddressBar
 ├── Sidebar
 ├── Browser Panels
 ├── Settings
 ├── Downloads
 └── AI Sidebar
```

## 4. Core Managers

### BrowserManager

-   Browser lifecycle
-   Window creation
-   Startup/shutdown

### WindowManager

-   Multi-window
-   Layout
-   Fullscreen
-   Restore

### TabManager

-   Create
-   Close
-   Duplicate
-   Pin
-   Mute
-   Drag
-   Restore

Each tab owns: - WebContentsView - Session - Navigation state - Loading
state - Title - Favicon - Zoom - Audio state

### NavigationManager

-   Back
-   Forward
-   Reload
-   Stop
-   Search
-   URL validation

### SessionManager

-   Default
-   Incognito
-   Workspace
-   Custom partition

### DownloadManager

-   Queue
-   Pause
-   Resume
-   Cancel
-   Progress
-   Speed
-   Notifications

### HistoryManager

-   Visit records
-   Search
-   Delete
-   Import/Export

### BookmarkManager

-   Folder
-   Search
-   Import Chrome
-   Export HTML

### PermissionManager

-   Camera
-   Microphone
-   Clipboard
-   Notification
-   Location
-   File System

## 5. Proxy (Mihomo)

Modules:

-   ProxyManager
-   MihomoManager
-   ConfigManager
-   SubscriptionManager
-   ApiClient
-   Downloader
-   HealthChecker

Responsibilities:

-   Download Mihomo binary
-   Generate config.yaml
-   Start/stop process
-   Manage subscriptions
-   Switch nodes
-   REST API integration
-   Logs
-   Traffic monitor

Flow:

``` text
Browser
    ↓
ProxyManager
    ↓
Mihomo
    ↓
127.0.0.1:7890
    ↓
Electron Session.setProxy()
```

## 6. Storage

SQLite

Tables:

-   settings
-   history
-   bookmarks
-   downloads
-   workspaces
-   ai_memory

KV Cache: - theme - window state - recent sessions

## 7. Renderer

Views

-   TitleBar
-   Toolbar
-   AddressBar
-   TabBar
-   Sidebar
-   BrowserContainer
-   DownloadPanel
-   Settings
-   AI Panel

Renderer never manipulates WebContentsView directly.

## 8. IPC

Channels:

-   browser.\*
-   tab.\*
-   proxy.\*
-   download.\*
-   history.\*
-   bookmark.\*
-   session.\*
-   ai.\*

## 9. Feature Roadmap

### Phase 1

-   Project bootstrap
-   Window
-   Tabs
-   Navigation
-   Address bar
-   Loading
-   Favicon
-   Multi-window

### Phase 2

-   Downloads
-   History
-   Bookmarks
-   DevTools
-   Print
-   PDF
-   Zoom
-   Incognito

### Phase 3

-   Mihomo
-   Subscriptions
-   Node switching
-   Traffic
-   Logs
-   Proxy rules

### Phase 4

-   Ad blocker
-   Request interception
-   Password manager
-   Workspace
-   Split view
-   Vertical tabs

### Phase 5

-   AI sidebar
-   Summarize page
-   Agent automation
-   Workflow recorder
-   MCP
-   Smart forms

## 10. Suggested Packages

-   browser-core
-   proxy
-   storage
-   session
-   history
-   bookmark
-   download
-   permission
-   extension
-   ai
-   ipc
-   shared

## 11. Principles

-   UI and business separated
-   Services isolated
-   Electron APIs wrapped in browser-core
-   IPC only between renderer and main
-   Everything testable
-   Future-proof for AI Browser

## 12. Long-term Vision

Create a browser comparable in architecture to Arc/Zen while keeping a
clean Electron + Vue ecosystem. Treat Mihomo, AI, downloads, history,
sessions, and browser core as independent modules to maximize
maintainability.
