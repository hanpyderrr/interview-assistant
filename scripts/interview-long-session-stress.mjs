#!/usr/bin/env node

import { runLongSessionStress } from './lib/interview-long-session-stress.mjs'

const result = runLongSessionStress()
console.log(JSON.stringify(result, null, 2))
