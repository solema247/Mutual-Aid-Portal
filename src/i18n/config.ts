import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

// Import all translation files
import enCommon from './locales/en/common.json'
import enLogin from './locales/en/login.json'
import enPartner from './locales/en/partner.json'
import enForecast from './locales/en/forecast.json'
import enErr from './locales/en/err.json'
import enRooms from './locales/en/rooms.json'
import enDashboard from './locales/en/dashboard.json'
import arCommon from './locales/ar/common.json'
import arLogin from './locales/ar/login.json'
import arPartner from './locales/ar/partner.json'
import arForecast from './locales/ar/forecast.json'
import arErr from './locales/ar/err.json'
import arRooms from './locales/ar/rooms.json'
import arDashboard from './locales/ar/dashboard.json'

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: {
        common: enCommon,
        login: enLogin,
        partner: enPartner,
        forecast: enForecast,
        err: enErr,
        rooms: enRooms,
        dashboard: enDashboard
      },
      ar: {
        common: arCommon,
        login: arLogin,
        partner: arPartner,
        forecast: arForecast,
        err: arErr,
        rooms: arRooms,
        dashboard: arDashboard
      }
    },
    lng: 'en', // default language
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false
    },
    // Add namespaces
    ns: ['common', 'login', 'partner', 'forecast', 'err', 'rooms', 'dashboard'],
    defaultNS: 'common'
  })

export default i18n 