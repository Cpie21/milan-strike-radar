import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { aggregateStrikes, categoryMap } from '../../../components/utils';

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const typesParam = searchParams.get('types') || 'train,subway,bus,airport';
    const selectedTypes = new Set(typesParam.toLowerCase().split(','));

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
        return new NextResponse('Internal Server Error: Missing Database Keys', { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch strikes from today onwards
    const today = new Date();
    // Use local Italy timezone approximate or just server time start of day
    const startDateStr = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().split('T')[0];

    // Alternatively, just fetch all from 30 days ago to allow calendar to see recent past too
    const startDate = new Date(today);
    startDate.setDate(today.getDate() - 30);
    const filterDateStr = startDate.toISOString().split('T')[0];

    const { data: strikes, error } = await supabase
        .from('strikes')
        .select('*')
        .gte('date', filterDateStr)
        .order('date', { ascending: true });

    if (error || !strikes) {
        return new NextResponse('Error fetching data', { status: 500 });
    }

    // Process strikes
    const aggregatedData = aggregateStrikes(strikes);

    // Filter by requested types
    const filtered = aggregatedData.filter((s: any) => {
        if (!s.category) return false;
        const cat = s.category.toLowerCase();
        return selectedTypes.has(cat);
    });

    // Build ICS String
    let icsData = "BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//Italy Strike Query//CN\nCALSCALE:GREGORIAN\nMETHOD:PUBLISH\nX-WR-CALNAME:意大利罢工预警\nX-WR-TIMEZONE:Europe/Rome\nREFRESH-INTERVAL;VALUE=DURATION:PT1H\nX-PUBLISHED-TTL:PT1H\n";

    filtered.forEach(strike => {
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

        const summary = `${catDisplay}罢工`;

        // As requested: Describe who is striking and add the website link. Don't add guarantee times.
        const description = `罢工主体: ${strike.provider}\\n\\n点击下方链接查看受影响线路和详情👇:\\nhttps://theitalystrike.com/?date=${strike.date}`;

        icsData += `BEGIN:VEVENT\n`;
        icsData += `UID:strike-${strike.id}@milanstrikeradar.com\n`;
        icsData += `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z\n`;
        icsData += `DTSTART;VALUE=DATE:${dateStr}\n`;
        icsData += `DTEND;VALUE=DATE:${nextDateStr}\n`;
        icsData += `SUMMARY:${summary}\n`;
        icsData += `DESCRIPTION:${description}\n`;
        icsData += `URL:https://theitalystrike.com/?date=${strike.date}\n`;
        icsData += `END:VEVENT\n`;
    });

    icsData += "END:VCALENDAR";

    // Return as text/calendar so it acts as an ICS file stream
    return new NextResponse(icsData, {
        headers: {
            'Content-Type': 'text/calendar; charset=utf-8',
            'Cache-Control': 's-maxage=3600, stale-while-revalidate'
        },
    });
}
