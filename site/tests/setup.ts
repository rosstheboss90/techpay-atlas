import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import { __clearDataCache } from '../lib/data'

afterEach(() => {
  cleanup()
  __clearDataCache()
})
