import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

// Import all translation files
import enCommon from './locales/en/common.json'
import enLogin from './locales/en/login.json'
import enPartner from './locales/en/partner.json'
import enForecast from './locales/en/forecast.json'
import enErr from './locales/en/err.json'
import arCommon from './locales/ar/common.json'
import arLogin from './locales/ar/login.json'
import arPartner from './locales/ar/partner.json'
import arForecast from './locales/ar/forecast.json'
import arErr from './locales/ar/err.json'

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: {
        common: enCommon,
        login: enLogin,
        partner: enPartner,
        forecast: enForecast,
        err: enErr
      },
      ar: {
        common: arCommon,
        login: arLogin,
        partner: arPartner,
        forecast: arForecast,
        err: arErr
      }
    },
    lng: 'en', // default language
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false
    },
    // Add namespaces
    ns: ['common', 'login', 'partner', 'forecast', 'err'],
    defaultNS: 'common'
  })

export default i18n 