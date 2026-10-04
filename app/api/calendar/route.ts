import { resolveCity, cityPath } from '../../../lib/cities';
import { readCityStrikes, romeToday } from '../../../lib/strikeQuery';
import { NextRequest, NextResponse } from 'next/server';
import { aggregateStrikes, categoryMap, filterStrikesForRegion } from '../../../components/utils';
import { escapeCalendarText, serializeCalendar } from '../../../lib/ical';

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const typesParam = searchParams.get('types') || 'train,subway,bus,airport';
    const selectedTypes = new Set(typesParam.toLowerCase().split(','));
    const city = resolveCity(searchParams.get('region') || 'MILANO');
    if (!city) return NextResponse.json({ error: 'Unsupported city' }, { status: 400 });
    const regionTag = city.tag;
    const regionLabel = city.zh;
    const pagePath = cityPath(regionTag);

    const date = new Date(`${romeToday()}T12:00:00Z`);
    let strikes;
    try {
      strikes = await readCityStrikes(regionTag, date.toISOString().slice(0, 10));
    } catch {
      return NextResponse.json({ error: 'Strike data unavailable' }, { status: 503 });
    }

    // Process strikes using the same regional logic as the main app
    const regionScoped = filterStrikesForRegion(strikes, regionTag);
    const aggregatedData = filterStrikesForRegion(aggregateStrikes(regionScoped, regionTag), regionTag);

    // Filter by requested types
    const filtered = aggregatedData.filter((s) => {
        if (!s.category) return false;
        const cat = s.category.toLowerCase();
        return selectedTypes.has(cat);
    });

    const lines = [
        'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Italy Strike Query//CN',
        'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
        `X-WR-CALNAME:${escapeCalendarText(`${regionLabel}罢工预警`)}`,
        'X-WR-TIMEZONE:Europe/Rome', 'REFRESH-INTERVAL;VALUE=DURATION:PT1H', 'X-PUBLISHED-TTL:PT1H',
    ];
    filtered.forEach(strike => {
        if (!strike.date || !strike.category) return;
        const dateStr = strike.date.replace(/-/g, '');
        const nextDate = new Date(`${strike.date}T12:00:00Z`);
        nextDate.setUTCDate(nextDate.getUTCDate() + 1);
        const nextDateStr = nextDate.toISOString().slice(0, 10).replace(/-/g, '');
        const labels: Record<string, string> = { TRAIN: '火车', SUBWAY: '地铁', BUS: '公交', AIRPORT: '机场' };
        const catDisplay = labels[strike.category] || categoryMap[strike.category] || strike.category;
        const detailUrl = `https://theitalystrike.com${pagePath}?date=${strike.date}`;
        const description = [
            `城市: ${regionLabel}`, `罢工主体: ${strike.provider}`,
            `罢工时段: ${strike.display_time || '具体时段待公布'}`,
            ...(strike.has_unknown_timing ? ['另有公告的具体时段待核实'] : []),
            ...(strike.strike_events || []).map(event=>`${event.provider || '交通运营商'} ${event.unions || ''}: ${event.status === 'CANCELLED' ? '已取消' : event.windows.length ? event.windows.map(w=>`${w.start || '运营开始'} - ${w.end || '运营结束'}`).join(', ') : '具体时段待公布'}`),
            ...(strike.timing_evidence ? [
                `时段信息: ${strike.timing_evidence.confidence === 'official' ? '官方公告' : strike.timing_evidence.confidence === 'conflict' ? '来源冲突，待核实' : '外部公告，以运营商最新通知为准'}`,
                ...strike.timing_evidence.sources.map((source: { url: string; name: string }) => `时段来源: ${source.name} ${source.url}`),
            ] : []),
            `官方来源: ${strike.source_url || 'https://scioperi.mit.gov.it/mit2/public/scioperi'}`,
            '', `查看受影响线路和详情: ${detailUrl}`,
        ].join('\n');
        lines.push('BEGIN:VEVENT',
            `UID:strike-${strike.id}-${strike.category}-${regionTag}@milanstrikeradar.com`,
            `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z`);
        if (strike.status === 'CANCELLED') lines.push('STATUS:CANCELLED');
        lines.push(`DTSTART;VALUE=DATE:${dateStr}`, `DTEND;VALUE=DATE:${nextDateStr}`,
            `SUMMARY:${escapeCalendarText(`${regionLabel}${catDisplay}罢工`)}`,
            `DESCRIPTION:${escapeCalendarText(description)}`, `URL:${detailUrl}`, 'END:VEVENT');
    });
    lines.push('END:VCALENDAR');
    const icsData = serializeCalendar(lines);

    // Return as text/calendar so it acts as an ICS file stream
    return new NextResponse(icsData, {
        headers: {
            'Content-Type': 'text/calendar; charset=utf-8',
            'Content-Disposition': `inline; filename="${encodeURIComponent(`${regionLabel}-strike-calendar.ics`)}"`,
            'Cache-Control': 'no-store'
        },
    });
}
