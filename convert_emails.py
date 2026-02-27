#!/usr/bin/env python3
"""Convert email JSON files to Spark Journal entries.
Reads /tmp/emails/*.json, creates bilingual entries with executive summaries + full content."""
import json, os, re
from html import unescape

EMAILS_DIR = "/tmp/emails"
ENTRIES_FILE = "/tmp/spark-journal/data/entries.json"

# Skip these: 16 (duplicate test), 22/23/24 (already in entries.json)
SKIP = {16, 22, 23, 24}

# Email metadata: category, severity, tags, Hebrew title, Hebrew summary, exec summary
META = {
    0: {
        "id": "2026-02-27-antigravity-telegram-analysis",
        "category": "research",
        "severity": "info",
        "tags": ["antigravity", "telegram", "gemini", "proxy", "analysis"],
        "title_en": "Antigravity + Telegram — Full Analysis",
        "title_he": "Antigravity + טלגרם — ניתוח מלא",
        "summary_en": "Deep analysis of the Antigravity proxy system (free Gemini Pro via OAuth) and its integration with the Telegram bot. Covers the proxy architecture, model routing, rate limits, and how Spark uses Antigravity as a free LLM backend for image generation and text queries.",
        "summary_he": "ניתוח מעמיק של מערכת Antigravity (Gemini Pro חינמי דרך OAuth) והאינטגרציה שלה עם בוט הטלגרם. מכסה את ארכיטקטורת הפרוקסי, ניתוב מודלים, מגבלות קצב, ואיך ספארק משתמשת ב-Antigravity כ-backend חינמי ליצירת תמונות ושאילתות טקסט.",
    },
    1: {
        "id": "2026-02-27-system-status-email",
        "category": "monitoring",
        "severity": "success",
        "tags": ["status", "spark", "systems", "health-check"],
        "title_en": "Spark System Status Report — Feb 27 (Email Version)",
        "title_he": "דוח סטטוס מערכת ספארק — 27 בפברואר (גרסת אימייל)",
        "summary_en": "Comprehensive bilingual system status report sent via email. All critical systems operational: OpenClaw gateway, watchdog, health monitor, R2 backups, GitHub backups, and Telegram R2D2 bot. Includes full infrastructure map and current system versions.",
        "summary_he": "דוח סטטוס מערכת מקיף דו-לשוני שנשלח באימייל. כל המערכות הקריטיות פועלות: שער OpenClaw, כלב שמירה, מוניטור בריאות, גיבויי R2, גיבויי GitHub ובוט טלגרם R2D2. כולל מפת תשתיות מלאה וגרסאות מערכת נוכחיות.",
    },
    2: {
        "id": "2026-02-26-disk-cleanup-auto-cleanup",
        "category": "system",
        "severity": "success",
        "tags": ["disk-cleanup", "auto-cleanup", "cron", "agent-teams", "storage"],
        "title_en": "Disk Cleanup + 3-Tier Auto-Cleanup + Agent Teams Guide",
        "title_he": "ניקוי דיסק + ניקוי אוטומטי תלת-שכבתי + מדריך צוותי סוכנים",
        "summary_en": "Session report covering: 12.8GB disk cleanup identifying safe-to-delete files, building a 3-tier automated cleanup cron system with strict whitelists, and a comprehensive guide for using Claude Code agent teams (swarms) for parallel task execution.",
        "summary_he": "דוח סשן המכסה: ניקוי דיסק של 12.8GB עם זיהוי קבצים בטוחים למחיקה, בניית מערכת ניקוי אוטומטית תלת-שכבתית עם רשימות היתרים קשיחות, ומדריך מקיף לשימוש בצוותי סוכני Claude Code (swarms) להרצת משימות במקביל.",
    },
    3: {
        "id": "2026-02-26-r2d2-bot-backup-alert-control",
        "category": "features",
        "severity": "success",
        "tags": ["r2d2-bot", "telegram", "backup", "github", "alert-control", "suppress"],
        "title_en": "R2D2 Bot Live + Full Server Backup + Alert Control",
        "title_he": "בוט R2D2 חי + גיבוי שרת מלא + בקרת התראות",
        "summary_en": "Three major infrastructure improvements deployed: (1) R2D2 emergency Telegram bot as a secondary command interface, (2) full server backup system pushing to two private GitHub repos every 30 minutes, and (3) suppress.json mechanism allowing Spark to mute health alerts dynamically.",
        "summary_he": "שלושה שיפורי תשתית מרכזיים פורסו: (1) בוט טלגרם R2D2 כממשק פקודות משני, (2) מערכת גיבוי שרת מלאה שדוחפת לשני ריפוזיטוריות פרטיות ב-GitHub כל 30 דקות, (3) מנגנון suppress.json המאפשר לספארק להשתיק התראות בריאות באופן דינמי.",
    },
    4: {
        "id": "2026-02-25-server-improvements-7-of-10",
        "category": "deployment",
        "severity": "success",
        "tags": ["improvements", "auto-restart", "status-dashboard", "log-rotation", "cron"],
        "title_en": "Spark Server Improvements — 7/10 Deployed + Pipeline Fixed",
        "title_he": "שיפורי שרת ספארק — 7 מתוך 10 פורסו + צינור תוקן",
        "summary_en": "Progress report on 10 planned server improvements: 7 deployed and working including auto-restart for crashed processes, daily Telegram digest, status dashboard (status.74111147.xyz), log rotation, Smart Router fallback, and deployment pipeline. 3 items still in progress.",
        "summary_he": "דוח התקדמות על 10 שיפורי שרת מתוכננים: 7 פורסו ופועלים כולל הפעלה מחדש אוטומטית לתהליכים שקרסו, עדכון טלגרם יומי, לוח מצב (status.74111147.xyz), סיבוב לוגים, fallback של Smart Router וצינור פריסה. 3 פריטים עדיין בתהליך.",
    },
    5: {
        "id": "2026-02-25-vibe-code-news-audit-60-fixes",
        "category": "projects",
        "severity": "warning",
        "tags": ["vibe-code-news", "audit", "security", "seo", "accessibility", "performance"],
        "title_en": "Vibe Code News — Full Audit & 60+ Fixes",
        "title_he": "Vibe Code News — ביקורת מלאה ו-60+ תיקונים",
        "summary_en": "Four parallel audit agents (security, SEO, accessibility/UX, performance) scanned the vibe-code-news site and found 129 issues. 60+ fixes applied: 4 critical security fixes (mock-auth backdoor blocked), 12 high-priority accessibility fixes, SEO improvements, and bundle size reduction from 475KB to ~370KB.",
        "summary_he": "ארבעה סוכני ביקורת מקביליים (אבטחה, SEO, נגישות/UX, ביצועים) סרקו את אתר vibe-code-news ומצאו 129 בעיות. 60+ תיקונים בוצעו: 4 תיקוני אבטחה קריטיים (דלת אחורית mock-auth נחסמה), 12 תיקוני נגישות בעדיפות גבוהה, שיפורי SEO, וצמצום bundle מ-475KB ל-~370KB.",
    },
    6: {
        "id": "2026-02-25-token-optimization-12-strategies",
        "category": "research",
        "severity": "info",
        "tags": ["token-optimization", "openclaw", "cost-reduction", "context-window", "research"],
        "title_en": "OpenClaw Token Optimization — 12 Strategies Combined Report",
        "title_he": "אופטימיזציית אסימונים OpenClaw — דוח 12 אסטרטגיות משולבות",
        "summary_en": "Comprehensive research combining 4 sources (deep research, economic analysis, community strategies, Spark-specific audit) into 12 token optimization strategies for OpenClaw. Covers workspace file compression, thinking budget control, model routing economics, and deploy-site skill architecture.",
        "summary_he": "מחקר מקיף המשלב 4 מקורות (מחקר עומק, ניתוח כלכלי, אסטרטגיות קהילתיות, ביקורת ספציפית לספארק) ל-12 אסטרטגיות אופטימיזציה של אסימונים ל-OpenClaw. מכסה דחיסת קבצי workspace, בקרת תקציב חשיבה, כלכלת ניתוב מודלים וארכיטקטורת הכישרון deploy-site.",
    },
    7: {
        "id": "2026-02-25-system-audit-14-point",
        "category": "monitoring",
        "severity": "success",
        "tags": ["audit", "health-check", "docker", "cron", "disk-space"],
        "title_en": "Spark System Audit — 14-Point Checkup",
        "title_he": "ביקורת מערכת ספארק — בדיקה 14 נקודות",
        "summary_en": "Comprehensive 14-point system health assessment: all 5 Docker containers running, 4 cron jobs active, disk usage at 62%, all monitoring systems operational. Minor items flagged: disk space could use cleanup, WA daemon still down from rate limit.",
        "summary_he": "הערכת בריאות מערכת מקיפה 14 נקודות: כל 5 קונטיינרי Docker רצים, 4 משימות cron פעילות, שימוש בדיסק 62%, כל מערכות הניטור פועלות. פריטים קלים שסומנו: מקום בדיסק דורש ניקוי, WA daemon עדיין מושבת מ-rate limit.",
    },
    8: {
        "id": "2026-02-25-openclaw-update-221-to-224",
        "category": "system",
        "severity": "success",
        "tags": ["openclaw", "upgrade", "version-update"],
        "title_en": "OpenClaw Version Update 2.21→2.24",
        "title_he": "עדכון גרסת OpenClaw 2.21→2.24",
        "summary_en": "OpenClaw updated from v2026.2.21-2 to v2026.2.24 on Spark remote. 143 packages added, 8 removed, 68 changed. Container restarted, all processes verified running (openclaw, uvicorn, socat). Key changes include stability improvements and bug fixes.",
        "summary_he": "OpenClaw עודכן מגרסה v2026.2.21-2 לגרסה v2026.2.24 על Spark. 143 חבילות נוספו, 8 הוסרו, 68 שונו. קונטיינר הופעל מחדש, כל התהליכים אומתו (openclaw, uvicorn, socat). שינויים עיקריים כוללים שיפורי יציבות ותיקוני באגים.",
    },
    9: {
        "id": "2026-02-25-prompt-cost-optimization",
        "category": "research",
        "severity": "info",
        "tags": ["prompt-optimization", "cost-reduction", "workspace", "context-window", "research"],
        "title_en": "OpenClaw Prompt Cost Optimization — Research",
        "title_he": "אופטימיזציית עלויות פרומפט OpenClaw — מחקר",
        "summary_en": "Research into OpenClaw's workspace file costs: TOOLS.md (27KB), MEMORY.md (13KB), AGENTS.md (10KB), SOUL.md (6KB) — total ~57KB loaded every session. Analysis of context compression strategies, thinking budget impact, and model-specific cost differences between GLM-5 and Groq 70B.",
        "summary_he": "מחקר על עלויות קבצי workspace של OpenClaw: TOOLS.md (27KB), MEMORY.md (13KB), AGENTS.md (10KB), SOUL.md (6KB) — סה\"כ ~57KB נטענים בכל סשן. ניתוח אסטרטגיות דחיסת הקשר, השפעת תקציב חשיבה, והבדלי עלויות בין GLM-5 ל-Groq 70B.",
    },
    10: {
        "id": "2026-02-25-whatsapp-incident-report",
        "category": "monitoring",
        "severity": "warning",
        "tags": ["whatsapp", "incident", "rate-limit", "baileys", "wa-daemon"],
        "title_en": "WhatsApp Incident Report — Rate Limited & Down",
        "title_he": "דוח תקרית WhatsApp — מוגבל קצב ומושבת",
        "summary_en": "WhatsApp connection via Baileys was rate-limited during pairing attempts, causing the wa_daemon.js to fail. The daemon was renamed to .bak to prevent restart loops. Full incident timeline, root cause analysis, and recovery plan documented.",
        "summary_he": "חיבור WhatsApp דרך Baileys הוגבל בקצב במהלך ניסיונות חיבור, מה שגרם ל-wa_daemon.js להיכשל. ה-daemon שונה ל-.bak כדי למנוע לולאות הפעלה מחדש. ציר זמן מלא של התקרית, ניתוח שורש הבעיה ותוכנית שחזור מתועדים.",
    },
    11: {
        "id": "2026-02-25-r2-backup-fixed-health-monitor",
        "category": "monitoring",
        "severity": "success",
        "tags": ["r2-backup", "wrangler", "health-monitor", "cron", "cloudflare"],
        "title_en": "R2 Backup Fixed + Health Monitor Live",
        "title_he": "גיבוי R2 תוקן + מוניטור בריאות חי",
        "summary_en": "Two critical fixes: (1) R2 backup script was completely broken because Wrangler 4.67 defaults to local R2 mode — fixed by adding --remote flag. (2) Hash cache was saving on failed uploads, masking the problem. Health monitor deployed and running on cron */5.",
        "summary_he": "שני תיקונים קריטיים: (1) סקריפט גיבוי R2 היה שבור לחלוטין כי Wrangler 4.67 ברירת מחדל למצב R2 מקומי — תוקן על ידי הוספת דגל --remote. (2) מטמון hash שמר גם בהעלאות כושלות, מה שהסתיר את הבעיה. מוניטור בריאות פורס ורץ על cron */5.",
    },
    12: {
        "id": "2026-02-24-lovable-portfolio-prompts",
        "category": "research",
        "severity": "info",
        "tags": ["lovable", "portfolio", "prompts", "design", "ai-tools"],
        "title_en": "10 Lovable Portfolio Prompts — Complete Collection",
        "title_he": "10 פרומפטים לפורטפוליו Lovable — אוסף מלא",
        "summary_en": "Complete collection of 10 detailed prompts for building portfolio websites using Lovable (AI web builder). Each prompt includes specific design requirements, sections, animations, and responsive layout instructions. Covers styles from minimalist to cyberpunk to editorial.",
        "summary_he": "אוסף מלא של 10 פרומפטים מפורטים לבניית אתרי פורטפוליו באמצעות Lovable (בונה אתרים AI). כל פרומפט כולל דרישות עיצוב ספציפיות, סקשנים, אנימציות והוראות תצוגה רספונסיבית. מכסה סגנונות ממינימליסטי ועד סייברפאנק ועד עיתונאי.",
    },
    13: {
        "id": "2026-02-24-vibe-code-news-performance-session",
        "category": "projects",
        "severity": "info",
        "tags": ["vibe-code-news", "performance", "next-js", "supabase", "optimization"],
        "title_en": "Vibe Code News — Performance & Full Stack Optimization Session",
        "title_he": "Vibe Code News — סשן אופטימיזציה של ביצועים ו-Full Stack",
        "summary_en": "Full session report on optimizing the Vibe Code News app: Next.js page load improvements, Supabase query optimization, build size reduction, component-level code splitting, and admin dashboard performance. Includes before/after metrics and implementation details.",
        "summary_he": "דוח סשן מלא על אופטימיזציה של אפליקציית Vibe Code News: שיפורי טעינת דף Next.js, אופטימיזציית שאילתות Supabase, צמצום גודל build, פיצול קוד ברמת רכיב וביצועי לוח מנהל. כולל מדדי לפני/אחרי ופרטי מימוש.",
    },
    14: {
        "id": "2026-02-24-trae-admin-phase-2",
        "category": "projects",
        "severity": "success",
        "tags": ["trae", "admin", "comments", "moderation", "cleanup"],
        "title_en": "TRAE Admin — Phase 2: Comments, Reports, Cleanup",
        "title_he": "TRAE אדמין — שלב 2: תגובות, דוחות, ניקוי",
        "summary_en": "Phase 2 of TRAE admin dashboard complete: comment moderation panel with full CRUD API (GET/PATCH/DELETE), stats cards, status filter tabs, and scaffolding cleanup reducing build size by 25KB to 365KB.",
        "summary_he": "שלב 2 של לוח המנהל של TRAE הושלם: פאנל ניהול תגובות עם API מלא (GET/PATCH/DELETE), כרטיסי סטטיסטיקה, טאבי סינון סטטוס וניקוי scaffolding שצמצם את גודל ה-build ב-25KB ל-365KB.",
    },
    15: {
        "id": "2026-02-24-trae-analytics-rewired",
        "category": "projects",
        "severity": "success",
        "tags": ["trae", "analytics", "supabase", "dashboard", "real-data"],
        "title_en": "TRAE Analytics — Dashboard Rewired to Real Supabase Data",
        "title_he": "TRAE אנליטיקס — לוח בקרה חובר לנתוני Supabase אמיתיים",
        "summary_en": "All 4 admin analytics API routes rewired from fake/random data to real Supabase tables: analytics_events, performance_metrics, page views, and user sessions. Zero mock data remaining in the backend.",
        "summary_he": "כל 4 נתיבי API של אנליטיקס האדמין חוברו מנתונים מזויפים/רנדומליים לטבלאות Supabase אמיתיות: analytics_events, performance_metrics, צפיות בדפים וסשנים. אפס נתוני mock נותרו ב-backend.",
    },
    17: {
        "id": "2026-02-24-trae-supabase-assessment",
        "category": "projects",
        "severity": "info",
        "tags": ["trae", "supabase", "assessment", "database", "honest-review"],
        "title_en": "TRAE Admin & Supabase — Honest Assessment",
        "title_he": "TRAE אדמין ו-Supabase — הערכה כנה",
        "summary_en": "Honest assessment of TRAE's Supabase integration status: what's actually connected (Articles, News Briefs, Views) vs what's still using mock data. Identifies gaps and recommends next steps for full data integration.",
        "summary_he": "הערכה כנה של מצב האינטגרציה של TRAE עם Supabase: מה באמת מחובר (מאמרים, תקצירי חדשות, צפיות) מול מה שעדיין משתמש בנתוני mock. מזהה פערים וממליץ על צעדים הבאים לאינטגרציית נתונים מלאה.",
    },
    18: {
        "id": "2026-02-24-trae-performance-results",
        "category": "projects",
        "severity": "success",
        "tags": ["trae", "performance", "build", "optimization", "vercel"],
        "title_en": "TRAE Performance Optimization — Build Results",
        "title_he": "TRAE אופטימיזציית ביצועים — תוצאות Build",
        "summary_en": "TRAE performance optimization build results: 85 pages generated successfully, shared JS reduced to 352KB (vendor: 336KB). Page-level JS analysis and build metrics showing improvements across the board.",
        "summary_he": "תוצאות build של אופטימיזציית ביצועים TRAE: 85 דפים נוצרו בהצלחה, JS משותף צומצם ל-352KB (vendor: 336KB). ניתוח JS ברמת דף ומדדי build מראים שיפורים בכל הקטגוריות.",
    },
    19: {
        "id": "2026-02-24-trae-performance-plan",
        "category": "future-plans",
        "severity": "info",
        "tags": ["trae", "performance", "plan", "next-js", "optimization"],
        "title_en": "TRAE Performance Plan — Make The Site Load Faster",
        "title_he": "תוכנית ביצועים TRAE — להפוך את האתר למהיר יותר",
        "summary_en": "Comprehensive performance improvement plan for the TRAE site covering: code splitting strategies, image optimization, lazy loading, API route optimization, caching strategies, and Core Web Vitals improvement targets. Prioritized by impact.",
        "summary_he": "תוכנית שיפור ביצועים מקיפה לאתר TRAE המכסה: אסטרטגיות פיצול קוד, אופטימיזציית תמונות, טעינה עצלה, אופטימיזציית נתיבי API, אסטרטגיות מטמון ויעדי שיפור Core Web Vitals. מתועדפת לפי השפעה.",
    },
    20: {
        "id": "2026-02-24-trae-jules-fix-smart-router",
        "category": "projects",
        "severity": "info",
        "tags": ["trae", "jules", "security-fixes", "smart-router", "architecture"],
        "title_en": "TRAE — Jules Fix Instructions + Smart Router Architecture",
        "title_he": "TRAE — הוראות תיקון Jules + ארכיטקטורת Smart Router",
        "summary_en": "Development reference containing: (1) Detailed fix instructions for Jules PR #4 security issues on vibe-code-news, and (2) Complete Smart Router architecture documentation explaining the 3-tier model routing system (Tier 1 dispatchers → Tier 2 responders → Chairman synthesis).",
        "summary_he": "מסמך עזר לפיתוח המכיל: (1) הוראות תיקון מפורטות לבעיות אבטחה ב-PR #4 של Jules על vibe-code-news, ו-(2) תיעוד ארכיטקטורת Smart Router מלא המסביר את מערכת ניתוב המודלים התלת-שכבתית (Tier 1 dispatchers → Tier 2 responders → Chairman synthesis).",
    },
    21: {
        "id": "2026-02-24-trae-upgrade-plan-jules",
        "category": "future-plans",
        "severity": "info",
        "tags": ["trae", "upgrade-plan", "jules", "review", "vibe-code-news"],
        "title_en": "TRAE Vibe Code News — Upgrade Plan for Jules + Review",
        "title_he": "TRAE Vibe Code News — תוכנית שדרוג עבור Jules + סקירה",
        "summary_en": "Upgrade plan for the vibe-code-news app to be implemented by Jules AI agent: stack modernization, security hardening, performance optimization, and feature additions. Includes code review findings and prioritized implementation order.",
        "summary_he": "תוכנית שדרוג לאפליקציית vibe-code-news ליישום על ידי סוכן AI Jules: מודרניזציית מחסנית, הקשחת אבטחה, אופטימיזציית ביצועים ותוספות תכונות. כולל ממצאי סקירת קוד וסדר מימוש מתועדף.",
    },
    25: {
        "id": "2026-02-22-full-session-recap-8h",
        "category": "system",
        "severity": "info",
        "tags": ["session-recap", "8-hours", "bilingual", "comprehensive"],
        "title_en": "Full Session Recap — 8 Hours (Feb 22)",
        "title_he": "סיכום סשן מלא — 8 שעות (22 בפברואר)",
        "summary_en": "Complete bilingual recap of the ~8-hour session on Feb 22. Covers: OpenClaw gateway fix, Telegram bot going rogue (voice note + whisper install), Smart Router model switch (GLM-5 → council/router/auto), Twitter following list scrape (2,244 accounts), and all config changes.",
        "summary_he": "סיכום דו-לשוני מלא של סשן ~8 שעות ב-22 בפברואר. מכסה: תיקון שער OpenClaw, בוט טלגרם שהשתולל (הודעה קולית + התקנת whisper), החלפת מודל Smart Router (GLM-5 → council/router/auto), גריפת רשימת עוקבים בטוויטר (2,244 חשבונות) וכל שינויי הקונפיגורציה.",
    },
    26: {
        "id": "2026-02-22-full-architecture-doc",
        "category": "system",
        "severity": "info",
        "tags": ["architecture", "documentation", "infrastructure", "comprehensive"],
        "title_en": "SPARK_FULL_ARCHITECTURE.md — Complete System Documentation",
        "title_he": "SPARK_FULL_ARCHITECTURE.md — תיעוד מערכת מלא",
        "summary_en": "Complete system architecture documentation for the entire Spark infrastructure. Covers: server/container map, Docker Compose layout, all ports and services, model routing, recovery systems, backup architecture, Telegram/WhatsApp integration, Cloudflare infrastructure, and tool inventory.",
        "summary_he": "תיעוד ארכיטקטורת מערכת מלא לכל תשתית ספארק. מכסה: מפת שרת/קונטיינר, תצורת Docker Compose, כל הפורטים והשירותים, ניתוב מודלים, מערכות שחזור, ארכיטקטורת גיבוי, אינטגרציית טלגרם/WhatsApp, תשתית Cloudflare ומלאי כלים.",
    },
    27: {
        "id": "2026-02-22-session-debug-todo",
        "category": "system",
        "severity": "warning",
        "tags": ["debug", "todo", "glm-5", "thinking-budget", "voice", "smart-router"],
        "title_en": "Session Debug & TODO — Feb 22 (6 Hours)",
        "title_he": "דיבאג סשן ומשימות — 22 בפברואר (6 שעות)",
        "summary_en": "6-hour debug session report: fixed OpenClaw gateway not responding, found and fixed the Telegram bot going rogue (thinkingDefault high → low, TOOLS.md missing STT/TTS docs), switched Smart Router primary model, scraped Twitter following list. Includes TODO list of 10 items not yet tested.",
        "summary_he": "דוח סשן דיבאג של 6 שעות: תוקן שער OpenClaw שלא הגיב, אותרה ותוקנה בעיית בוט טלגרם שהשתולל (thinkingDefault high → low, תיעוד STT/TTS חסר ב-TOOLS.md), הוחלף מודל ראשי של Smart Router, נגרפה רשימת עוקבי טוויטר. כולל רשימת TODO של 10 פריטים שטרם נבדקו.",
    },
    28: {
        "id": "2026-02-22-twitter-following-list",
        "category": "features",
        "severity": "success",
        "tags": ["twitter", "scraping", "apify", "data", "nadavfux"],
        "title_en": "Twitter Following List (@nadavfux) — 2,244 Accounts",
        "title_he": "רשימת עוקבים בטוויטר (@nadavfux) — 2,244 חשבונות",
        "summary_en": "Complete Twitter following list for @nadavfux scraped via Apify: 2,244 unique accounts across 2 scrape sessions. 706 blue-verified (X Premium), 348 accounts with 1M+ followers, 1,058 with 100K+. CSV and JSON files saved, sent via WhatsApp, email, and Telegram. Cost: $0 (free tier).",
        "summary_he": "רשימת עוקבים מלאה בטוויטר של @nadavfux שנגרפה דרך Apify: 2,244 חשבונות ייחודיים בשני מחזורי גריפה. 706 מאומתי כחול (X Premium), 348 חשבונות עם 1M+ עוקבים, 1,058 עם 100K+. קובצי CSV ו-JSON נשמרו, נשלחו דרך WhatsApp, אימייל וטלגרם. עלות: $0.",
    },
    29: {
        "id": "2026-02-21-logan-integration-plan",
        "category": "future-plans",
        "severity": "info",
        "tags": ["logan", "whatsapp", "telegram", "group-management", "plan"],
        "title_en": "Logan Integration into Spark — Detailed Plan",
        "title_he": "שילוב Logan בספארק — תוכנית מפורטת",
        "summary_en": "Detailed plan for integrating Logan (WhatsApp + Telegram group management system) into Spark. Covers: architecture design, message routing between channels, group admin features, moderation capabilities, scheduled messages, and analytics dashboard. Not yet implemented — awaiting prioritization.",
        "summary_he": "תוכנית מפורטת לשילוב Logan (מערכת ניהול קבוצות WhatsApp + טלגרם) בספארק. מכסה: עיצוב ארכיטקטורה, ניתוב הודעות בין ערוצים, תכונות ניהול קבוצות, יכולות מודרציה, הודעות מתוזמנות ולוח בקרת אנליטיקס. טרם יושם — ממתין לתעדוף.",
    },
    30: {
        "id": "2026-02-20-spark-update-report-2",
        "category": "monitoring",
        "severity": "success",
        "tags": ["update", "gemini-cli", "extensions", "capabilities"],
        "title_en": "Spark Agent — Full Update Report #2",
        "title_he": "סוכן ספארק — דוח עדכון מלא #2",
        "summary_en": "Second update report: Gemini CLI fully authenticated with Google Pro account, 16 extensions installed. Spark's AI capabilities significantly expanded. Covers: Gemini CLI setup, extension list, tested capabilities, and integration with existing tools.",
        "summary_he": "דוח עדכון שני: Gemini CLI אומת במלואו עם חשבון Google Pro, 16 הרחבות הותקנו. יכולות ה-AI של ספארק הורחבו משמעותית. מכסה: הגדרת Gemini CLI, רשימת הרחבות, יכולות שנבדקו ואינטגרציה עם כלים קיימים.",
    },
    31: {
        "id": "2026-02-20-spark-initial-status-report",
        "category": "monitoring",
        "severity": "success",
        "tags": ["status", "tools", "initial-setup", "capabilities", "todo"],
        "title_en": "Spark Agent — Initial Full Status Report",
        "title_he": "סוכן ספארק — דוח סטטוס ראשוני מלא",
        "summary_en": "First comprehensive status report of all Spark tools and capabilities: AgentMail, Cloudflare, SerpAPI, Jina MCP, n8n, Apify, Smart Router, Antigravity, OpenCode, Gemini wrapper, yfinance, CCXT, Playwright, Crawl4AI. 10 of 12 tests passed. TODO list of items needing user action (Gemini CLI, Alpaca, WhatsApp, Google Sheets).",
        "summary_he": "דוח סטטוס מקיף ראשון של כל הכלים והיכולות של ספארק: AgentMail, Cloudflare, SerpAPI, Jina MCP, n8n, Apify, Smart Router, Antigravity, OpenCode, Gemini wrapper, yfinance, CCXT, Playwright, Crawl4AI. 10 מתוך 12 בדיקות עברו. רשימת TODO של פריטים הדורשים פעולת משתמש.",
    },
}


