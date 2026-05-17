export type AppLanguage = 'zh' | 'en';

export const LANGUAGE_STORAGE_KEY = 'italy_strike_language';

export function detectBrowserLanguage(): AppLanguage {
    if (typeof navigator === 'undefined') return 'zh';
    const languages = navigator.languages?.length ? navigator.languages : [navigator.language];
    const primary = (languages.find(Boolean) || '').toLowerCase();
    if (primary.startsWith('zh')) return 'zh';
    return 'en';
}

export function pickText(language: AppLanguage, zh: string, en: string) {
    return language === 'en' ? en : zh;
}

export const regionLabels: Record<AppLanguage, Record<string, string>> = {
    zh: {
        MILANO: '米兰',
        ROMA: '罗马',
        TORINO: '都灵',
        NATIONAL: '全国',
    },
    en: {
        MILANO: 'Milan',
        ROMA: 'Rome',
        TORINO: 'Turin',
        NATIONAL: 'Nationwide',
    },
};

export const categoryLabels: Record<AppLanguage, Record<string, string>> = {
    zh: {
        TRAIN: '火车',
        SUBWAY: '地铁',
        BUS: '公交',
        AIRPORT: '机场',
    },
    en: {
        TRAIN: 'Train',
        SUBWAY: 'Metro',
        BUS: 'Bus',
        AIRPORT: 'Airport',
    },
};

export const categoryTitles: Record<AppLanguage, Record<string, string>> = {
    zh: {
        TRAIN: '火车罢工',
        SUBWAY: '地铁罢工',
        BUS: '公交罢工',
        AIRPORT: '机场罢工',
        OTHER: '其他罢工',
    },
    en: {
        TRAIN: 'Train Strike',
        SUBWAY: 'Metro Strike',
        BUS: 'Bus Strike',
        AIRPORT: 'Airport Strike',
        OTHER: 'Other Strike',
    },
};

const providerTranslations: Array<[RegExp, string]> = [
    [/米兰交通局人员|ATM/i, 'ATM Milan staff'],
    [/易捷航空机组与飞行员|易捷航空人员|EASYJET/i, 'easyJet pilots and cabin crew'],
    [/阿尔哈地服人员|ALHA/i, 'ALHA ground handling staff'],
    [/BCUBE/i, 'BCUBE ground handling staff'],
    [/罗马空管中心人员/i, 'Rome air traffic control staff'],
    [/米兰空管中心人员/i, 'Milan air traffic control staff'],
    [/都灵空管中心人员/i, 'Turin air traffic control staff'],
    [/罗马机场安检人员|ADR SECURITY/i, 'Rome airport security staff'],
    [/全国公共和私营部门人员/i, 'national public and private sector workers'],
    [/铁路相关人员/i, 'rail staff'],
    [/机场相关人员/i, 'airport staff'],
    [/公共交通人员/i, 'public transport staff'],
    [/意大利国家铁路司乘人员/i, 'Ferrovie dello Stato train and onboard staff'],
    [/Sky Service机场人员/i, 'Sky Service airport staff'],
    [/意大利空管人员/i, 'Italian air traffic control staff'],
    [/马尔彭萨机场空管人员/i, 'Malpensa air traffic control staff'],
    [/机场地勤人员/i, 'airport ground handling staff'],
    [/德纳达地服人员|DNATA/i, 'dnata ground handling staff'],
    [/意大利航空机组与飞行员/i, 'ITA Airways pilots and cabin crew'],
    [/意大利航空地勤人员/i, 'ITA Airways ground staff'],
    [/伦巴第大区铁路人员|TRENORD/i, 'Trenord staff'],
    [/意大利国家铁路人员|TRENITALIA/i, 'Trenitalia staff'],
    [/伊塔洛高铁人员|ITALO/i, 'Italo staff'],
    [/RFI基础设施维护人员|RFI/i, 'RFI infrastructure staff'],
    [/相关人员/i, 'affected staff'],
];

const lineTranslations: Array<[RegExp, string]> = [
    [/马尔彭萨机场/i, 'Malpensa Airport'],
    [/利纳特机场/i, 'Linate Airport'],
    [/贝加莫机场/i, 'Bergamo Airport'],
    [/菲乌米奇诺机场/i, 'Fiumicino Airport'],
    [/钱皮诺机场/i, 'Ciampino Airport'],
    [/卡塞莱机场/i, 'Turin Caselle Airport'],
    [/米兰相关机场/i, 'Milan area airports'],
    [/罗马相关机场/i, 'Rome area airports'],
    [/都灵相关机场/i, 'Turin area airports'],
    [/全国相关机场/i, 'airports nationwide'],
    [/全部机场/i, 'all airports'],
    [/全部线路/i, 'all lines'],
    [/全部车次/i, 'all services'],
];

export function translateProvider(value: string, language: AppLanguage) {
    if (language === 'zh') return value;
    return value
        .split(/\s*\/\s*/)
        .map((part) => providerTranslations.find(([pattern]) => pattern.test(part))?.[1] || part)
        .filter(Boolean)
        .join(' / ');
}

export function translateLine(value: string, language: AppLanguage) {
    if (language === 'zh') return value;
    return lineTranslations.find(([pattern]) => pattern.test(value))?.[1] || value;
}

export function translateDuration(value: string, language: AppLanguage) {
    if (language === 'zh') return value;
    return value
        .replace(/全天\s*24小时/g, 'all day, 24 hours')
        .replace(/24小时/g, '24 hours')
        .replace(/(\d+(?:\.\d+)?)小时/g, '$1 hours')
        .replace(/多时段/g, 'multiple periods')
        .replace(/待定/g, 'TBD')
        .replace(/部分时段/g, 'partial hours');
}

export function translateAxisLabel(value: string, language: AppLanguage) {
    if (language === 'zh') return value;
    return value.replace(' (次日)', ' (next day)');
}
