import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

// English translations
import commonEN from './locales/en/common.json'
import dashboardEN from './locales/en/dashboard.json'
import errEN from './locales/en/err.json'
import forecastEN from './locales/en/forecast.json'
import loginEN from './locales/en/login.json'
import partnerEN from './locales/en/partner.json'
import projectsEN from './locales/en/projects.json'
import roomsEN from './locales/en/rooms.json'
import usersEN from './locales/en/users.json'
import fsystemEN from './locales/en/fsystem.json'
import f2EN from './locales/en/f2.json'
import f1_plansEN from './locales/en/f1_plans.json'
import f3EN from './locales/en/f3.json'

// Arabic translations
import commonAR from './locales/ar/common.json'
import dashboardAR from './locales/ar/dashboard.json'
import errAR from './locales/ar/err.json'
import forecastAR from './locales/ar/forecast.json'
import loginAR from './locales/ar/login.json'
import partnerAR from './locales/ar/partner.json'
import projectsAR from './locales/ar/projects.json'
import roomsAR from './locales/ar/rooms.json'
import usersAR from './locales/ar/users.json'
import fsystemAR from './locales/ar/fsystem.json'
import f2AR from './locales/ar/f2.json'
import f1_plansAR from './locales/ar/f1_plans.json'
import f3AR from './locales/ar/f3.json'

const resources = {
  en: {
    common: commonEN,
    dashboard: dashboardEN,
    err: errEN,
    forecast: forecastEN,
    login: loginEN,
    partner: partnerEN,
    projects: projectsEN,
    rooms: roomsEN,
    users: usersEN,
    fsystem: fsystemEN,
    f2: f2EN,
      f1_plans: f1_plansEN,
      f3: f3EN
  },
  ar: {
    common: commonAR,
    dashboard: dashboardAR,
    err: errAR,
    forecast: forecastAR,
    login: loginAR,
    partner: partnerAR,
    projects: projectsAR,
    rooms: roomsAR,
    users: usersAR,
    fsystem: fsystemAR,
    f2: f2AR,
      f1_plans: f1_plansAR,
      f3: f3AR
  }
}

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: 'en',
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false
    },
    defaultNS: 'common',
    ns: [
      'common',
      'dashboard',
      'err',
      'forecast',
      'login',
      'partner',
      'projects',
      'rooms',
      'users',
                'fsystem',
      'f2',
      'f1_plans',
      'f3'
    ]
  })

export default i18n 