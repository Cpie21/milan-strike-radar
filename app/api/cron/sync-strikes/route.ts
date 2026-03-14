import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import { createClient } from '@supabase/supabase-js';

// ── Types ──────────────────────────────────────────────────────────────────────

type StrikeStatus = 'CONFIRMED' | 'CANCELLED' | 'REQUIRES_DETAIL' | 'UNCERTAIN';

interface StrikeWindow {
    start: string;
    end: string;
}

interface StrikeRecord {
    date: string; // YYYY-MM-DD
    category: 'TRAIN' | 'SUBWAY' | 'BUS' | 'AIRPORT';
    provider: string; // "Trenord", "ATM", "ENAV", etc
    status: StrikeStatus;
    display_time: string; // "07:00 - 10:00" or "全天 24小时"
    duration_hours: string; // "4小时", "24小时"
    strike_windows: StrikeWindow[];
    guarantee_windows: StrikeWindow[];
    affected_lines: string[];
    region: string;
    data_source?: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const MIT_URL = 'http://scioperi.mit.gov.it/mit2/public/scioperi';

const REGION_KEYWORDS: Record<string, string[]> = {
    MILANO: ['lombardia', 'milano'],
    ROMA: ['lazio', 'roma'],
    TORINO: ['piemonte', 'torino'],
};

const NATIONAL_KEYWORDS = ['nazionale', 'plurisettoriale'];

const TRANSPORT_SECTORS = [
    'trasporto pubblico',
    'ferroviario',
    'aereo',
];

// ── Phase 1: Fetch & Filter ───────────────────────────────────────────────────

interface RawStrikeRow {
    date: string;
    provider: string;
    duration: string;
    region: string;
    sector: string;
    modalita: string;
    note: string;
}

async function fetchAndFilter(): Promise<RawStrikeRow[]> {
    const html = await fetch(MIT_URL, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MilanStrikeBot/1.0)' },
        next: { revalidate: 0 },
    }).then((r) => {
        if (!r.ok) throw new Error(`MIT fetch failed: ${r.status}`);
        return r.text();
    });

    const $ = cheerio.load(html);
    const rows: RawStrikeRow[] = [];

    // The MIT table has no consistent id; find the main data table by scanning.
    // Rows typically have: date | provider | sector | region | duration | modalita | note
    $('table tr').each((_, tr) => {
        const cells = $(tr).find('td');
        if (cells.length < 5) return;

        // Try to extract fields - column positions may vary; use text heuristics
        const texts = cells.map((_, td) => $(td).text().trim()).get();

        // Find which column looks like a date (dd/mm/yyyy)
        // Note: The HTML has multiple dates. The first date is usually at idx 1.
        const dateCol = texts.findIndex((t) => /^\d{2}\/\d{2}\/\d{4}/.test(t));
        if (dateCol === -1) return;

        // Based on test run, columns are:
        // 1: Start Date, 2: End Date, 3: Sector/Union, 4: Macro Sector
        // 5: Provider/Duration text, 6: Modalita, 7: Level (Nazionale/Locale), 
        // 8: Note/Modalita2, 9: Date, 10: Region, 11: City

        const raw: Partial<RawStrikeRow> = {
            date: texts[dateCol]?.trim() ?? '',
            provider: texts[dateCol + 4]?.trim() ?? '', // Index 5 - provider string is usually here
            sector: texts[dateCol + 3]?.trim() ?? '', // Index 4 - macro sector
            region: (texts[dateCol + 9] + ' ' + (texts[dateCol + 10] ?? '')).trim(), // Index 10 + 11
            duration: texts[dateCol + 5]?.trim() ?? '', // Index 6
            modalita: texts[dateCol + 7]?.trim() ?? '', // Index 8
            note: texts[dateCol + 6]?.trim() ?? '', // Index 7 (Nazionale/Locale)
        };

        // Filter: region must be Milano/Roma/Torino, unless it's national/plurisettoriale
        const regionLow = raw.region?.toLowerCase().trim() ?? '';
        const levelLow = raw.note?.toLowerCase().trim() ?? ''; // This holds Nazionale/Locale
        const isNational = NATIONAL_KEYWORDS.some((k) => levelLow.includes(k));
        let regionTag: string | null = null;
        if (isNational) {
            regionTag = 'NATIONAL';
        } else {
            for (const [tag, keywords] of Object.entries(REGION_KEYWORDS)) {
                if (keywords.some((kw) => regionLow.includes(kw))) {
                    regionTag = tag;
                    break;
                }
            }
        }
        if (!regionTag) return;
        raw.region = regionTag;

        // Filter: sector must be related to public / rail / air transport
        const sectorLow = raw.sector?.toLowerCase().trim() ?? '';
        const isTransport = TRANSPORT_SECTORS.some((s) => sectorLow.includes(s));
        if (!isTransport) return;

        rows.push(raw as RawStrikeRow);
    });

    return rows;
}

