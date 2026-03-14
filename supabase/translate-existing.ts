import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    throw new Error("Missing Supabase env vars");
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function translateToChinese(text: string): Promise<string> {
    const apiKey = process.env.DEEPL_API_KEY;
    if (!apiKey) return text;

    let toTranslate = text.toUpperCase();
    toTranslate = toTranslate.replace(/SOC\. /g, '');
    toTranslate = toTranslate.replace(/SOC\./g, '');
    toTranslate = toTranslate.replace(/S\.P\.A\./g, '');
    toTranslate = toTranslate.replace(/S\.R\.L\./g, '');
    toTranslate = toTranslate.replace(/S\.C\.A\.R\.L\./g, '');
    toTranslate = toTranslate.replace(/ PERSONALE /g, '');
    toTranslate = toTranslate.replace(/^PERSONALE /g, '');
    toTranslate = toTranslate.replace(/ DI VOLO /g, '飞行人员');
    toTranslate = toTranslate.replace(/ DI TERRA /g, '地勤人员');
    toTranslate = toTranslate.trim();

    try {
        const url = process.env.DEEPL_API_URL || 'https://api-free.deepl.com/v2/translate';
        const params = new URLSearchParams();
        params.append('auth_key', apiKey);
        params.append('text', toTranslate);
        params.append('target_lang', 'ZH');

        const res = await fetch(url, { method: 'POST', body: params });
        if (!res.ok) throw new Error(`DeepL translate failed: ${res.status}`);
        const json = await res.json();
        const translated = json?.translations?.[0]?.text;
        if (translated) {
            let cleaned = translated;
            // Optional shortening of common verbose text from translations
            cleaned = cleaned.replace(/航空地勤和飞行人员/g, '地勤与飞行人员');
            cleaned = cleaned.replace(/地面及飞行人员/g, '地勤与飞行人员');
            cleaned = cleaned.replace(/地面和飞行人员/g, '地勤与飞行人员');
            cleaned = cleaned.replace(/的工作人员/g, '人员');
            cleaned = cleaned.replace(/的人员/g, '人员');
            cleaned = cleaned.replace(/航空公司/g, '航司');
            return cleaned;
        }
    } catch (e) {
        console.error("Translation failed for", text, e);
    }

    return text;
}

async function run() {
    console.log("Fetching all existing strike records to translate their providers...");
    const { data: strikes, error } = await supabase.from('strikes').select('id, provider');

    if (error || !strikes) {
        return console.error("Error fetching strikes from DB:", error);
    }

    let updatedCount = 0;

    // We update them sequentially to not rate-limit the free translate API
    for (const strike of strikes) {
        // ALWAYS re-translate everything that is not the hardcoded keywords,
        // to ensure we strip "SOC" from the ones we previously translated.
        const isExcluded = ['ATM', 'Trenord', 'Trenitalia', 'Italo', 'ENAV / SEA'].includes(strike.provider);

        if (!isExcluded) {
            console.log(`Translating: [${strike.provider}]`);
            // Wait, strike.provider might already be Chinese like "SOC。 ENAV ACC 罗马员工".
            // Since we didn't save the original Italian, if it contains "SOC" we can just string replace it in Chinese directly,
            // OR we can fetch from MIT again.
            // Since we can't fetch old ones from MIT, let's just do a Chinese cleanup for existing ones:
            let cleaned = strike.provider;
            cleaned = cleaned.replace(/SOC。 /g, '');
            cleaned = cleaned.replace(/SOC。/g, '');
            cleaned = cleaned.replace(/SOC /g, '');
            cleaned = cleaned.replace(/SOC/g, '');
            if (cleaned.endsWith('...')) cleaned = cleaned.replace('...', '');

            // Re-translate just in case we can get a better full translation if we pass Italian again...
            // Wait, if it's already Chinese, translateToChinese won't hurt, Google Translate will just return Chinese.
            const translated = await translateToChinese(cleaned);
            console.log(`   -> [${translated}]`);

            if (translated !== strike.provider) {
                const { error: upErr } = await supabase.from('strikes').update({ provider: translated }).eq('id', strike.id);
                if (upErr) {
                    console.error(`Error updating ID ${strike.id}:`, upErr);
                } else {
                    updatedCount++;
                }
            }
        }
    }

    console.log(`Translation complete. Updated ${updatedCount} records.`);
}

run();