def strip_html(html_str):
    """Strip HTML tags and get plain text."""
    text = re.sub(r'<style[^>]*>.*?</style>', '', html_str, flags=re.DOTALL)
    text = re.sub(r'<script[^>]*>.*?</script>', '', text, flags=re.DOTALL)
    text = re.sub(r'<[^>]+>', ' ', text)
    text = re.sub(r'\s+', ' ', text).strip()
    return unescape(text)


def extract_exec_summary(html_str, max_chars=500):
    """Extract first meaningful section from HTML as executive summary text."""
    text = strip_html(html_str)
    # Take first ~500 chars, end at sentence boundary
    if len(text) <= max_chars:
        return text
    cut = text[:max_chars]
    # Find last period or newline
    last_period = cut.rfind('.')
    if last_period > 200:
        return cut[:last_period + 1]
    return cut + '...'


def build_details(email_html, exec_summary_en, exec_summary_he, is_html=True):
    """Build details_en and details_he with exec summary on top + full content below."""
    # Build English details
    details_en = f'<div class="exec-summary">\n'
    details_en += f'<h3>Executive Summary</h3>\n'
    details_en += f'<p>{exec_summary_en}</p>\n'
    details_en += f'</div>\n<hr class="section-divider">\n'
    details_en += f'<h3>Full Report</h3>\n'
    if is_html:
        # Strip wrapping <html><body> and style blocks for embedding
        content = re.sub(r'<html[^>]*>', '', email_html)
        content = re.sub(r'</html>', '', content)
        content = re.sub(r'<body[^>]*>', '', content)
        content = re.sub(r'</body>', '', content)
        content = re.sub(r'<head>.*?</head>', '', content, flags=re.DOTALL)
        # Strip inline style blocks (they'd conflict with journal CSS)
        content = re.sub(r'<style[^>]*>.*?</style>', '', content, flags=re.DOTALL)
        details_en += content.strip()
    else:
        # Markdown/text content — wrap in pre
        details_en += f'<div class="email-content">{email_html}</div>'

    # Build Hebrew details (summary in Hebrew, content stays as-is since most emails are English)
    details_he = f'<div class="exec-summary">\n'
    details_he += f'<h3>תקציר מנהלים</h3>\n'
    details_he += f'<p>{exec_summary_he}</p>\n'
    details_he += f'</div>\n<hr class="section-divider">\n'
    details_he += f'<h3>דוח מלא</h3>\n'
    if is_html:
        details_he += content.strip()
    else:
        details_he += f'<div class="email-content">{email_html}</div>'

    return details_en, details_he


