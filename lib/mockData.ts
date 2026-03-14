export interface StrikeWindow {
    start: string;
    end: string;
    type: string;
}

export interface StrikeEvent {
    id: string;
    date: string;
    provider: string;
    status: string;
    guarantee_windows: StrikeWindow[] | null;
}

// 辅助函数：获取今天的日期的 YYYY-MM-DD 格式，确保在 page.tsx 中能正确解析
const getTodayDateString = () => {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

export const mockStrikes: StrikeEvent[] = [
    {
        id: '1',
        provider: '火车',
        status: 'active',
        date: getTodayDateString(),
        guarantee_windows: [
            {
                start: '07:00',
                end: '10:00',
                type: 'strike'
            }
        ]
    },
    {
        id: '2',
        provider: '飞机',
        status: 'upcoming',
        date: getTodayDateString(),
        guarantee_windows: [
            {
                start: '00:00',
                end: '24:00',
                type: 'strike'
            }
        ]
    }
];
