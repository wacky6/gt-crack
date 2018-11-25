const {
    getImageDataFromPng,
    readIntermediateFile,
    DATA_DIR,
} = require('../util')

const fs = require('fs')

const files = fs.readdirSync(DATA_DIR)
const sources = files.filter(f => f.startsWith('source-'))
const getFirstDeltaName = source => source.replace('source-', 'first-delta-')

let counter = 0
for (let source of sources) {
    process.env['__SEQ'] = counter++

    const pixelBefore = getImageDataFromPng(readIntermediateFile(source))
    const pixelAfter = getImageDataFromPng(readIntermediateFile(getFirstDeltaName(source)))

    const startTime = process.hrtime()
    const offset = require('../locate2')(pixelBefore, pixelAfter)
    const recognitionTime = process.hrtime(startTime)
    const elapsedMicroSecs = Math.floor((recognitionTime[0] * 1e9 + recognitionTime[1]) / 1e3)

    console.log(`${source}\t${elapsedMicroSecs} us\t${offset || '!!!'}`)

    // TODO: ideally, check against data label (but we don't have labels)
}