// ── Phase 2: Data Transformation ─────────────────────────────────────────────

function parseItalianDate(dateStr: string): string {
    const [dd, mm, yyyy] = dateStr.split('/');
    if (!dd || !mm || !yyyy) return dateStr;
    return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
}

async function translateText(text: string): Promise<string> {
    if (!text || text.trim().length === 0) return text;
    try {
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=zh-CN&dt=t&q=${encodeURIComponent(text)}`;
        const res = await fetch(url);
        const json = await res.json();
        if (json && json[0] && json[0][0] && json[0][0][0]) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let translated = json[0].map((s: any) => s[0]).join('');
            translated = translated.replace(/航空地勤和飞行人员/g, '地勤与飞行人员');
            translated = translated.replace(/地面及飞行人员/g, '地勤与飞行人员');
            translated = translated.replace(/地面和飞行人员/g, '地勤与飞行人员');
            translated = translated.replace(/的工作人员/g, '人员');
            translated = translated.replace(/的人员/g, '人员');
            return translated;
        }
    } catch (e) {
        console.error("Translation failed for", text, e);
    }
    return text;
}

async function normalizeProvider(raw: string): Promise<string> {
    const upper = raw.toUpperCase();
    if (upper.includes("ATM")) return "ATM";
    if (upper.includes("TRENORD")) return "Trenord";
    if (upper.includes("TRENITALIA")) return "Trenitalia";
    if (upper.includes("ITALO")) return "Italo";
    if (upper.includes("SEA") || upper.includes("ENAV")) return "ENAV / SEA";

    // Clean common Italian acronyms before translating
    let toTranslate = upper;
    toTranslate = toTranslate.replace(/SOC\. /g, '');
    toTranslate = toTranslate.replace(/SOC\./g, '');
    toTranslate = toTranslate.replace(/S\.P\.A\./g, '');
    toTranslate = toTranslate.replace(/S\.R\.L\./g, '');
    toTranslate = toTranslate.replace(/S\.C\.A\.R\.L\./g, '');
    toTranslate = toTranslate.replace(/ PERSONALE /g, '');
    toTranslate = toTranslate.replace(/^PERSONALE /g, '');
    toTranslate = toTranslate.replace(/NAVIGANTE /g, '');
    toTranslate = toTranslate.replace(/ DI TERRA E DI VOLO /g, '');
    toTranslate = toTranslate.replace(/ DI VOLO /g, '');
    toTranslate = toTranslate.replace(/ DI TERRA /g, '');
    toTranslate = toTranslate.trim();

    return translateText(toTranslate);
}

function resolveCategory(provider: string, sector: string): 'TRAIN' | 'SUBWAY' | 'BUS' | 'AIRPORT' {
    const p = provider.toLowerCase();
    const s = sector.toLowerCase();
    if (p.includes("atm")) return 'SUBWAY'; // Defaulting ATM to subway; we could use BUS if needed but SUBWAY represents urban PT
    if (p.includes("trenord") || p.includes("trenitalia") || p.includes("italo") || s.includes("ferrov")) return 'TRAIN';
    if (p.includes("sea") || p.includes("enav") || p.includes("aeroport") || s.includes("aereo")) return 'AIRPORT';
    return 'BUS';
}

function extractAffectedLines(note: string): string[] {
    const keywords = ['Linate', 'Malpensa', 'Bergamo', 'M1', 'M2', 'M3', 'M4', 'M5', 'Trenord', 'Trenitalia'];
    const found = keywords.filter((kw) => note.toLowerCase().includes(kw.toLowerCase()));
    return found.length > 0 ? found : ['全部线路'];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function injectGuaranteeWindows(category: string, dateIso: string, timeInfo: any): StrikeWindow[] {
    const d = new Date(dateIso);
    const isWeekend = d.getDay() === 0 || d.getDay() === 6;

    if (category === 'AIRPORT') {
        const isFullDay = timeInfo.hours === '24小时' || (timeInfo.windows.length === 1 && timeInfo.windows[0].start === '00:00' && timeInfo.windows[0].end === '24:00');
        // If it's a 24-hour strike, we MUST enforce the ENAC guaranteed flights windows
        if (isFullDay) {
            return [
                { start: "07:00", end: "10:00" },
                { start: "18:00", end: "21:00" }
            ];
        }
    }

    if (category === 'TRAIN') {
        if (isWeekend) return []; // No guarantee windows on weekends/holidays per normal rules (though variations exist)
        return [
            { start: "06:00", end: "09:00" },
            { start: "18:00", end: "21:00" }
        ];
    }
    if (category === 'SUBWAY' || category === 'BUS') {
        return [
            { start: "00:00", end: "08:45" },
            { start: "15:00", end: "18:00" }
        ];
    }
    return [];
}

/**
 * Parses raw Italian text (e.g. "24 ORE", "4 ORE: DALLE 09.00 ALLE 13.00")
 * into explicit hours and a normalized strike windows array.
 */
function parseTimeWindows(durationRaw: string, modalita: string, note: string): { hours: string, windows: StrikeWindow[], display: string } {
    const combined = `${durationRaw} ${modalita} ${note}`.toUpperCase();
    let hours = "部分时段";
    const windows: StrikeWindow[] = [];

    // Check for 24 ORE
    if (combined.includes('24 ORE') || combined.includes('INTERO TURNO')) {
        hours = "24小时";
        windows.push({ start: "00:00", end: "24:00" });
    } else {
        // Try to match exact hours (e.g. "4 ORE", "8 ORE")
        const hourMatch = combined.match(/(\d+)\s*ORE/);
        if (hourMatch) {
            hours = `${hourMatch[1]}小时`;
        }

        // Try to find specific times "DALLE 09.00 ALLE 13.00"
        const timeRegex = /DALLE\s+(\d{1,2})[\.\:](\d{2})\s+ALLE\s+(\d{1,2})[\.\:](\d{2})/g;
        let match;
        while ((match = timeRegex.exec(combined)) !== null) {
            const startH = match[1].padStart(2, '0');
            const startM = match[2];
            const endH = match[3].padStart(2, '0');
            const endM = match[4];
            windows.push({ start: `${startH}:${startM}`, end: `${endH}:${endM}` });
        }
    }

    // Default to unknown 24h risk if absolutely nothing could be resolved
    if (windows.length === 0) {
        windows.push({ start: "00:00", end: "24:00" });
    }

    // Sort windows
    windows.sort((a, b) => a.start.localeCompare(b.start));

    // Construct pretty display time
    const display = windows.length === 1 && windows[0].start === '00:00' && windows[0].end === '24:00'
        ? "全天 24小时"
        : windows.map(w => `${w.start} - ${w.end}`).join(', ');

    return { hours, windows, display };
}

// ── Phase 3: Secondary Live Fetch Skeletons ───────────────────────────────────

async function fetchSecondarySource(category: string, provider: string, dateIso: string): Promise<{ windows?: StrikeWindow[], lines?: string[] } | null> {
    try {
        if (category === 'SUBWAY' || category === 'BUS') {
            if (provider.toUpperCase().includes('ATM')) {
                return await fetchATMDetails(dateIso);
            }
        } else if (category === 'AIRPORT') {
            return await fetchAviationDetails(provider, dateIso);
        }
        return null;
    } catch (e) {
        console.error('Secondary fetch failed:', e);
        return null;
    }
}

async function fetchATMDetails(dateIso: string): Promise<{ windows?: StrikeWindow[], lines?: string[] } | null> {
    // TODO: Implement ATM live status feed checking API (e.g. RSS/JSON or scraping giromilano)
    console.log(`[Phase 3] Checking ATM live alerts for ${dateIso}`);
    return null;
}

async function fetchAviationDetails(provider: string, dateIso: string): Promise<{ windows?: StrikeWindow[], lines?: string[] } | null> {
    // TODO: Implement ENAC guaranteed flights parsing or Airlines specific scraping
    console.log(`[Phase 3] Checking Aviation details for ${provider} on ${dateIso}`);
    return null;
}

async function transformRows(rawRows: RawStrikeRow[]): Promise<StrikeRecord[]> {
    const rawRecords = await Promise.all(rawRows.map(async (row) => {
        const dateIso = parseItalianDate(row.date);
        const providerNorm = await normalizeProvider(row.provider);
        const regionNorm = await translateText(row.region);
        const category = resolveCategory(row.provider, row.sector);

        let status: StrikeStatus = 'CONFIRMED';
        const combinedRaw = `${row.provider} ${row.duration} ${row.note} ${row.modalita}`.toLowerCase();
        if (combinedRaw.includes('revocat') || combinedRaw.includes('differit')) {
            status = 'CANCELLED';
        } else if (combinedRaw.includes('da definire')) {
            status = 'REQUIRES_DETAIL';
        }

        const timeInfo = parseTimeWindows(row.duration, row.modalita, row.note);
        const guaranteedWins = injectGuaranteeWindows(category, dateIso, timeInfo);

        let lines = extractAffectedLines(row.note);
        // Map actual translated data if standard keywords were not found
        const excludeNotes = ['nazionale', 'provinciale', 'regionale'];
        if (lines.length === 1 && lines[0] === '全部线路' && row.note.trim().length > 3 && !excludeNotes.includes(row.note.toLowerCase().trim())) {
            const translatedNote = await translateText(row.note);
            if (translatedNote && translatedNote !== row.note) {
                // Return as a single clean badge
                lines = [translatedNote];
            }
        }

        // ----- Phase 3: Secondary Validation (Live Source Fetch) -----
        let data_source = 'MIT_PRIMARY';
        if (status === 'REQUIRES_DETAIL' || (lines.length === 1 && lines[0] === '全部线路')) {
            const secondaryResult = await fetchSecondarySource(category, providerNorm, dateIso);
            if (secondaryResult) {
                if (secondaryResult.windows && secondaryResult.windows.length > 0) {
                    timeInfo.windows = secondaryResult.windows;
                    timeInfo.display = secondaryResult.windows.map(w => `${w.start} - ${w.end}`).join(', ');
                    timeInfo.hours = "精确时段";
                }
                if (secondaryResult.lines && secondaryResult.lines.length > 0) {
                    lines = secondaryResult.lines;
                }
                status = 'CONFIRMED';
                data_source = 'SECONDARY_LIVE';
            } else if (status === 'REQUIRES_DETAIL') {
                status = 'UNCERTAIN';
            }
        }

        return {
            date: dateIso,
            category,
            provider: providerNorm,
            region: regionNorm,
            status: status,
            display_time: timeInfo.display,
            duration_hours: timeInfo.hours,
            strike_windows: timeInfo.windows,
            guarantee_windows: guaranteedWins,
            affected_lines: lines,
            data_source
        };
    }));

    // Deduplicate records by date and provider, keeping the first occurrence.
    // Also perform Aviation Aggregation for multi-union airport strikes.
    const recordsMap = new Map<string, StrikeRecord>();
    rawRecords.forEach((record) => {
        let key = `${record.date}|${record.provider}`;

        if (record.category === 'AIRPORT') {
            const combinedText = `${record.provider} ${record.affected_lines.join(' ')}`.toUpperCase();
            let airportKey = '';
            if (combinedText.includes('MALPENSA') || combinedText.includes('MXP')) airportKey = '米兰马尔彭萨机场 (MXP)';
            else if (combinedText.includes('LINATE') || combinedText.includes('LIN')) airportKey = '米兰利纳特机场 (LIN)';
            else if (combinedText.includes('BERGAMO') || combinedText.includes('ORIO') || combinedText.includes('BGY')) airportKey = '米兰贝加莫机场 (BGY)';

            if (airportKey === '米兰马尔彭萨机场 (MXP)') {
                const isHandler = record.provider.toUpperCase().includes('ALHA') || record.provider.toUpperCase().includes('HANDLING') || record.provider.toUpperCase().includes('DNATA') || record.provider.toUpperCase().includes('机场管理');
                const hasT1 = combinedText.includes('T1') || combinedText.includes('TERMINAL 1');
                const hasT2 = combinedText.includes('T2') || combinedText.includes('TERMINAL 2');

                record.affected_lines = record.affected_lines.filter(l => l !== '全部线路');

                if (hasT1 || hasT2) {
                    if (hasT1) record.affected_lines.push('MXP T1');
                    if (hasT2) record.affected_lines.push('MXP T2');
                } else if (isHandler) {
                    record.affected_lines.push('MXP T1', 'MXP T2');
                }

                if (!record.affected_lines.includes(airportKey)) record.affected_lines.unshift(airportKey);
            } else if (airportKey) {
                record.affected_lines = record.affected_lines.filter(l => l !== '全部线路');
                if (!record.affected_lines.includes(airportKey)) record.affected_lines.unshift(airportKey);
            }

            if (airportKey) {
                key = `${record.date}|AIRPORT|${airportKey}`;
                if (recordsMap.has(key)) {
                    const existing = recordsMap.get(key)!;

                    // Merge Providers
                    const providers = existing.provider.split('、');
                    if (!providers.includes(record.provider)) {
                        existing.provider = existing.provider + '、' + record.provider;
                    }

                    // Merge Lines
                    record.affected_lines.forEach(line => {
                        if (!existing.affected_lines.includes(line)) existing.affected_lines.push(line);
                    });

                    // Merge Status (Confirmed wins)
                    if (record.status === 'CONFIRMED') {
                        existing.status = 'CONFIRMED';
                    }

                    // Keep the longer duration logic or 24h fallback
                    if (record.duration_hours === '24小时' && existing.duration_hours !== '24小时') {
                        existing.strike_windows = record.strike_windows;
                        existing.duration_hours = record.duration_hours;
                        existing.display_time = record.display_time;
                    }

                    return; // Merged, do not add as new
                }
            }
        }

        if (!recordsMap.has(key)) {
            recordsMap.set(key, record);
        }
    });

    return Array.from(recordsMap.values());
}

// ── Phase 3: Supabase Upsert ──────────────────────────────────────────────────

async function upsertToSupabase(records: StrikeRecord[]): Promise<number> {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
        throw new Error(
            'Missing Supabase env vars: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY',
        );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { error, count } = await supabase
        .from('strikes')
        .upsert(records, {
            onConflict: 'date,provider',
            count: 'exact',
        });

    if (error) throw new Error(`Supabase upsert error: ${error.message}`);

    return count ?? records.length;
}

// ── Route Handler ─────────────────────────────────────────────────────────────

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<NextResponse> {
    // Simple shared-secret auth guard (set CRON_SECRET in your env)
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        // Phase 1: Fetch & filter from MIT
        const rawRows = await fetchAndFilter();
        console.log(`[sync-strikes] Fetched ${rawRows.length} matching rows from MIT`);

        if (rawRows.length === 0) {
            return NextResponse.json({
                success: true,
                message: 'No matching strikes found',
                upserted: 0,
            });
        }

        // Phase 2: Transform
        const records = await transformRows(rawRows);
        console.log(`[sync-strikes] Transformed ${records.length} records`);

        // Phase 3: Upsert to Supabase
        const upserted = await upsertToSupabase(records);
        console.log(`[sync-strikes] Upserted ${upserted} records`);

        return NextResponse.json({
            success: true,
            fetched: rawRows.length,
            upserted,
            records,
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[sync-strikes] Error:', message);
        return NextResponse.json(
            { success: false, error: message },
            { status: 500 },
        );
    }
}
