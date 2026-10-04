import { resolveCity, cityPath } from '../../../lib/cities';
import { readCityStrikes, romeToday } from '../../../lib/strikeQuery';
import { NextRequest, NextResponse } from 'next/server';
import { aggregateStrikes, categoryMap, filterStrikesForRegion } from '../../../components/utils';

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
    const aggregatedData = filterStrikesForRegion(aggregateStrikes(regionScoped), regionTag);

    // Filter by requested types
    const filtered = aggregatedData.filter((s) => {
        if (!s.category) return false;
        const cat = s.category.toLowerCase();
        return selectedTypes.has(cat);
    });

    // Build ICS String
    let icsData = `BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//Italy Strike Query//CN\nCALSCALE:GREGORIAN\nMETHOD:PUBLISH\nX-WR-CALNAME:${regionLabel}罢工预警\nX-WR-TIMEZONE:Europe/Rome\nREFRESH-INTERVAL;VALUE=DURATION:PT1H\nX-PUBLISHED-TTL:PT1H\n`;

    filtered.forEach(strike => {
        if (!strike.date || !strike.category) return;
        const dateStr = strike.date.replace(/-/g, ''); // e.g. 20250518
        const nextDate = new Date(strike.date);
        nextDate.setDate(nextDate.getDate() + 1);
        const nextDateStr = nextDate.toISOString().split('T')[0].replace(/-/g, '');

        let catDisplay = categoryMap[strike.category] || strike.category;

        // Ensure category is Chinese
        if (catDisplay === 'TRAIN' || catDisplay === 'FERROVIARIO') catDisplay = '火车';
        if (catDisplay === 'SUBWAY' || catDisplay === 'METRO' || catDisplay === 'TRASPORTO PUBBLICO LOCALE') catDisplay = '公交';
        if (catDisplay === 'BUS' || catDisplay === 'AUTOBUS') catDisplay = '公交';
        if (catDisplay === 'AIRPORT' || catDisplay === 'AEREO') catDisplay = '机场';
        if (catDisplay === 'MARITTIMO') catDisplay = '轮船';

        const summary = `${regionLabel}${catDisplay}罢工`;
        const detailUrl = `https://theitalystrike.com${pagePath}?date=${strike.date}`;

        // As requested: Describe who is striking and add the website link. Don't add guarantee times.
        const description = `城市: ${regionLabel}\\n罢工主体: ${strike.provider}\\n罢工时段: ${strike.display_time || "具体时段待公布"}\\n官方来源: ${strike.source_url || "https://scioperi.mit.gov.it/mit2/public/scioperi"}\\n\\n点击下方链接查看受影响线路和详情👇:\\n${detailUrl}`;

        icsData += `BEGIN:VEVENT\n`;
        icsData += `UID:strike-${strike.id}-${strike.category}-${regionTag}@milanstrikeradar.com\n`;
        icsData += `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z\n`;
        if (strike.status === 'CANCELLED') icsData += `STATUS:CANCELLED\n`;
        icsData += `DTSTART;VALUE=DATE:${dateStr}\n`;
        icsData += `DTEND;VALUE=DATE:${nextDateStr}\n`;
        icsData += `SUMMARY:${summary}\n`;
        icsData += `DESCRIPTION:${description}\n`;
        icsData += `URL:${detailUrl}\n`;
        icsData += `END:VEVENT\n`;
    });

    icsData += "END:VCALENDAR";

    // Return as text/calendar so it acts as an ICS file stream
    return new NextResponse(icsData, {
        headers: {
            'Content-Type': 'text/calendar; charset=utf-8',
            'Content-Disposition': `inline; filename="${encodeURIComponent(`${regionLabel}-strike-calendar.ics`)}"`,
            'Cache-Control': 'no-store'
        },
    });
}
