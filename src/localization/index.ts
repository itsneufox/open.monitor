import i18next from 'i18next';
import Backend from 'i18next-fs-backend';
import path from 'path';

export type SupportedLocale = 'en' | 'pt';

export class Localization {
    private static guildLocales = new Map<string, SupportedLocale>();
    private static initialized = false;

    static async init() {
        if (this.initialized) return;

        await i18next
            .use(Backend)
            .init({
                lng: 'en',
                fallbackLng: 'en',
                preload: ['en', 'pt'],
                backend: {
                    loadPath: path.join(__dirname, 'locales', '{{lng}}.json')
                },
                interpolation: {
                    escapeValue: false
                }
            });

        this.initialized = true;
    }

    static t(key: string, guildId?: string, params?: Record<string, any>): string {
        const locale = guildId ? this.getGuildLocale(guildId) : 'en';
        return i18next.t(key, { ...params, lng: locale });
    }

    static setGuildLocale(guildId: string, locale: SupportedLocale) {
        this.guildLocales.set(guildId, locale);
    }

    static getGuildLocale(guildId: string): SupportedLocale {
        return this.guildLocales.get(guildId) || 'en';
    }
}