def main():
    # Load existing entries
    with open(ENTRIES_FILE, 'r') as f:
        data = json.load(f)

    existing_ids = {e['id'] for e in data['entries']}

    # Add new categories
    data['categories']['research'] = {"he": "מחקר ושאלות", "en": "Research & Questions"}
    data['categories']['future-plans'] = {"he": "תוכניות עתידיות", "en": "Future Plans"}
    data['categories']['projects'] = {"he": "פרויקטים", "en": "Projects"}

    new_entries = []

    # Process each email
    for i in range(32):
        if i in SKIP:
            print(f"Skipping email {i:02d} (duplicate/exists)")
            continue

        if i not in META:
            print(f"Skipping email {i:02d} (no metadata defined)")
            continue

        meta = META[i]

        # Skip if already exists
        if meta['id'] in existing_ids:
            print(f"Skipping email {i:02d} — entry {meta['id']} already exists")
            continue

        # Find the email file
        email_file = None
        for fn in os.listdir(EMAILS_DIR):
            if fn.startswith(f"{i:02d}_"):
                email_file = os.path.join(EMAILS_DIR, fn)
                break

        if not email_file:
            print(f"Email file not found for {i:02d}")
            continue

        with open(email_file, 'r') as f:
            email_data = json.load(f)

        email_html = email_data.get('html', '')
        email_date = email_data.get('date', '')
        email_subject = email_data.get('subject', '')

        # Determine if content is HTML or plain text/markdown
        is_html = '<' in email_html and '>' in email_html and (
            '<h' in email_html.lower() or '<p' in email_html.lower() or
            '<div' in email_html.lower() or '<table' in email_html.lower()
        )

        # Use summary as executive summary (it's already a concise version)
        exec_summary_en = meta['summary_en']
        exec_summary_he = meta['summary_he']

        details_en, details_he = build_details(
            email_html, exec_summary_en, exec_summary_he, is_html
        )

        entry = {
            "id": meta['id'],
            "date": email_date if email_date else f"{meta['id'][:10]}T00:00:00Z",
            "category": meta['category'],
            "severity": meta['severity'],
            "tags": meta['tags'],
            "title_en": meta['title_en'],
            "title_he": meta['title_he'],
            "summary_en": meta['summary_en'],
            "summary_he": meta['summary_he'],
            "details_en": details_en,
            "details_he": details_he,
            "related": [],
            "source_email": os.path.basename(email_file)
        }

        new_entries.append(entry)
        print(f"Created entry: {meta['id']} ({meta['category']}) from {os.path.basename(email_file)}")

    # Add new entries to data
    data['entries'].extend(new_entries)

    # Sort all entries by date descending
    data['entries'].sort(key=lambda e: e.get('date', ''), reverse=True)

    # Set related entries based on categories and dates
    # Group by date for cross-referencing
    by_date = {}
    for e in data['entries']:
        d = e['date'][:10]
        by_date.setdefault(d, []).append(e['id'])

    for e in data['entries']:
        d = e['date'][:10]
        siblings = [eid for eid in by_date.get(d, []) if eid != e['id']]
        if siblings and not e.get('related'):
            e['related'] = siblings[:3]

    # Write updated entries
    with open(ENTRIES_FILE, 'w') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print(f"\nDone! Total entries: {len(data['entries'])} ({len(new_entries)} new)")
    print(f"Categories: {list(data['categories'].keys())}")


if __name__ == '__main__':
    main()
