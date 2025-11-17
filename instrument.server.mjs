import * as Sentry from '@sentry/tanstackstart-react'
import dotenv from 'dotenv'

dotenv.config({ path: '.env' })

Sentry.init({
  dsn: process.env.VITE_SENTRY_DSN,
  // Adds request headers and IP for users, for more info visit:
  // https://docs.sentry.io/platforms/javascript/guides/tanstackstart-react/configuration/options/#sendDefaultPii
  sendDefaultPii: true,
})
